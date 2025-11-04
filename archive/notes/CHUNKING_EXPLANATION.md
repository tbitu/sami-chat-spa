# How Chunking Actually Works

## TL;DR: Chunks are ALWAYS Complete Sentences

✅ **Chunks are created ONLY at natural break points** (sentence endings, paragraphs, etc.)  
✅ **Never splits mid-sentence or mid-word**  
✅ **200 chars is a MINIMUM, not an exact size**  
✅ **Markdown formatting is preserved** (no breaking inside `**bold**`, `*italic*`, etc.)

## The Algorithm

### Step 1: Accumulate Text
```typescript
accumulated = "Hello! This is the first sentence. Now we have"
                                                           ↑
                                                    (still accumulating)
```

### Step 2: Check for Natural Break
```typescript
accumulated = "Hello! This is the first sentence. Now we have more."
                                                                    ↑
                                                             (period found!)

hasNaturalBreak(accumulated) → TRUE ✅
```

### Step 3: Find Last Complete Sentence
```typescript
splitAtLastBreak(accumulated)
  → Searches for: . ! ? followed by space
  → Returns: ["Hello! This is the first sentence. Now we have more. ", ""]
                                                                      ↑
                                                            (splits AFTER period + space)
```

### Step 4: Check Minimum Size
```typescript
toTranslate = "Hello! This is the first sentence. Now we have more. "
              (60 chars total)

if (60 >= 200) → FALSE ❌
  → Don't send yet, keep accumulating
```

### Step 5: Keep Accumulating Until Threshold Met
```typescript
accumulated = "Hello! This is the first sentence. Now we have more. 
               Here is another sentence. And another one. We continue 
               writing until we reach about 200 characters or so. 
               This should be enough now."
               (220 chars)

Natural break? YES ✅
Size >= 200?   YES ✅
  → Send for translation! 🚀
```

## Real Example: Streaming AI Response

### Scenario: AI generates text word by word

```
Time  | Accumulated Text                                    | Action
------|-----------------------------------------------------|--------
0.0s  | "Machine"                                          | No break, accumulate
0.1s  | "Machine learning"                                 | No break, accumulate
0.2s  | "Machine learning is"                              | No break, accumulate
0.3s  | "Machine learning is a"                            | No break, accumulate
0.4s  | "Machine learning is a subset."                    | Break found! But < 200 chars
0.5s  | "Machine learning is a subset. It"                 | Break + accumulating
0.6s  | "Machine learning is a subset. It enables"         | Break + accumulating
...   | ...                                                 | ...
2.0s  | "Machine learning is a subset. It enables          | Break found!
      |  systems to learn from data. There are three       | 215 chars > 200 ✅
      |  types: supervised, unsupervised, and              | → SEND TO TRANSLATION
      |  reinforcement learning."                          |
      |                                                     |
      | Remaining: ""                                      | (nothing left)
2.5s  | "In supervised"                                    | Accumulating new chunk
2.6s  | "In supervised learning"                           | Accumulating
...   | ...                                                 | ...
```

### What Gets Sent to Translation API

**Chunk 1:**
```
"Machine learning is a subset. It enables systems to learn from data. There are three types: supervised, unsupervised, and reinforcement learning."
```
- ✅ Complete sentences
- ✅ 215 characters (> 200 minimum)
- ✅ Ends at sentence boundary

**NOT this:**
```
"Machine learning is a subset. It enables systems to learn from data. There are three types: supervised, unsupervised, and reinforcement lear"
                                                                                                                                           ↑
                                                                                                                                   ❌ NEVER cuts mid-word!
```

## Natural Break Points Detected

### 1. Sentence Endings
```typescript
"This is a sentence."     ✅ Break after period + space
"Is this a question?"     ✅ Break after question mark + space
"What an exclamation!"    ✅ Break after exclamation + space
"Word"                    ❌ No punctuation, keep accumulating
```

### 2. Paragraph Breaks
```typescript
"First paragraph.\n\nSecond paragraph"
                 ↑↑
                 ✅ Break at double newline
```

### 3. Markdown-Safe Breaking
```typescript
"Use **bold text.**"           ✅ Can break (markdown closed)
"Use **bold text."             ❌ Cannot break (unclosed **)
"See [link](url). Next"        ✅ Can break (link complete)
"See [link"                    ❌ Cannot break (unclosed [)
"Run `code.sh`. Next"          ✅ Can break (code complete)
"Run `code"                    ❌ Cannot break (unclosed `)
```

### 4. Code Blocks
```typescript
"```\ncode here\n```\n"        ✅ Can break after closing ```
"```\ncode here"               ❌ Cannot break (unclosed block)
```

## Size Threshold Behavior

### Minimum Size: 200 chars

```
Scenario A: Natural break found, but too small
─────────────────────────────────────────────
Accumulated: "This is short."  (15 chars)
Natural break: YES ✅
Size check: 15 < 200 ❌
Action: Keep accumulating, don't send yet

Scenario B: Natural break + enough size
─────────────────────────────────────────────
Accumulated: "This is a longer sentence with more content. 
              It continues with additional information that 
              makes it surpass the minimum threshold of 
              two hundred characters needed."  (210 chars)
Natural break: YES ✅
Size check: 210 >= 200 ✅
Action: Send for translation! 🚀

Scenario C: Long text but no natural break yet
─────────────────────────────────────────────
Accumulated: "This is a very long run-on sentence without 
              any punctuation that just keeps going and 
              going and going for over two hundred chars"
              (150 chars, no period yet)
Natural break: NO ❌
Action: Keep accumulating (waiting for . ! ? or paragraph)
```

## Edge Cases Handled

### 1. Markdown Inside Sentences
```typescript
Input stream: "The **solution** is simple. Next sentence."

Process:
1. Accumulate: "The **solution** is simple."
2. Check break: Period found ✅
3. Check markdown: ** appears twice (closed) ✅
4. Check size: < 200 chars, keep accumulating
5. More text arrives: "The **solution** is simple. Next sentence."
6. Split at last break: "The **solution** is simple. Next sentence. "
7. Send complete chunk with markdown intact ✅
```

### 2. Multiple Sentences Batched Together
```typescript
Input: "Short. Also short. Still short. Getting longer now. 
        And we continue to add more sentences. Until we finally 
        reach the minimum threshold of two hundred characters. 
        This should do it."

Split point: After "This should do it. "
            (finds LAST complete sentence >= 200 chars)
Result: Entire 230-char block sent as one chunk ✅
```

### 3. Very Long Single Sentence
```typescript
Input: "This is an extremely long sentence that goes on and on 
        without any punctuation for a very long time and keeps 
        adding more and more words and clauses and continues to 
        grow beyond two hundred characters but still hasn't 
        ended yet because there's no period"
        (250+ chars, but no period!)

Action: Keep accumulating ⏳
        Wait for sentence to end naturally
        Only send when . ! ? appears ✅
```

## Why This Approach is Correct for Translation

### ✅ Complete Context
```
Translation API receives:
"Machine learning is a subset. It enables systems to learn."

✅ Complete thoughts
✅ Proper sentence structure  
✅ Translator can understand full context
✅ Better translation quality
```

### ❌ What We Avoid
```
Translation API would receive:
"Machine learning is a subset. It enables systems to le"
                                                       ↑
                                          ❌ Incomplete word!
❌ Translator confused
❌ Poor translation quality
❌ Possible errors
```

## Configuration

### Current Settings (Optimal)

```typescript
minChunkSize: 200 chars
```

**Why 200?**
- Approximately 2-3 sentences in English/Norwegian
- Enough context for quality translation
- Not too large (keeps streaming responsive)
- Not too small (reduces API calls)

### You Could Adjust

```typescript
// More responsive, more API calls
minChunkSize: 150  // 1-2 sentences

// Less responsive, fewer API calls  
minChunkSize: 300  // 3-5 sentences

// Our sweet spot
minChunkSize: 200  // 2-3 sentences ✅
```

## Summary

**The system NEVER cuts mid-word or mid-sentence.**

1. Text accumulates in a buffer
2. When a natural break is detected (. ! ? paragraph, etc.)
3. AND accumulated text is >= 200 characters
4. THEN and ONLY THEN is the chunk sent for translation
5. The split happens AFTER the sentence ending punctuation
6. Markdown formatting is always preserved

**Result:** Translation API always receives complete, well-formed sentences with full context. 🎯
