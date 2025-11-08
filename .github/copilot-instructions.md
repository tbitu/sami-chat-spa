## Sámi Chat SPA — AI Coding Agent Instructions

**Goal**: Help AI coding agents be immediately productive in this multilingual Sami AI chat application.

### Architecture Overview

**Translation Flow (Core Pattern)**:
```
User (Sami) → translate sme→fin → AI provider (Finnish) → translate fin→sme → User (Sami)
```

**Key Components**:
- **Frontend**: React 18 + TypeScript SPA built with Vite (entry: `src/main.tsx`)
- **Orchestration**: `ChatOrchestrator` in `src/services/chat-orchestrator.ts` coordinates language detection → translation → AI call → translation → validation
- **AI Providers**: `gemini.ts` (default: gemini-flash-latest) and `chatgpt.ts` implement `AIService` interface from `src/types/chat.ts`
- **Translation**: `src/services/translation.ts` wraps TartuNLP backend (default: `http://localhost:8000/translation/v2`); supports multiple Sami languages (sme, smj, sma, smn, sms)
- **Markdown Preservation**: `src/utils/markdown.ts` extracts/restores structure during translation using placeholder-free token-based segmentation
- **Language Detection**: `src/utils/language-detection.ts` validates language at 3 stages: pre-translation (Stage 1), post-LLM (Stage 2), post-translation (Stage 3)

**Why These Choices**:
- **Local translation**: TartuNLP backend runs locally (GPU-accelerated) for privacy and speed. Can fall back to public API (`tartunlp-public`).
- **Markdown segmentation**: Prevents corruption of code blocks, tables, and inline formatting. Uses `|` pipe separator for batch translation units.
- **In-memory sessions**: No server-side session store; sessions persist in browser `sessionStorage` with keys `sami_chat_session` (orchestrator) and `sami_chat_display_messages` (UI).
- **Three-stage validation**: Language detection happens at input (Stage 1), LLM output (Stage 2), and final translation (Stage 3) with retry logic.

### Developer Workflows

**Setup & Run**:
```bash
npm install
npm run dev          # Start dev server → http://localhost:5173
npm run build        # TypeScript compile + Vite build → dist/
npm run preview      # Preview production build
npm run lint         # ESLint (ts/tsx files)
npm test             # Run Vitest unit tests
```

**External Dependency**: Translation backend must run separately (not in this repo). Start it from backend repo; it typically runs on `http://localhost:8000`. Override with `VITE_TRANSLATION_API_URL` env var or select "TartuNLP Public API" in UI.

**Debugging Translation Flow**:
- Check `archive/tools/*.mjs` for standalone test scripts (e.g., `test-translation-batch.mjs` tests batch translation API)
- Use browser DevTools console to see verbose logs (translation stages, language detection, validation)
- Translation service must be configured via `configureTranslationService()` before use (throws if unconfigured)
- Language detection validates at 3 stages with automatic retries: see `MAX_LLM_LANGUAGE_RETRIES` and `MAX_TRANSLATION_RETRIES` in `chat-orchestrator.ts`

### Critical Patterns

**Markdown Preservation** (MUST PRESERVE):
```typescript
// CORRECT: Use markdown utilities for formatted text
import { extractMarkdownSegments, reconstructFromSegments } from '../utils/markdown';
const segments = extractMarkdownSegments(text);
// ...translate segments...
const result = reconstructFromSegments(segments, translations);

// WRONG: Direct string manipulation breaks formatting
const translated = text.replace(/.../, ...); // ❌ Will corrupt markdown
```

**Translation Pipeline** (Batch with Pipe Separator):
```typescript
// Batch translation units are joined with '|' separator for LLM translation
// This is the most reliably preserved separator, though context bleeding can occur
const SEP = '|';
const batchText = units.map(u => u.text).join(SEP);
const translatedBatch = await translateText(batchText, direction);
const parts = translatedBatch.split(SEP);

// Check for corruption patterns (see isCorruptedTranslation in translation.ts)
// Example: Short headers ending with ':' may get corrupted to ") help." 
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
  apiUrl?: string,  // Optional override
  samiLanguage?: 'sme' | 'smj' | 'sma' | 'smn' | 'sms'  // Default: 'sme'
});
```

**Error Handling**:
- Services throw descriptive `Error` objects (not custom error types)
- UI shows Sami-translated errors from `src/i18n/locales/sme.json`
- Translation service retries up to 3 times with 25s client timeout (AbortController)
- LLM language validation retries up to 2 times if non-Finnish output detected

**Environment Variables**:
- Use `VITE_` prefix for Vite: `import.meta.env.VITE_TRANSLATION_API_URL`
- Scripts use `process.env.VITE_TRANSLATION_API_URL` (Node context)

**i18n (Multilingual UI)**:
- Locales: `src/i18n/locales/{sme,smj,sma,smn,sms,nb,en}.json` (Sami languages, Norwegian, English)
- **CRITICAL**: Always preserve Sami strings when editing UI. Use `useTranslation()` hook and reference keys like `t('chatInterface.send')`.
- Default language: Northern Sami (`sme`), saved to `localStorage` as `i18nextLng`
- All five Sami languages supported: Northern (sme), Lule (smj), Southern (sma), Inari (smn), Skolt (sms)

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

- `chat-orchestrator.ts`: Session lifecycle, translation coordination, 3-stage language validation with retry logic
- `translation.ts`: Retry logic, markdown-preserving functions (`translateWithMarkdown`), corruption detection (`isCorruptedTranslation`)
- `markdown.ts`: Segment extraction (`extractMarkdownSegments`, `extractTranslationUnits`), restoration (`reconstructFromSegments`, `reconstructSegmentsFromUnits`)
- `language-detection.ts`: Hybrid heuristic language detection (character frequency, keywords, patterns), 3-stage validation functions
- `gemini.ts`: Robust streaming JSON parsing (handles partial/malformed chunks), model listing with filtering
- `ChatInterface.tsx`: Display message state, streaming UI updates, sessionStorage persistence

### Testing

- **Unit tests**: Vitest configured (`npm test`). See `archive/tests/` for historical test examples.
- **Manual testing**: Start backend → `npm run dev` → enter Sami text → verify round-trip translation
- **Translation API testing**: Use scripts in `archive/tools/` (e.g., `node archive/tools/test-translation-batch.mjs`)

### Common Pitfalls

1. **Forgetting to configure translation service**: Always call `configureTranslationService()` before translation operations
2. **Breaking markdown**: Never use regex replacements on markdown text; use `markdown.ts` utilities
3. **Placeholder leakage**: Always call `sanitizePlaceholders()` on content before displaying (removes leftover `@@BOLD_1@@` markers)
4. **Wrong locale files**: All 5 Sami languages have separate locale files (sme, smj, sma, smn, sms) - update all when changing UI strings
5. **Ignoring language detection stages**: 3-stage validation (Stage 1: input, Stage 2: LLM output, Stage 3: translation) is critical for quality
6. **Pipe separator context bleeding**: `|` separator can cause translation units to bleed context; use corruption detection (`isCorruptedTranslation`) to catch this

### Archive Notes

Historical documentation moved to `archive/notes/`:
- `ARCHITECTURE.md`: Detailed component diagrams
- `LOCAL_TRANSLATION_RUN.md`: Backend setup instructions (Note: filename differs from old reference)
- `DEVELOPMENT.md`: Developer notes and troubleshooting
- `TROUBLESHOOTING.md`: Common issues and solutions

For questions about design decisions or edge cases, check these first.
