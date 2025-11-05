## Sámi Chat SPA — AI Coding Agent Instructions

**Goal**: Help AI coding agents be immediately productive in this Northern Sami AI chat application.

### Architecture Overview

**Translation Flow (Core Pattern)**:
```
User (Sami) → translate sme→fin → AI provider (Finnish) → translate fin→sme → User (Sami)
```

**Key Components**:
- **Frontend**: React + TypeScript SPA built with Vite (entry: `src/main.tsx`)
- **Orchestration**: `ChatOrchestrator` in `src/services/chat-orchestrator.ts` coordinates translation → AI call → translation
- **AI Providers**: `gemini.ts` and `chatgpt.ts` implement `AIService` interface from `src/types/chat.ts`
- **Translation**: `src/services/translation.ts` wraps TartuNLP backend (default: `http://localhost:8000/translation/v2`)
- **Markdown Preservation**: `src/utils/markdown.ts` extracts/restores structure during translation (code blocks, tables, links preserved)
- **Streaming**: `ChunkAggregator` (`src/utils/chunk-aggregator.ts`) batches streaming chunks for efficient translation

**Why These Choices**:
- **Local translation**: TartuNLP backend runs locally (GPU-accelerated) for privacy and speed. Can fall back to public API.
- **Markdown segmentation**: Prevents corruption of code blocks, tables, and inline formatting during translation.
- **In-memory sessions**: No server-side session store; sessions persist in browser `sessionStorage` (see `saveSessionToStorage` in orchestrator).
- **Sequential chunk processing**: Queue-based to prevent race conditions and duplicate translations (see `ChunkAggregator` comments).

### Developer Workflows

**Setup & Run**:
```bash
npm install
npm run dev          # Start dev server → http://localhost:5173
npm run build        # TypeScript compile + Vite build
npm run preview      # Preview production build
npm run lint         # ESLint (ts/tsx)
npm test             # Run Vitest tests
```

**External Dependency**: Translation backend must run separately (not in this repo). Start it from backend repo; it typically runs on `http://localhost:8000`. Override with `VITE_TRANSLATION_API_URL` env var.

**Debugging Translation Flow**:
- Check `archive/tools/*.mjs` for standalone test scripts (e.g., `test-translation-batch.mjs` tests batch translation API)
- Use `NODE_ENV=development npm run dev` to see verbose console logs in browser
- Translation service must be configured via `configureTranslationService()` before use (throws if unconfigured)

### Critical Patterns

**Markdown Preservation** (MUST PRESERVE):
```typescript
// CORRECT: Use markdown utilities
import { extractMarkdownSegments, reconstructFromSegments } from '../utils/markdown';
const segments = extractMarkdownSegments(text);
// ...translate segments...
const result = reconstructFromSegments(segments, translations);

// WRONG: Direct string manipulation breaks formatting
const translated = text.replace(/.../, ...); // ❌ Will corrupt markdown
```

**Streaming + Translation**:
```typescript
// ChunkAggregator handles batching for translation efficiency
const aggregator = new ChunkAggregator({
  minChunkSize: 150,  // Accumulate ~2-3 sentences before translating
  onChunkReady: async (chunk) => {
    const translated = await translatePreserveFormattingChunk(chunk, 'fin-sme');
    callback.onChunk(translated);
  }
});
// Natural breaks: sentence ends (. ! ?), paragraphs (\n\n), table rows
// See hasNaturalBreak() in chunk-aggregator.ts
```

**Session Persistence**:
- Both `ChatOrchestrator` sessions AND `ChatInterface` display messages persist to `sessionStorage`
- Keys: `sami_chat_session` (orchestrator), `sami_chat_display_messages` (UI)
- Always sanitize placeholders when restoring: `sanitizePlaceholders(content)`

**Translation Service Configuration**:
```typescript
// Must configure before first use (throws if not configured)
configureTranslationService({
  service: 'local-llm' | 'tartunlp-public',
  apiUrl?: string  // Optional override
});
```

**Error Handling**:
- Services throw descriptive `Error` objects (not custom error types)
- UI shows Sami-translated errors from `src/i18n/locales/sme.json`
- Translation service retries up to 3 times with 25s client timeout

**Environment Variables**:
- Use `VITE_` prefix for Vite: `import.meta.env.VITE_TRANSLATION_API_URL`
- Scripts use `process.env.VITE_TRANSLATION_API_URL` (Node context)

**i18n (Multilingual UI)**:
- Locales: `src/i18n/locales/{sme,nb,en}.json` (Northern Sami, Norwegian, English)
- **CRITICAL**: Always preserve Sami strings when editing UI. Use `useTranslation()` hook and reference keys like `t('chatInterface.send')`.
- Default language: Northern Sami (`sme`), saved to `localStorage` as `i18nextLng`

### Adding New Features

**New AI Provider**:
1. Create `src/services/myprovider.ts` implementing `AIService` interface
2. Add provider type to `AIProvider` enum in `src/types/chat.ts`
3. Import and instantiate in `ChatOrchestrator` constructor
4. Add to provider dropdown in `ChatInterface.tsx`

**New Translation Direction**:
1. Add to `TranslationDirection` type in `translation.ts`
2. Update `translateText()` to handle new `src`/`tgt` codes
3. Test with TartuNLP backend (check model availability)

### Key Files Reference

- `chat-orchestrator.ts`: Session lifecycle, translation coordination, streaming aggregation
- `translation.ts`: Retry logic, markdown-preserving functions (`translateWithMarkdown`, `translatePreserveFormattingChunk`)
- `markdown.ts`: Segment extraction (`extractMarkdownSegments`, `extractTranslationUnits`), restoration (`reconstructFromSegments`)
- `chunk-aggregator.ts`: Streaming batch logic, natural break detection, sequential queue processing
- `gemini.ts`: Robust streaming JSON parsing (handles partial/malformed chunks)
- `ChatInterface.tsx`: Display message state, streaming UI updates, sessionStorage persistence

### Testing

- **Unit tests**: Vitest configured (`npm test`). See `archive/tests/` for historical test examples.
- **Manual testing**: Start backend → `npm run dev` → enter Sami text → verify round-trip translation
- **Translation API testing**: Use scripts in `archive/tools/` (e.g., `node archive/tools/test-translation-batch.mjs`)

### Common Pitfalls

1. **Forgetting to configure translation service**: Always call `configureTranslationService()` before translation operations
2. **Breaking markdown**: Never use regex replacements on markdown text; use `markdown.ts` utilities
3. **Chunk aggregator state**: ChunkAggregator is stateful; create new instance per streaming session
4. **Race conditions in streaming**: Don't translate chunks in parallel; use aggregator's sequential queue
5. **Placeholder leakage**: Always call `sanitizePlaceholders()` on content before displaying (removes leftover `@@BOLD_1@@` markers)

### Archive Notes

Historical documentation moved to `archive/notes/`:
- `ARCHITECTURE.md`: Detailed component diagrams
- `CHUNKING_EXPLANATION.md`: Deep dive on streaming chunk handling
- `LOCAL_TRANSLATION_SETUP.md`: Backend setup instructions
- `STREAMING_IMPLEMENTATION.md`: Streaming flow diagrams

For questions about design decisions or edge cases, check these first.
