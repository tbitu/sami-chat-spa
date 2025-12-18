import http from 'node:http';
import { URL } from 'node:url';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const port = Number(process.env.PORT || process.env.SERVER_PORT || 8788);
const allowOrigin = process.env.CORS_ALLOW_ORIGIN || '*';
const openaiKey = process.env.SERVER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const geminiKey = process.env.SERVER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const openaiModel = process.env.SERVER_OPENAI_MODEL || 'gpt-5-mini';
const geminiModel = process.env.SERVER_GEMINI_MODEL || 'gemini-flash-latest';

function writeCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, payload) {
  writeCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function getServerConfig() {
  const providers = {
    gemini: geminiKey ? { enabled: true, model: geminiModel } : { enabled: false },
    chatgpt: openaiKey ? { enabled: true, model: openaiModel } : { enabled: false },
  };

  if (!providers.gemini.enabled && !providers.chatgpt.enabled) {
    return null;
  }

  return {
    proxyBaseUrl: '',
    providers,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function extractOpenAIContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map(part => (part && typeof part.text === 'string') ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

async function proxyChatGPT(body, res, stream = true, abortSignal) {
  if (!openaiKey) {
    return { status: 501, payload: { error: 'ChatGPT proxy not configured' } };
  }

  const { messages, systemInstruction, model } = body || {};
  if (!Array.isArray(messages)) {
    return { status: 400, payload: { error: 'Missing messages array' } };
  }

  const prepared = [];
  if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
    prepared.push({ role: 'system', content: systemInstruction.trim() });
  }
  for (const msg of messages) {
    if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') continue;
    prepared.push({ role: msg.role, content: msg.content });
  }

  const requestBody = {
    model: typeof model === 'string' && model.trim() ? model.trim() : openaiModel,
    messages: prepared,
    stream,
  };

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal: abortSignal,
  });

  if (!stream) {
    const text = await response.text();
    if (!response.ok) {
      return { status: response.status, payload: { error: `OpenAI error: ${response.statusText}`, body: text } };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return { status: 502, payload: { error: 'Failed to parse OpenAI response' } };
    }
    const choice = data?.choices?.[0]?.message?.content;
    const content = extractOpenAIContent(choice);
    if (!content) {
      return { status: 502, payload: { error: 'No content returned from OpenAI' } };
    }
    return { status: 200, payload: { content } };
  }

  // Streaming path: relay SSE-like chunks to client
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    return { status: response.status, payload: { error: `OpenAI error: ${response.statusText}`, body: text } };
  }

  writeCorsHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx/Apache-friendly hint
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    }
  } catch (err) {
    // client aborts will surface here; swallow quietly
  } finally {
    res.end();
  }

  return null; // streamed response already sent
}

function convertToGeminiMessages(messages = []) {
  return messages
    .filter(msg => msg && typeof msg.role === 'string' && typeof msg.content === 'string')
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
}

async function proxyGemini(body) {
  if (!geminiKey) {
    return { status: 501, payload: { error: 'Gemini proxy not configured' } };
  }

  const { messages, systemInstruction, model } = body || {};
  if (!Array.isArray(messages)) {
    return { status: 400, payload: { error: 'Missing messages array' } };
  }

  const requestBody = {
    contents: convertToGeminiMessages(messages),
    systemInstruction: systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()
      ? { parts: [{ text: systemInstruction.trim() }] }
      : undefined,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };

  const modelName = typeof model === 'string' && model.trim() ? model.trim() : geminiModel;
  const endpoint = `${GEMINI_BASE}/${modelName}:generateContent?key=${geminiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const text = await response.text();
  if (!response.ok) {
    return { status: response.status, payload: { error: `Gemini error: ${response.statusText}`, body: text } };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { status: 502, payload: { error: 'Failed to parse Gemini response' } };
  }

  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content || typeof content !== 'string') {
    return { status: 502, payload: { error: 'No content returned from Gemini' } };
  }

  return { status: 200, payload: { content: content.trim() } };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    writeCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');

  if (url.pathname === '/api/server-config' && req.method === 'GET') {
    const cfg = getServerConfig();
    if (!cfg) {
      notFound(res);
      return;
    }
    sendJson(res, 200, cfg);
    return;
  }

  if (url.pathname === '/api/proxy/chatgpt' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const stream = body?.stream !== false; // default: streaming on
      const abortController = new AbortController();
      req.on('close', () => abortController.abort());
      const result = await proxyChatGPT(body, res, stream, abortController.signal);
      if (result) {
        sendJson(res, result.status, result.payload);
      }
    } catch (err) {
      sendJson(res, 500, { error: 'Unexpected error', message: err?.message || String(err) });
    }
    return;
  }

  if (url.pathname === '/api/proxy/gemini' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = await proxyGemini(body);
      sendJson(res, result.status, result.payload);
    } catch (err) {
      sendJson(res, 500, { error: 'Unexpected error', message: err?.message || String(err) });
    }
    return;
  }

  notFound(res);
});

server.listen(port, () => {
  const cfg = getServerConfig();
  const available = cfg ? Object.entries(cfg.providers).filter(([, v]) => v.enabled).map(([name]) => name).join(', ') : 'none';
  console.log(`[ai-proxy] listening on :${port} (providers: ${available || 'none'})`);
});
