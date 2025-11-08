# Sámi Chat SPA

Chat with AI assistants (Google Gemini and OpenAI ChatGPT) in **all five Sami languages**. The app translates your Sami messages to Finnish, sends them to the AI, and translates responses back to Sami using TartuNLP translation models.

## Features

- 🌐 **Multi-language support**: Northern (sme), Lule (smj), Southern (sma), Inari (smn), and Skolt (sms) Sami
- 🤖 **Dual AI providers**: Google Gemini (default: gemini-flash-latest) and OpenAI ChatGPT
- 📝 **Smart markdown preservation**: Code blocks, tables, and formatting preserved during translation
- 🔍 **3-stage language validation**: Ensures quality at input, LLM output, and translation stages
- 🔒 **Privacy-first**: API keys stored locally in browser only; supports local translation backend
- 🔄 **Intelligent retry logic**: Automatic recovery from translation and language detection issues

## Prerequisites

- **Node.js 18+** and npm
- **Translation backend** (separate service - see setup below)
  - Local backend: Runs on `http://localhost:8000` (recommended for privacy)
  - Public API: TartuNLP Public API (fallback option, selected in UI)
- **API key** from [Google Gemini](https://makersuite.google.com/app/apikey) or [OpenAI](https://platform.openai.com/api-keys)

## Quick Start

### 1. Start Translation Backend

The translation service is a separate repository. Follow its README to set up and start it (typically runs on `http://localhost:8000`).

### 2. Start This Frontend

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Usage

1. **Configure translation service**: Select between local backend or TartuNLP Public API
2. **Select Sami language**: Choose from Northern (sme), Lule (smj), Southern (sma), Inari (smn), or Skolt (sms)
3. **Enter API key**: Gemini or OpenAI API key when prompted
4. **Select AI provider**: Choose from dropdown (Gemini or ChatGPT)
5. **Start chatting**: Type your message in your chosen Sami language and click "Sádde" (Send)
6. **Toggle formatting**: Use "Bisuhit hámidivvon" checkbox to preserve markdown formatting
7. **Clear history**: Click "Ođđa ságastallan" (New conversation) to reset

## How It Works

```
User (Sami) → Detect Language (Stage 1) → Translate (sami→fin) → 
AI Provider (Finnish) → Validate Language (Stage 2) → Translate (fin→sami) → 
Validate Translation (Stage 3) → User (Sami)
```

**Translation Flow**:
1. Your Sami messages are translated to Finnish using TartuNLP models
2. Finnish text is sent to the AI (which is instructed to respond only in Finnish)
3. AI responses are validated for language correctness (with automatic retry if needed)
4. Finnish responses are translated back to your chosen Sami language
5. Translation quality is validated with corruption detection

**Key Features**:
- **Markdown preservation**: Uses token-based segmentation with pipe (`|`) separators
- **Retry logic**: Up to 3 retries for translation timeouts, 2 retries for wrong language detection
- **Client-side timeout**: 25-second AbortController timeout prevents hanging requests
- **Session persistence**: Conversations saved to browser `sessionStorage`

## Development

```bash
npm run dev      # Start dev server → http://localhost:5173
npm run build    # TypeScript compile + Vite build → dist/
npm run preview  # Preview production build
npm run lint     # Run ESLint (ts/tsx files)
npm test         # Run Vitest unit tests
```

**Environment Variables**:
- `VITE_TRANSLATION_API_URL`: Override default translation backend URL

**Testing**:
- Manual testing: `npm run dev` then test with Sami input
- Translation API tests: Run scripts in `archive/tools/` (e.g., `node archive/tools/test-translation-batch.mjs`)
- Unit tests: `npm test` (Vitest configuration included)

## Project Structure

```
src/
├── components/         # React UI components
│   ├── ApiConfig.tsx      # API key and service configuration
│   ├── ChatInterface.tsx  # Main chat UI with message display
│   ├── Message.tsx        # Individual message component
│   ├── LanguageSelector.tsx  # Sami language selection
│   └── ModelSelector.tsx     # AI model selection
├── services/          # AI and translation services
│   ├── chat-orchestrator.ts  # Coordinates translation + AI flow
│   ├── gemini.ts            # Google Gemini API integration
│   ├── chatgpt.ts           # OpenAI ChatGPT API integration
│   └── translation.ts       # TartuNLP translation service
├── utils/             # Helper utilities
│   ├── markdown.ts          # Markdown extraction/reconstruction
│   ├── language-detection.ts  # Hybrid language detection
│   └── viewport.ts          # Viewport utilities
├── types/             # TypeScript definitions
│   └── chat.ts             # Core types and interfaces
└── i18n/              # Internationalization
    └── locales/           # UI translations (sme, smj, sma, smn, sms, nb, en)
```

## Technologies

- **Frontend**: React 18, TypeScript, Vite
- **Translation**: TartuNLP OPUS-MT models for Uralic languages (sme, smj, sma, smn, sms ↔ fin)
- **AI**: Google Gemini API (gemini-flash-latest), OpenAI ChatGPT API
- **Markdown**: Marked + DOMPurify for safe rendering
- **i18n**: i18next + react-i18next for multilingual UI
- **Testing**: Vitest for unit tests

## Documentation

- **Architecture**: See `archive/notes/ARCHITECTURE.md` for detailed component diagrams
- **Translation Setup**: See `archive/notes/LOCAL_TRANSLATION_RUN.md` for backend setup
- **Development Notes**: See `archive/notes/DEVELOPMENT.md`
- **Troubleshooting**: See `archive/notes/TROUBLESHOOTING.md`
- **AI Agent Guide**: See `.github/copilot-instructions.md` for AI coding assistant instructions

## Acknowledgments

- [TartuNLP](https://tartunlp.ai/) for Sami translation models
- Google and OpenAI for AI APIs
- The Sami language community
