#!/usr/bin/env node
// Demonstrate how Gemini JSON is parsed

console.log("═══════════════════════════════════════════════════════════");
console.log("  DEMONSTRATION: Gemini JSON Parsing");
console.log("═══════════════════════════════════════════════════════════\n");

// Simulate what comes over the network
const rawJSON = `{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Det er lurt å bytte når man har behov for det.\\n\\nFør gamle maskinen:** Du må vite nøyaktig hva du har, så du kan finne riktige deler. Ta bilder av alle kabler og komponenter før du starter."
          }
        ]
      }
    }
  ]
}`;

console.log("1. RAW JSON FROM GEMINI API:");
console.log("─".repeat(70));
console.log(rawJSON);
console.log("\nJSON size:", rawJSON.length, "characters");
console.log("(includes all structure, whitespace, field names, etc.)");
console.log();

// Parse it
const data = JSON.parse(rawJSON);
console.log("2. PARSED JSON OBJECT:");
console.log("─".repeat(70));
console.log("Structure:", JSON.stringify(data, null, 2).substring(0, 200) + "...");
console.log();

// Extract text
const extractedText = data.candidates[0].content.parts[0].text;
console.log("3. EXTRACTED TEXT CONTENT:");
console.log("─".repeat(70));
console.log(extractedText);
console.log("\nText length:", extractedText.length, "characters");
console.log("(ONLY the text content, no JSON structure)");
console.log();

// What gets logged
console.log("4. WHAT GETS LOGGED:");
console.log("─".repeat(70));
console.log(`[Gemini] Incremental chunk: ${extractedText.length} chars, content: ${JSON.stringify(extractedText.substring(0, 50))}`);
console.log();

// What gets sent to aggregator
console.log("5. WHAT GOES TO CHUNK AGGREGATOR:");
console.log("─".repeat(70));
console.log(`callback.onChunk("${extractedText.substring(0, 50)}...")`);
console.log("\nOnly the text string, no JSON!");
console.log();

// Comparison
console.log("═══════════════════════════════════════════════════════════");
console.log("  COMPARISON");
console.log("═══════════════════════════════════════════════════════════");
console.log(`JSON size:        ${rawJSON.length} characters ❌ (not counted)`);
console.log(`Text size:        ${extractedText.length} characters ✅ (this is what's counted)`);
console.log(`Overhead:         ${rawJSON.length - extractedText.length} characters (discarded)`);
console.log(`Efficiency:       ${Math.round(extractedText.length / rawJSON.length * 100)}% (text vs total)`);
console.log("\n✅ Only the actual text content is counted and processed!");
console.log("═══════════════════════════════════════════════════════════\n");
