#!/usr/bin/env node
import process from 'process';

const apiUrl = process.env.VITE_TRANSLATION_API_URL || 'https://api.tartunlp.ai/translation/v2';

const units = [
  'Levering til godkjent mottak:',
  'Noen bensinstasjoner eller bilverksteder har også lov til å ta imot mindre mengder farlig avfall som motorolje.',
  'Dette er viktig for at oljen skal renses og behandles uten å skade naturen.'
];

const variants = [
  '|', ' | ', '||', ' || ', '|||', ' ||| ',
  '~', ' ~ ', '~~', ' ~~ ', '###', ' ### ', '::', ' :: ', '||~||', ' |~| ', ' <SEP> ', '<SEP>'
];

async function testVariant(v) {
  const joined = units.join(v);
  try {
    const res = await fetch(apiUrl, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ text: joined, src: 'nor', tgt: 'sme' })
    });
    const ok = res.ok;
    const text = ok ? (await res.json()).result : await res.text();
    const parts = ok ? text.split(v) : [];
    const preserved = ok && parts.length === units.length;
    console.log(`\nVariant: '${v}' | preserved: ${preserved} | parts out: ${parts.length}`);
    if (preserved) parts.forEach((p,i)=>console.log(`  ${i+1}: ${p}`));
    else console.log('  preview:', text.slice(0,200).replace(/\n/g,'\\n'));
  } catch (err) {
    console.error('Error', err.message || err);
  }
}

(async()=>{
  console.log('Testing separator variants against', apiUrl);
  for (const v of variants) {
    await testVariant(v);
  }
})();
