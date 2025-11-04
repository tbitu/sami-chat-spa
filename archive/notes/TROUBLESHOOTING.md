# Streaming Troubleshooting Guide

## Fixed Issues (Latest Update)

### Problem: 408 Timeout from Translation API

**Root Causes Fixed:**
1. ❌ Wrong Gemini API endpoint format (`alt=sse` doesn't exist) - FIXED
2. ❌ No timeout handling for hung requests - FIXED
3. ❌ No fallback when streaming fails - FIXED
4. ❌ Translation API timeouts (15+ seconds) - FIXED
5. ❌ Too many concurrent translation requests overwhelming API - FIXED

**Solutions Applied:**

#### 1. Fixed Gemini Streaming Endpoint
```typescript
// WRONG (was causing 408)
fetch(`${apiUrl}?alt=sse&key=${this.apiKey}`)

// CORRECT (Gemini returns JSON lines, not SSE)
fetch(`${apiUrl}?key=${this.apiKey}`)
```

#### 2. Proper JSON Parsing
Gemini returns newline-delimited JSON objects, not SSE format:
```json
{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}
{"candidates":[{"content":{"parts":[{"text":" there"}]}}]}
```

#### 3. Added Timeout Protection
- 30-second timeout if no data received
- Prevents eternal spinner on hung connections
- Clears timeout once first chunk arrives

#### 4. Automatic Fallback
- If streaming fails → automatically retries with non-streaming
- User still gets response even if streaming breaks
- Logs warning to console for debugging

#### 5. Translation API Timeout & Retry
```typescript
// 15-second timeout per translation
const controller = new AbortController();
setTimeout(() => controller.abort(), 15000);

// Auto-retry on 408 or 5xx errors (up to 2 retries)
if (response.status === 408 || response.status >= 500) {
  return translateText(text, direction, retryCount + 1);
}
```

#### 6. Rate Limiting Translation Requests
```typescript
// Reduced concurrent translations from 3 → 2
// Increased time between translations from 500ms → 800ms
// Added 200ms delay between starting new translations
const aggregator = new ChunkAggregator(
  translateFunction,
  800,  // Wait 800ms between translation batches
  50,   // Min 50 chars
  2     // Max 2 concurrent (gentler on API)
);
```

## Debugging Streaming Issues

### Check Browser Console

**Expected logs (success):**
```
Translating user message from Sami to Norwegian...
Streaming message from gemini...
Translating chunk: Hello there...
Translating chunk: How are you...
AI streaming complete, flushing remaining translations...
All translations complete
```

**Problem indicators:**
```
❌ "Streaming timeout - no data received"
   → API not responding, check API key and network

❌ "Failed to parse chunk"
   → API response format changed

❌ "Gemini API error: 408"
   → Request timeout (was caused by wrong endpoint)

❌ "Streaming failed, falling back to non-streaming"
   → Streaming broken but fallback worked
```

### Test Streaming Manually

**1. Test non-streaming first:**
Comment out the streaming attempt in App.tsx:
```typescript
// Force non-streaming to test baseline
const response = await orchestrator.sendMessage(message);
return response;
```

**2. Check API directly:**
```bash
# Test Gemini API
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}'
```

**3. Check Network Tab:**
- Open DevTools → Network
- Send message
- Look for `streamGenerateContent` request
- Check response format and timing

### Common Issues

#### Issue: 408 Timeout
**Cause:** Wrong API endpoint or network issue
**Fix:** ✅ Fixed by removing `alt=sse` parameter

#### Issue: Eternal Spinner
**Causes:**
- onComplete() never called
- Translations never finish
- Promise never resolves

**Fixes Applied:**
- ✅ Timeout protection (30s)
- ✅ Proper error handling with callbacks
- ✅ Try-catch in onComplete
- ✅ Automatic fallback

#### Issue: Chunks Not Appearing
**Causes:**
- Parsing errors
- Translation API failures
- Callback not firing

**Debug:**
```typescript
// Add to chat-orchestrator.ts
onChunk: (chunk: string) => {
  console.log('RAW CHUNK:', chunk); // See raw data
  fullResponseInNorwegian += chunk;
  aggregator.addChunk(chunk).catch(console.error);
}
```

## Configuration Options

### Adjust Timeouts
In `chat-orchestrator.ts`:
```typescript
const timeoutId = setTimeout(() => {
  // ...
}, 30000); // Change 30000 to desired milliseconds
```

### Adjust Concurrency
```typescript
const aggregator = new ChunkAggregator(
  translateFunction,
  500,  // Time between translations
  50,   // Min chunk size
  3     // Max concurrent (increase if translation API is fast)
);
```

### Disable Streaming
In `App.tsx`, force non-streaming:
```typescript
if (onProgress) {
  // Comment out streaming attempt
  // const response = await orchestrator.sendMessageStreaming(message, onProgress);
  const response = await orchestrator.sendMessage(message);
  return response;
}
```

## API Response Formats

### Gemini (Newline-Delimited JSON)
```
{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}
{"candidates":[{"content":{"parts":[{"text":" world"}]}}]}
```

### OpenAI (Server-Sent Events)
```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" world"}}]}

data: [DONE]
```

## Recovery Steps

If streaming completely breaks:

1. **Check console logs** for specific error
2. **Test API key** with non-streaming first
3. **Check network connectivity**
4. **Verify API endpoint** hasn't changed
5. **Use fallback** - system auto-retries with non-streaming
6. **Clear browser cache** and reload
7. **Check API quotas** on Google AI Studio

## Success Indicators

✅ First chunk arrives within 2-3 seconds
✅ Console shows "Translating chunk" messages
✅ Text appears progressively in chat
✅ Spinner disappears when all translations done
✅ No 408 errors in network tab
