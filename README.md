# Sámi Chat SPA

Chat with AI assistants (Google Gemini and OpenAI ChatGPT) in Northern Sami. The app translates your Sami messages to Finnish, sends them to the AI, and translates responses back to Sami using TartuNLP translation models.

## Features

- 🌐 Chat in Northern Sami with automatic translation
- 🤖 Support for Google Gemini and OpenAI ChatGPT
- 📝 Preserves markdown formatting in translations
- 🔒 API keys stored locally in your browser only

## Prerequisites

- **Node.js 18+** and npm
- **Translation backend** (separate service - see setup below)
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

1. Enter your Gemini or OpenAI API key when prompted
2. Select your preferred AI provider from the dropdown
3. Type your message in Northern Sami and click "Sádde" (Send)
4. Click "Čuohcat" to clear conversation history

## How It Works

```
Sami Input → Translate (sme→fin) → AI Provider → Translate (fin→sme) → Sami Output
```

Your messages are translated to Finnish, sent to the AI, and responses are translated back to Sami. The AI is informed that the conversation is being translated.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run linter
```

## Project Structure

```
src/
├── components/         # React UI components
├── services/          # AI and translation services
├── utils/             # Markdown handling, chunking
├── types/             # TypeScript definitions
└── i18n/              # Translations (sme, nb, en)
```

## Technologies

- **Frontend**: React 18, TypeScript, Vite
- **Translation**: TartuNLP OPUS-MT models (Uralic languages)
- **AI**: Google Gemini API, OpenAI API
- **Markdown**: Marked + DOMPurify

## Acknowledgments

- [TartuNLP](https://tartunlp.ai/) for Sami translation models
- Google and OpenAI for AI APIs
- The Sami language community
