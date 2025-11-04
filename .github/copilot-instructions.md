## Sami Chat SPA — Copilot Instructions

Goal: Help developers be productive quickly. Focus on the SPA frontend and how it coordinates with the local translation backend.

High-level architecture
- Frontend (this repo): React + TypeScript SPA built with Vite. Entry: `src/main.tsx`, UI: `src/App.tsx` and `src/components/*`.
- Services: `src/services/` contains orchestration and provider adapters:
  - `chat-orchestrator.ts` — central flow: translate (sme→nor), call AI provider, translate back (nor→sme).
  - `translation.ts` — client side API wrapper to local TartuNLP backend (default `http://localhost:8000/translation/v2`).
  - `chatgpt.ts` / `gemini.ts` — provider implementations. They implement the `AIService` interface in `src/types/chat.ts`.
- Utilities: `src/utils/markdown.ts` preserves markdown structure during translation (extract segments, preserve code blocks/links).

Why some design choices
- Translations happen locally (TartuNLP backend) to preserve privacy and speed. `translation.ts` prefers a local service but can be configured to use the public TartuNLP API.
- Markdown is split into segments before translation to avoid corrupting code blocks, tables and inline elements. See `extractMarkdownSegments`, `applyTranslations` in `src/utils/markdown.ts`.
- Chat sessions are kept in-memory in `ChatOrchestrator` (no server-side session store). Session lifecycle: `createSession`, `sendMessage`/`sendMessageStreaming`, `clearSession`.

Developer workflows (concrete)
- Install and run frontend (Vite):
  - npm install
  - npm run dev  (open http://localhost:5173)
- Build: `npm run build` (runs `tsc` then `vite build`). Preview: `npm run preview`.
- Lint: `npm run lint` (ESLint configured for ts/tsx).
-- The translation backend is a separate repository/service and must be started independently. Default frontend translation URL: `http://localhost:8000/translation/v2`.

Note: The translation backend is external to this repository. Start it from the backend repository (or a deployed service). See the project's top-level `README.md` and `LOCAL_TRANSLATION_SETUP.md` for links and instructions.

Important patterns and conventions
- Environment
  - Vite `import.meta.env.VITE_TRANSLATION_API_URL` is used by `src/services/translation.ts`. Scripts may fall back to `process.env.VITE_TRANSLATION_API_URL` for node-side runs.
- Error handling
  - Services generally throw Errors with descriptive messages; UI components show translated Sami error strings (see `ChatInterface.tsx` message error handling).
- Streaming
  - Both `ChatGPTService` and `GeminiService` provide `streamMessage` implementations; orchestrator uses a `ChunkAggregator` (`src/utils/chunk-aggregator.ts`) to batch/translate chunks.
- Adding providers
  - Add a service in `src/services/` implementing `AIService` and add the enum/type in `src/types/chat.ts`. Update UI provider dropdown in `ChatInterface.tsx`.

Key files to inspect for changes or examples
- `src/services/translation.ts` — network retries, API selection (`local-llm` vs `tartunlp-public`), markdown-preserving translation functions used by orchestrator.
- `src/services/chat-orchestrator.ts` — orchestrates translation, provider calls, streaming handling and aggregator usage.
- `src/utils/markdown.ts` — canonical example of how to preserve markdown while translating; reuse these helpers rather than ad-hoc string replacements.
- `src/services/gemini.ts` — example of robust streaming JSON parsing and helpful API error messages.

Quick editing guidelines for Copilot/AI changes
- When changing translation flow, keep markdown extraction/restoration intact. Tests or manual checks should include code blocks, tables, links and inline formatting.
- If you add environment variables, prefer `VITE_` prefix (Vite convention) and document usage in `README.md`.
- Preserve existing user-visible Sami strings in `src/i18n/locales/*.json` when touching UI.

Local testing checklist
- Start backend translation server (see the translation backend repository's README).
- Run `npm run dev` and open the app. Verify: entering Sami text -> translated -> AI provider response -> Sami translation returned; test both Gemini and ChatGPT if keys available.

If something is missing
- If you need runtime secrets (API keys), the app expects them to be entered in the UI (they are kept only in browser memory). See `src/components/ApiConfig.tsx` for where keys are stored.

Questions for the repo owner
- Are there recommended Gemeni/OpenAI model names to prefer by default? (`gemini.ts` has a `DEFAULT_MODEL`)
- Any CI or test commands to add here beyond `npm run lint` and `npm run build`?

End of instructions.
