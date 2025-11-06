// Validate Sami words by translating sme->nb and checking if we get valid Norwegian
import fetch from 'node-fetch';

// Get API URL from environment or use default
const API_URL = process.env.VITE_TRANSLATION_API_URL || 'http://localhost:8000/translation/v2';

const samiWords = [
  // Common verbs and particles
  'lea', 'leat', 'leamaš', 'lean', 'livččii', 'ii', 'eai', 'leage',
  // Pronouns and demonstratives
  'dát', 'dat', 'mii', 'gii', 'son', 'sii', 'don', 'mun', 'moai', 'soai',
  // Question words
  'gii', 'maid', 'man', 'gos', 'goas', 'movt', 'manna', 'goappá', 'man', 'masa',
  // Conjunctions and particles
  'go', 'vai', 'ahte', 'dahje', 'muhto', 'ja', 'dahjege', 'ge', 'fal', 'gal',
  // Common greetings and words
  'bures', 'buorre', 'giitu', 'ádja', 'báze', 'mana', 'beaivi', 'rávesolbmot',
  // Postpositions and common words
  'okta', 'guokte', 'golbma', 'njeallje', 'viđa', 'dáppe', 'doppe', 'diekko',
  // Other common words
  'čállit', 'oaidnit', 'gullan', 'jáhkku', 'sáhttá', 'háliida', 'háliidan',
  'ovdal', 'maŋŋá', 'dál', 'odne', 'ihttin', 'bearjadis', 'sámegiella', 'oahppat',
];

// Norwegian word guesses for validation (what we expect these words to mean)
const norwegianGuesses = {
  'lea': 'er',
  'leat': 'er',
  'leamaš': 'være',
  'lean': 'er',
  'livččii': 'ville være',
  'ii': 'ikke',
  'eai': 'ikke',
  'leage': 'er',
  'dát': 'dette',
  'dat': 'det',
  'mii': 'vi',
  'gii': 'hvem',
  'son': 'han',
  'sii': 'de',
  'don': 'du',
  'mun': 'jeg',
  'moai': 'vi to',
  'soai': 'de to',
  'maid': 'hva',
  'man': 'hvem',
  'gos': 'hvor',
  'goas': 'når',
  'movt': 'hvordan',
  'manna': 'hvordan',
  'goappá': 'hvilken',
  'masa': 'hvorfor',
  'go': 'om',
  'vai': 'eller',
  'ahte': 'at',
  'dahje': 'eller',
  'muhto': 'men',
  'ja': 'og',
  'dahjege': 'eller',
  'ge': 'også',
  'fal': 'jo',
  'gal': 'vel',
  'bures': 'hei',
  'buorre': 'god',
  'giitu': 'takk',
  'ádja': 'farvel',
  'báze': 'hadet',
  'mana': 'går',
  'beaivi': 'dag',
  'rávesolbmot': 'fredsfolk',
  'okta': 'en',
  'guokte': 'to',
  'golbma': 'tre',
  'njeallje': 'fire',
  'viđa': 'fem',
  'dáppe': 'her',
  'doppe': 'der',
  'diekko': 'sted',
  'čállit': 'skrive',
  'oaidnit': 'se',
  'gullan': 'høre',
  'jáhkku': 'mene',
  'sáhttá': 'kan',
  'háliida': 'vil',
  'háliidan': 'vil',
  'ovdal': 'før',
  'maŋŋá': 'etter',
  'dál': 'nå',
  'odne': 'i dag',
  'ihttin': 'i morgen',
  'bearjadis': 'på fredag',
  'sámegiella': 'samisk språk',
  'oahppat': 'lære',
};

async function translateWord(word, src, tgt) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: word, src, tgt }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      console.error(`\n  HTTP ${response.status}: ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(`\n  Error: ${error.message}`);
    } else {
      console.error(`\n  Timeout`);
    }
    return null;
  }
}

async function validateWords() {
  console.log(`Validating Sami words against ${API_URL}\n`);
  
  const results = {
    valid: [],
    invalid: [],
    errors: []
  };

  // Remove duplicates
  const uniqueWords = [...new Set(samiWords)];
  
  for (const word of uniqueWords) {
    process.stdout.write(`Testing "${word}"... `);
    
    // Translate sme -> nb
    const norwegian = await translateWord(word, 'sme', 'nob');
    
    if (norwegian === null) {
      console.log('❌ ERROR (API failed)');
      results.errors.push({ word, reason: 'API error' });
      continue;
    }
    
    // Check if result is meaningful (not just the same word back, or empty)
    const isValidTranslation = norwegian && 
                               norwegian.trim() !== '' && 
                               norwegian.toLowerCase() !== word.toLowerCase();
    
    if (isValidTranslation) {
      console.log(`✓ OK: "${norwegian}"`);
      results.valid.push({ word, norwegian });
    } else {
      console.log(`❌ INVALID: got "${norwegian}"`);
      
      // Try reverse translation from our Norwegian guess
      const guess = norwegianGuesses[word];
      if (guess) {
        process.stdout.write(`  Trying reverse: "${guess}" (nb) -> (sme)... `);
        const samiFromNorwegian = await translateWord(guess, 'nob', 'sme');
        
        if (samiFromNorwegian) {
          console.log(`Got: "${samiFromNorwegian}"`);
          results.invalid.push({ 
            word, 
            norwegian, 
            guess, 
            suggestion: samiFromNorwegian 
          });
        } else {
          console.log('ERROR');
          results.invalid.push({ word, norwegian, guess, suggestion: null });
        }
      } else {
        results.invalid.push({ word, norwegian, guess: null, suggestion: null });
      }
    }
    
    // Rate limiting: small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION RESULTS');
  console.log('='.repeat(60));
  console.log(`Valid words: ${results.valid.length}`);
  console.log(`Invalid words: ${results.invalid.length}`);
  console.log(`Errors: ${results.errors.length}`);
  
  if (results.invalid.length > 0) {
    console.log('\nINVALID WORDS (need correction):');
    for (const item of results.invalid) {
      console.log(`  "${item.word}" -> "${item.norwegian}"`);
      if (item.suggestion) {
        console.log(`    Suggested replacement: "${item.suggestion}" (from "${item.guess}")`);
      }
    }
  }
  
  if (results.errors.length > 0) {
    console.log('\nERRORS (API failures):');
    for (const item of results.errors) {
      console.log(`  "${item.word}": ${item.reason}`);
    }
  }
  
  return results;
}

validateWords().catch(console.error);
