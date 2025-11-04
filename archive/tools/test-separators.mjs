#!/usr/bin/env node
import process from 'process';

const apiUrl = process.env.VITE_TRANSLATION_API_URL || 'http://localhost:8000/translation/v2';

const testTexts = [
  'Samle oljen',
  'Dette er en test',
  'Andre setning med markdown'
];

// Test various separator characters
const separators = [
  { name: 'NEWLINE', char: '\n', code: '\\n' },
  { name: 'TAB', char: '\t', code: '\\t' },
  { name: 'VERTICAL_TAB', char: '\v', code: '\\v' },
  { name: 'FORM_FEED', char: '\f', code: '\\f' },
  { name: 'UNIT_SEP', char: '\u001F', code: '\\u001F' },
  { name: 'RECORD_SEP', char: '\u001E', code: '\\u001E' },
  { name: 'GROUP_SEP', char: '\u001D', code: '\\u001D' },
  { name: 'FILE_SEP', char: '\u001C', code: '\\u001C' },
  { name: 'PIPE', char: '|', code: '|' },
  { name: 'TILDE', char: '~', code: '~' },
  { name: 'DOUBLE_NEWLINE', char: '\n\n', code: '\\n\\n' },
];

async function testSeparator(sep) {
  console.log(`\n--- Testing: ${sep.name} (${sep.code}) ---`);
  const joined = testTexts.join(sep.char);
  console.log('Input parts:', testTexts.length);
  console.log('Joined preview:', joined.replace(/\n/g, '\\n').replace(/\t/g, '\\t').slice(0, 100));
  
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: joined, src: 'sme', tgt: 'nor' }),
    });
    
    if (!res.ok) {
      console.log('❌ Status:', res.status);
      return;
    }
    
    const data = await res.json();
    const result = data.result || '';
    console.log('Result preview:', result.replace(/\n/g, '\\n').replace(/\t/g, '\\t').slice(0, 100));
    
    const parts = result.split(sep.char);
    console.log('Output parts:', parts.length);
    
    if (parts.length === testTexts.length) {
      console.log('✅ PRESERVED! Parts match:', parts.length);
      parts.forEach((p, i) => console.log(`  ${i+1}: ${p.trim()}`));
    } else {
      console.log('❌ Split mismatch:', parts.length, 'vs', testTexts.length);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

(async () => {
  console.log('Testing separators against:', apiUrl);
  for (const sep of separators) {
    await testSeparator(sep);
  }
  console.log('\n=== Done ===');
})();
