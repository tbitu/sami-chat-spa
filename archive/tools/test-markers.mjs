#!/usr/bin/env node
import process from 'process';

const apiUrl = process.env.VITE_TRANSLATION_API_URL || 'https://api.tartunlp.ai/translation/v2';
const chunk = ' <SEP0> Levering til godkjent mottak: <SEP0>  <SEP1> Noen bensinstasjoner eller bilverksteder har også lov til å ta imot mindre mengder farlig avfall som motorolje. <SEP1>  <SEP2> Dette er viktig for at oljen skal renses og behandles uten å skade naturen. <SEP2> ';

(async ()=>{
  console.log('Sending chunk with markers to', apiUrl);
  try {
    const res = await fetch(apiUrl, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text: chunk, src: 'nor', tgt: 'sme' }) });
    const data = await res.json();
    console.log('Result:', data.result);
  } catch (err) {
    console.error(err.message || err);
  }
})();
