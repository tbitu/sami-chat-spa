#!/usr/bin/env node
// Generate sme.json by translating nb.json via TartuNLP public API
// Usage: node scripts/generate-sme-from-nb.js [key1] [key2] ...
// If keys are provided, only those keys will be translated. Otherwise, all keys are translated.

import fs from 'fs';
import path from 'path';

const API_URL = 'https://api.tartunlp.ai/translation/v2';
// Public API expects ISO codes; use 'nor' for Norwegian as required by the translation API
const SRC_LANG = 'nor';
// We will generate these Sámi locales from nb.json. Add 'sme' to update Northern Sami too.
const TARGET_LANGS = ['sme', 'sma', 'smj', 'smn', 'sms'];

function flatten(obj, prefix = '') {
  const res = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(res, flatten(v, key));
    } else {
      res[key] = v;
    }
  }
  return res;
}

function unflatten(flat) {
  const res = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.');
    let cur = res;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        cur[p] = v;
      } else {
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
    }
  }
  return res;
}

function protectPlaceholders(text) {
  const placeholders = [];
  let idx = 0;
  // Match {{...}} and %s and similar tokens
  const re = /\{\{[^}]+\}\}|%\w/g;
  const protectedText = text.replace(re, (m) => {
    const token = `@@PH${idx}@@`;
    placeholders.push({ token, original: m });
    idx++;
    return token;
  });
  return { protectedText, placeholders };
}

function restorePlaceholders(text, placeholders) {
  let out = text;
  for (const p of placeholders) {
    out = out.split(p.token).join(p.original);
  }
  return out;
}

async function translateText(text, tgt) {
  const body = JSON.stringify({ text, src: SRC_LANG, tgt, application: 'sami-ai-lab-chat' });
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        // Retry on transient statuses
        if ((res.status === 408 || res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = 1000 * Math.pow(2, attempt);
          console.warn(`Translation API transient error ${res.status}. Retrying in ${backoff}ms...`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        throw new Error(`Translation API error: ${res.status} ${res.statusText} - ${t}`);
      }

      const data = await res.json();
      return data.result;
    } catch (err) {
      // Network-level errors (fetch failures)
      if (attempt < MAX_RETRIES) {
        const backoff = 1000 * Math.pow(2, attempt);
        console.warn(`Translation request failed (attempt ${attempt + 1}). Retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Translation failed after retries');
}

async function main() {
  const nbPath = path.resolve('src/i18n/locales/nb.json');
  if (!fs.existsSync(nbPath)) {
    console.error('nb.json not found at', nbPath);
    process.exit(1);
  }

  const nb = JSON.parse(fs.readFileSync(nbPath, 'utf8'));
  const flat = flatten(nb);
  
  // Get specific keys to translate from command line arguments
  const keysToTranslate = process.argv.slice(2);
  const shouldTranslateAll = keysToTranslate.length === 0;
  
  const entries = shouldTranslateAll 
    ? Object.entries(flat)
    : Object.entries(flat).filter(([key]) => keysToTranslate.includes(key));

  if (!shouldTranslateAll) {
    console.log(`Translating ${entries.length} specific keys: ${keysToTranslate.join(', ')}`);
  }

  for (const tgt of TARGET_LANGS) {
    const outPath = path.resolve(`src/i18n/locales/${tgt}.json`);
    
    // Load existing file if it exists to preserve other translations
    let flatOut = {};
    if (fs.existsSync(outPath)) {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      flatOut = flatten(existing);
    }

    console.log(`Translating ${entries.length} strings from ${SRC_LANG} -> ${tgt} using ${API_URL}`);

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      if (typeof value !== 'string') {
        flatOut[key] = value;
        continue;
      }
      process.stdout.write(`(${i + 1}/${entries.length}) [${tgt}] ${key} ... `);
      try {
        const { protectedText, placeholders } = protectPlaceholders(value);
        const translated = await translateText(protectedText, tgt);
        const restored = restorePlaceholders(translated, placeholders);
        flatOut[key] = restored;
        console.log('ok');
      } catch (err) {
        console.error('failed:', err.message);
        process.exit(1);
      }
    }

    const out = unflatten(flatOut);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote', outPath);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
