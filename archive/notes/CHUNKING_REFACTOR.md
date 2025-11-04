# Chunking and Streaming Refactor

## Summary
Refactored the `ChunkAggregator` to use queue-based sequential processing instead of parallel processing with race conditions. This fixes duplicate/overlapping translation issues and reduces API traffic.

## Problems Fixed

### 1. **Race Conditions and Duplicates**
**Before:** Multiple translations could run in parallel, and pending chunks were concatenated and recursively processed, leading to:
- Same text sent multiple times with different split boundaries
- Non-atomic split operations causing inconsistent state
- Overlapping translations of the same content

**After:** Sequential queue-based processing ensures:
- Each chunk of text is translated exactly once
- Proper ordering maintained
- No race conditions between concurrent operations

### 2. **Excessive API Calls**
**Before:** 
- `minChunkSize`: 50 characters (too small, ~0.5 sentences)
- A 500-word AI response (~3000 chars) could trigger 60+ translation API calls
- Each API call has overhead: network latency (50-200ms) + processing (200-500ms)

**After:**
- `minChunkSize`: 200 characters (2-3 sentences)
- Same 500-word response now triggers ~15 translation calls (4x reduction)
- Better user experience with less stuttering

## Architecture Changes

### Queue-Based Processing

```typescript
// Before: Parallel with race conditions
private activeTranslations: Set<Promise<void>> = new Set();
private pendingChunk: string = '';

// After: Sequential queue
private translationQueue: QueuedChunk[] = [];
private isProcessing: boolean = false;
private sentTexts: Set<string> = new Set(); // Deduplication
```

### Flow

**Before (Parallel):**
```
Chunk arrives → Check if can start new translation
              → If yes: Start translation (don't await)
              → If no: Concatenate to pendingChunk
              → When translation finishes: Recursively process pendingChunk
```

**After (Queue):**
```
Chunk arrives → Accumulate
              → Check natural break
              → If break + size met: Add to queue
              → Process queue sequentially (one at a time)
              → Track sent texts to prevent duplicates
```

### Key Improvements

1. **Deduplication**: Tracks sent text hashes to skip duplicates
2. **Atomic Operations**: Queue operations are sequential, no concurrent state modifications
3. **Simpler Reasoning**: One translation at a time, clear state transitions
4. **Better Logging**: Clear queue status, processing state

## Configuration Changes

### chat-orchestrator.ts

```typescript
// Before
new ChunkAggregator(
  onTranslate,
  800,  // minTimeBetweenTranslations
  50,   // minChunkSize
  2     // maxConcurrentTranslations
)

// After
new ChunkAggregator(
  onTranslate,
  0,    // Not used with queue
  200,  // minChunkSize (4x larger)
  1     // Always 1 for sequential
)
```

## Performance Impact

### API Traffic Reduction
- **Before**: ~60 translation calls for 500-word response
- **After**: ~15 translation calls (75% reduction)
- **Benefit**: Faster response, less server load, lower latency

### Translation Quality
- Larger chunks provide better context for translation
- 2-3 sentences together vs. sentence fragments
- More natural Sami translations

### User Experience
- Slightly longer delay before first chunk appears (200 chars vs 50)
- But smoother streaming afterward (less stuttering)
- Overall faster completion due to reduced API overhead

## Testing

Existing tests for `hasNaturalBreak` and `splitAtLastBreak` remain valid - these helper functions are unchanged. The refactor only changes the orchestration logic.

## Backward Compatibility

Constructor signature remains compatible:
- `minTimeBetweenTranslations`: Accepted but ignored (prefixed with `_`)
- `maxConcurrentTranslations`: Accepted but ignored (prefixed with `_`)
- Existing code will continue to work

## Future Improvements

1. **Adaptive Chunk Sizing**: Adjust `minChunkSize` based on streaming speed
2. **Priority Queue**: Urgent chunks (e.g., user questions) could jump the queue
3. **Batch Translation API**: If backend supports it, batch multiple queued items
4. **Metrics**: Track API call count, latency, chunk sizes for optimization

## Migration Notes

No changes needed in calling code. The orchestrator automatically uses the new implementation with optimal settings.

To revert to old behavior (not recommended):
```typescript
new ChunkAggregator(onTranslate, 800, 50, 2)
```

To use even larger chunks (experimental):
```typescript
new ChunkAggregator(onTranslate, 0, 300, 1) // ~4-5 sentences
```
