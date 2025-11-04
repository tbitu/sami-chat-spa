#!/usr/bin/env node
import process from 'process';

// Node 18+ provides global fetch; ensure running with node >= 18
const apiUrl = process.env.VITE_TRANSLATION_API_URL || 'http://localhost:8000/translation/v2';

const testTexts = [
  'Samle oljen:␞ Hell den brukte oljen tilbake i de originale oljekannene eller i tette plastbeholdere.',
  'Dette er en test',
  'Andre setning med litt **markdown** og en lenke: [link](https://example.com)'
];

const payloads = [
  { name: 'single-text', body: { text: testTexts.join('\n'), src: 'sme', tgt: 'nor' } },
  { name: 'texts-array', body: { texts: testTexts, src: 'sme', tgt: 'nor' } },
  { name: 'items-array', body: { items: testTexts.map(t => ({ text: t, src: 'sme', tgt: 'nor' })) } },
  { name: 'batch-key', body: { batch: testTexts.map(t => ({ text: t, src: 'sme', tgt: 'nor' })) } },
];

async function tryPost(name, body) {
  console.log('\n---');
  console.log('Trying payload:', name);
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    console.log('Status:', res.status);
    try {
      console.log('JSON:', JSON.stringify(JSON.parse(txt), null, 2));
    } catch (e) {
      console.log('Text response:', txt.slice(0, 1000));
    }
  } catch (err) {
    console.error('Request failed:', err.message || err);
  }
}

(async () => {
  console.log('Testing translation endpoint:', apiUrl);
  for (const p of payloads) {
    await tryPost(p.name, p.body);
  }
  console.log('\nDone.');
})();
