// Test what splitAtLastBreak does with the exact log text

const text1 = "Det er lurt å bytte når man har behov for det.\n\nFø";
const text2 = "r gamle maskinen:** Du må vite nøyaktig hva du har ";

const accumulated = text1 + text2;

console.log("Accumulated text:");
console.log(JSON.stringify(accumulated));
console.log("\nLength:", accumulated.length);

// Check for natural breaks
const hasDoubleNewline = /\n\n/.test(accumulated);
const endsWithPeriod = /[.!?](\*\*|\*|`|_)*\s*$/.test(accumulated.trimEnd());

console.log("\nNatural breaks:");
console.log("  Has \\n\\n:", hasDoubleNewline);
console.log("  Ends with punctuation:", endsWithPeriod);

// Check where double newline is
if (hasDoubleNewline) {
  const parts = accumulated.split('\n\n');
  console.log("\nSplit by \\n\\n:");
  parts.forEach((part, i) => {
    console.log(`  Part ${i}: "${part}" (${part.length} chars)`);
  });
}

// Check for sentence boundaries
const sentenceMatches = [...accumulated.matchAll(/[.!?](\*\*|\*|`|_)*\s+/g)];
console.log("\nSentence boundaries found:", sentenceMatches.length);
sentenceMatches.forEach((match, i) => {
  console.log(`  ${i + 1}. At position ${match.index}: "${match[0]}"`);
  console.log(`     Before: "...${accumulated.substring(Math.max(0, match.index - 20), match.index)}"`);
  console.log(`     After: "${accumulated.substring(match.index, match.index + 20)}..."`);
});
