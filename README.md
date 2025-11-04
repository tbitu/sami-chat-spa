# Sámi Chat SPA

A Single Page Application (SPA) that provides a Northern Sami (Davvisámegiella) interface for chatting with AI assistants (Google Gemini and OpenAI ChatGPT). The application translates Sami text to Norwegian, sends it to the AI provider, and translates the response back to Sami using local TartuNLP translation models running on NVIDIA GPU.

## Features

- 🌐 **Bilingual Interface**: Chat in Northern Sami with automatic translation
- 🤖 **Multiple AI Providers**: Support for both Google Gemini and OpenAI ChatGPT
- 📝 **Markdown Support**: Preserves markdown formatting during translation
- 💬 **Session Management**: Maintains conversation history within sessions
- 🔒 **Privacy First**: API keys stored locally in browser only
- 📱 **Responsive Design**: Works on desktop and mobile devices
- ⚡ **GPU-Accelerated Translation**: Fast local translation using NVIDIA GPU

## How It Works

1. **User Input**: User writes a message in Northern Sami
2. **Translation to Norwegian**: Message is translated using local TartuNLP models (sme → nor)
3. **AI Processing**: Norwegian message is sent to selected AI provider (Gemini or ChatGPT)
4. **Translation to Sami**: AI response is translated back to Sami (nor → sme)
5. **Display**: Translated response is displayed to user

The AI receives a special system instruction informing it that the conversation is being translated, so it responds appropriately for Sami context.

## Prerequisites

### Frontend
- Node.js 18+ and npm

### Backend (Translation Service)
- Python 3.9+
- NVIDIA GPU with CUDA support (recommended: 4GB+ VRAM)
- CUDA Toolkit 12.4+
- PyTorch 2.5.1 with CUDA 12.4

### API Keys
- Google Gemini API key (get from [Google AI Studio](https://makersuite.google.com/app/apikey))
- OR OpenAI API key (get from [OpenAI Platform](https://platform.openai.com/api-keys))

## Quick Start

### 1. Translation backend (external)

The translation backend is a separate repository/service (not included in this frontend repo). It runs the local TartuNLP models and typically listens on `http://localhost:8000/translation/v2` by default. Follow the backend repository's README for install and startup instructions. Example steps (run in the backend repo):

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Linux/Mac
# or venv\Scripts\activate on Windows

# Install PyTorch with CUDA 12.4
pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124

# Install other dependencies
pip install -r requirements.txt

# Start the server (TartuNLP models will download automatically on first run)
./start.sh  # On Linux/Mac
# or python main.py on Windows
```

The frontend expects the translation API at `http://localhost:8000/translation/v2` by default. You can override this with the Vite env var `VITE_TRANSLATION_API_URL`.

### 2. Start the Frontend

```bash
# In a new terminal, from the project root
npm install
npm run dev
```

Open your browser to `http://localhost:5173`

## Usage

1. **Enter API Keys**: On first launch, enter your Gemini and/or OpenAI API key(s)
2. **Select Provider**: Choose between Gemini or ChatGPT from the dropdown
3. **Start Chatting**: Type your message in Northern Sami and press "Sádde" (Send)
4. **View History**: All messages in the current session are preserved
5. **Clear Chat**: Click "Čuohcat" to clear the conversation history

## API Keys

Your API keys are stored only in your browser's memory and are never sent to any server except:
- Gemini API key → Google's Gemini API
- OpenAI API key → OpenAI's ChatGPT API
- Messages → TartuNLP Translation API (no API key required)

## Translation Service

This application now uses **local TartuNLP Uralic models** from HuggingFace that run on your NVIDIA GPU for fast, private translation. The models support:
- Northern Sami (sme) ↔ Norwegian (nor)
- Optimized for Uralic language family

**Benefits of local translation:**
- ⚡ Faster translation (100-500ms vs 5-15 seconds)
- 🔒 Complete privacy (no data sent to external APIs)
- 💪 No rate limits or API timeouts
- 🎯 GPU-accelerated inference with CUDA 12.4
- 🎓 Better quality with TartuNLP Uralic-specialized models

The backend server uses the TartuNLP OPUS-MT models specifically trained for Uralic languages including Northern Sami.

For backend setup and troubleshooting, see the translation backend repository's README (this frontend repo does not contain the backend).

### Markdown Handling

The application intelligently handles markdown in translations:
- **Code blocks**: Preserved without translation
- **Tables**: Each cell translated separately
- **Lists**: Prefixes preserved, content translated
- **Headings**: Heading markers preserved, content translated
- **Inline formatting**: Bold, italic, and links handled correctly

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory. You can serve them with any static file server.

To preview the production build:
```bash
npm run preview
```

## Project Structure

```
sami-chat-spa/
├── src/
│   ├── components/          # React components
│   │   ├── ApiConfig.tsx    # API key configuration modal
│   │   ├── ChatInterface.tsx # Main chat interface
│   │   └── Message.tsx      # Individual message component
│   ├── services/            # Service layer
│   │   ├── chat-orchestrator.ts # Main orchestration logic
│   │   ├── chatgpt.ts       # OpenAI ChatGPT service
│   │   ├── gemini.ts        # Google Gemini service
│   │   └── translation.ts   # Translation service (calls backend)
│   ├── utils/               # Utility functions
│   │   └── markdown.ts      # Markdown parsing and reconstruction
│   ├── types/               # TypeScript type definitions
│   │   └── chat.ts          # Chat-related types
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles
├── index.html               # HTML template
├── package.json             # Project dependencies
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite configuration
└── README.md                # This file
```

Note: The translation backend (TartuNLP) is a separate repository/service and is not included in this frontend repo. See `LOCAL_TRANSLATION_SETUP.md` and `REMOTE_BACKEND_SETUP.md` for links and instructions to the external backend.
```

## Technologies Used

### Frontend
- **React 18**: UI framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Marked**: Markdown parsing
- **DOMPurify**: XSS protection for rendered HTML

### Backend
- **FastAPI**: Modern Python web framework
- **PyTorch 2.5.1 with CUDA 12.4**: Deep learning framework with GPU support
- **Transformers**: HuggingFace library for NLP models
- **TartuNLP/OPUS-MT**: Neural machine translation models for Uralic languages

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Adding New AI Providers

To add a new AI provider:

1. Create a service class in `src/services/` implementing the `AIService` interface
2. Add the provider type to `AIProvider` in `src/types/chat.ts`
3. Update `ChatOrchestrator` to instantiate and use the new service
4. Add the provider option to the UI in `ChatInterface.tsx`

## Known Limitations

- Translation quality depends on the OPUS-MT models
- Some idiomatic expressions may not translate well
- Code within markdown code blocks is not translated (by design)
- First translation may take a few seconds (GPU warm-up)
- Backend requires NVIDIA GPU for optimal performance (can run on CPU but slower)

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

## Acknowledgments

- [TartuNLP](https://tartunlp.ai/) (University of Tartu) for the Uralic language translation models
- [Helsinki-NLP](https://github.com/Helsinki-NLP) for the OPUS-MT framework
- Google and OpenAI for their AI APIs
- The Sami language community

## Contact

[Add contact information here]
