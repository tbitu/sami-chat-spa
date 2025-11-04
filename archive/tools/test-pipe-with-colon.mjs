#!/usr/bin/env node
import process from 'process';

const apiUrl = process.env.VITE_TRANSLATION_API_URL || 'http://localhost:8000/translation/v2';

const testText = 'Levering til godkjent mottak:| Noen bensinstasjoner eller bilverksteder har også lov til å ta imot mindre mengder farlig avfall som motorolje.';

console.log('Testing text with pipe separator:');
console.log('Input:', testText);
console.log('Input parts (split on |):', testText.split('|').length);
testText.split('|').forEach((p, i) => console.log(`  ${i+1}: "${p}"`));

async function testTranslation(direction) {
  console.log(`\n--- Testing ${direction} ---`);
  const [src, tgt] = direction.split('-');
  
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText, src, tgt }),
    });
    
    if (!res.ok) {
      console.log('❌ Status:', res.status);
      return;
    }
    
    const data = await res.json();
    const result = data.result || '';
    console.log('Result:', result);
    console.log('Result parts (split on |):', result.split('|').length);
    result.split('|').forEach((p, i) => console.log(`  ${i+1}: "${p}"`));
    
    if (result.split('|').length === testText.split('|').length) {
      console.log('✅ Pipe preserved!');
    } else {
      console.log('❌ Pipe NOT preserved - split count mismatch');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

(async () => {
  await testTranslation('nor-sme');
  await testTranslation('sme-nor');
})();
