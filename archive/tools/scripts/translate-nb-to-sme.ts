#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { configureTranslationService, batchTranslate } from '../src/services/translation.ts';

type JsonObject = Record<string, unknown>;

function collectStrings(obj: JsonObject, prefix = ''): { keys: string[]; values: string[] } {
  const keys: string[] = [];
  const values: string[] = [];

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'string') {
      keys.push(fullKey);
      values.push(val);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = collectStrings(val as JsonObject, fullKey);
      keys.push(...nested.keys);
      values.push(...nested.values);
    } else {
      // Skip arrays and non-string leaves
    }
  }

  return { keys, values };
}

function applyTranslationsToObject(obj: JsonObject, keys: string[], translations: string[]): JsonObject {
  const out = JSON.parse(JSON.stringify(obj)) as JsonObject;
  for (let i = 0; i < keys.length; i++) {
    const pathParts = keys[i].split('.');
    let cursor: JsonObject = out;
    for (let j = 0; j < pathParts.length - 1; j++) {
      const part = pathParts[j];
      const next = cursor[part];
      if (next && typeof next === 'object' && !Array.isArray(next)) {
        cursor = next as JsonObject;
      } else {
        // Create nested object if it doesn't exist so we can apply the translation
        const newObj: JsonObject = {};
        (cursor as Record<string, unknown>)[part] = newObj;
        cursor = newObj;
      }
    }
    const last = pathParts[pathParts.length - 1];
    (cursor as Record<string, unknown>)[last] = translations[i] ?? (cursor as Record<string, unknown>)[last];
  }
  return out;
}

async function main() {
  // __dirname is not defined in ESM, derive it from import.meta.url
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const nbPath = path.resolve(__dirname, '../src/i18n/locales/nb.json');
  const outPath = path.resolve(__dirname, '../src/i18n/locales/sme.json');

  console.log('[translate] Reading', nbPath);
  const nbRaw = await readFile(nbPath, 'utf8');
  const nb = JSON.parse(nbRaw);

  const { keys, values } = collectStrings(nb);
  if (keys.length === 0) {
    console.error('[translate] No translatable strings found in nb.json');
    process.exit(1);
  }

  console.log(`[translate] Found ${keys.length} strings to translate`);

  // Configure to use TartuNLP public API (change if you want local)
  configureTranslationService({ service: 'tartunlp-public', apiUrl: '' });

  console.log('[translate] Starting batch translation via TartuNLP (nor -> sme)');
  const translations = await batchTranslate(values, 'nor-sme', 200);

  console.log('[translate] Applying translations and writing to', outPath);
  const smeObj = applyTranslationsToObject(nb, keys, translations);
  await writeFile(outPath, JSON.stringify(smeObj, null, 2), 'utf8');

  console.log('[translate] Done. Output written to', outPath);
}

main().catch(err => {
  console.error('[translate] Error:', err);
  process.exit(1);
});
