#!/usr/bin/env node
import process from 'process';

const apiUrlDefault = process.env.VITE_TRANSLATION_API_URL || 'http://localhost:8000/translation/v2';

const sample = `Samle oljen:␞ Hell den brukte oljen tilbake i de originale oljekannene eller i tette plastbeholdere. Dette er en test! Andre setning med litt **markdown** og en lenke: [link](https://example.com)`;

function splitByPunctuation(text) {
  // Match sentences including trailing punctuation. Falls back to whole text if none found.
  const matches = text.match(/[^.!?]+[.!?]+["'”’\)\]\s]*|[^.!?]+$/g);
  if (!matches) return [text];
  return matches.map(s => s.trim()).filter(Boolean);
}

function splitByNewline(text) {
  return text.split(/\n+/).map(s => s.trim()).filter(Boolean);
}

async function postText(apiUrl, body) {
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    let json = null;
    try { json = JSON.parse(txt); } catch (e) {}
    return { status: res.status, text: txt, json };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

async function runMode(apiUrl, mode, direction) {
  console.log('\n---');
  console.log(`Mode: ${mode} | Direction: ${direction} | API: ${apiUrl}`);
  const parts = mode === 'punct' ? splitByPunctuation(sample) : splitByNewline(sample);
  console.log('Parts to translate (count):', parts.length);
  parts.forEach((p, i) => console.log(`${i + 1}:`, p));
  const joined = parts.join('\n');
  const [src, tgt] = direction.split('-');
  const body = { text: joined, src, tgt };

  const res = await postText(apiUrl, body);
  if (res.error) {
    console.error('Request error:', res.error);
    return;
  }
  console.log('Status:', res.status);
  if (res.json && typeof res.json.result === 'string') {
    console.log('Result (raw):', res.json.result);
    const translatedParts = res.json.result.split('\n').map(s => s.trim()).filter(Boolean);
    console.log('\nMapped translations:');
    for (let i = 0; i < parts.length; i++) {
      console.log(`- orig: ${parts[i]}`);
      console.log(`  trans: ${translatedParts[i] ?? '(missing)'}`);
    }
  } else {
    console.log('Raw response:', res.text.slice(0, 1000));
  }
}

(async () => {
  const apiUrl = process.argv[2] || apiUrlDefault;
  const directions = ['sme-nor', 'nor-sme'];
  for (const dir of directions) {
    await runMode(apiUrl, 'punct', dir);
    await runMode(apiUrl, 'newline', dir);
  }
})();
