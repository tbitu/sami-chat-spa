#!/usr/bin/env node
// Demonstration: How chunks are created from streaming text

// Simulate the ChunkAggregator behavior
function demonstrateChunking() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  DEMONSTRATION: Chunking at Natural Breaks");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Simulated AI response streaming word by word
  const fullResponse = 
    "Machine learning is a subset of artificial intelligence. " +
    "It enables systems to learn from data without explicit programming. " +
    "There are three main types: supervised learning, unsupervised learning, " +
    "and reinforcement learning. Each type has different applications. " +
    "Supervised learning uses labeled data. It's great for classification tasks.";

  const words = fullResponse.split(' ');
  let accumulated = '';
  let chunkNumber = 1;
  const MIN_CHUNK_SIZE = 200;

  console.log("Minimum chunk size: " + MIN_CHUNK_SIZE + " characters\n");
  console.log("Streaming word by word:\n");
  console.log("─".repeat(70) + "\n");

  for (let i = 0; i < words.length; i++) {
    accumulated += (accumulated ? ' ' : '') + words[i];
    
    // Check if we have a natural break (sentence ending)
    const hasBreak = /[.!?]\s*$/.test(accumulated);
    
    if (hasBreak) {
      const size = accumulated.length;
      const meetsMinimum = size >= MIN_CHUNK_SIZE;
      
      console.log(`📝 Accumulated: "${accumulated}"`);
      console.log(`   Length: ${size} chars`);
      console.log(`   Natural break: ✅ YES (ends with punctuation)`);
      console.log(`   Meets minimum: ${meetsMinimum ? '✅ YES' : '❌ NO'} (${size} ${meetsMinimum ? '>=' : '<'} ${MIN_CHUNK_SIZE})`);
      
      if (meetsMinimum) {
        console.log(`\n🚀 CHUNK ${chunkNumber} SENT TO TRANSLATION:`);
        console.log(`   "${accumulated}"`);
        console.log(`   (${size} characters)\n`);
        console.log("─".repeat(70) + "\n");
        accumulated = '';
        chunkNumber++;
      } else {
        console.log(`   ⏳ Action: Keep accumulating (need ${MIN_CHUNK_SIZE - size} more chars)\n`);
      }
    }
  }

  // Handle any remaining text
  if (accumulated) {
    console.log(`\n🏁 FINAL CHUNK ${chunkNumber} (flush):`);
    console.log(`   "${accumulated}"`);
    console.log(`   (${accumulated.length} characters)\n`);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY:");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total chunks sent: ${chunkNumber}`);
  console.log(`  Total characters: ${fullResponse.length}`);
  console.log(`  Average chunk size: ${Math.round(fullResponse.length / chunkNumber)} chars`);
  console.log("\n  ✅ All chunks contain complete sentences");
  console.log("  ✅ No mid-word or mid-sentence splits");
  console.log("  ✅ Each chunk >= 200 chars (except possibly last)");
  console.log("═══════════════════════════════════════════════════════════\n");
}

demonstrateChunking();
