# Architecture Overview

## System Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              React Components (UI Layer)                │ │
│  │  - ApiConfig: API key input modal                      │ │
│  │  - ChatInterface: Main chat UI                         │ │
│  │  - Message: Individual message display                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                           ↓                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Chat Orchestrator (Business Logic)           │ │
│  │  - Session management                                  │ │
│  │  - Translation coordination                            │ │
│  │  - Message history                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│         ↓                 ↓                 ↓                │
│  ┌──────────┐     ┌──────────┐     ┌──────────────┐       │
│  │ Gemini   │     │ ChatGPT  │     │ Translation  │       │
│  │ Service  │     │ Service  │     │ Service      │       │
│  └──────────┘     └──────────┘     └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
       ↓                  ↓                   ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Google       │  │ OpenAI       │  │ TartuNLP         │
│ Gemini API   │  │ ChatGPT API  │  │ Translation API  │
└──────────────┘  └──────────────┘  └──────────────────┘
```

## Component Details

### 1. UI Layer (`src/components/`)

#### ApiConfig Component
- **Purpose**: Collect API keys from user
- **Features**:
  - Password-masked inputs with toggle
  - Support for one or both APIs
  - Links to API key generation pages
  - Local storage only (no server transmission)

#### ChatInterface Component
- **Purpose**: Main chat interaction area
- **Features**:
  - Message history display
  - Input field with send button
  - Provider selection dropdown
  - Clear chat functionality
  - Loading state indicators
  - Responsive design

#### Message Component
- **Purpose**: Render individual messages
- **Features**:
  - Markdown rendering (using Marked)
  - XSS protection (using DOMPurify)
  - Role-based styling (user/assistant)
  - Code syntax preservation

### 2. Business Logic Layer (`src/services/`)

#### ChatOrchestrator
**Responsibility**: Coordinate the entire chat flow

**Key Methods**:
- `createSession(provider)`: Initialize new conversation
- `sendMessage(samiText)`: Process complete message flow
- `getMessageHistory()`: Retrieve session messages
- `clearSession()`: Reset conversation

**Message Flow**:
```
1. Receive user message in Sami
2. Translate Sami → Norwegian
3. Add to message history
4. Send to AI provider
5. Receive response in Norwegian
6. Translate Norwegian → Sami
7. Return translated response
```

#### GeminiService
**Responsibility**: Interface with Google Gemini API

**Features**:
- Convert message format for Gemini
- Include system instruction
- Handle streaming responses
- Error handling and retry logic

**API Details**:
- Endpoint: `generativelanguage.googleapis.com`
- Model: `gemini-pro`
- Authentication: API key in URL parameter

#### ChatGPTService
**Responsibility**: Interface with OpenAI ChatGPT API

**Features**:
- Convert message format for OpenAI
- Include system instruction as first message
- Configurable model selection
- Error handling

**API Details**:
- Endpoint: `api.openai.com/v1/chat/completions`
- Model: `gpt-4-turbo-preview` (configurable)
- Authentication: Bearer token in header

#### TranslationService
**Responsibility**: Translate between Sami and Norwegian

**Features**:
- Markdown-aware translation
- Segment-based processing
- Code block preservation
- Table cell separation
- Batch translation with rate limiting

**API Details**:
- Endpoint: `api.tartunlp.ai/translation/v2`
- Language pairs: `se-nb`, `nb-se`
- No authentication required

### 3. Utility Layer (`src/utils/`)

#### Markdown Utils
**Responsibility**: Parse and reconstruct markdown

**Key Functions**:

1. `extractMarkdownSegments(text)`
   - Parse text into structured segments
   - Identify: code blocks, tables, headings, lists, text
   - Preserve formatting markers

2. `reconstructFromSegments(segments)`
   - Rebuild text from segments
   - Restore markdown syntax

3. `extractTranslatableText(segments)`
   - Filter out non-translatable content
   - Return only text that should be translated

4. `applyTranslations(segments, translations)`
   - Map translated text back to segments
   - Maintain markdown structure

5. `hasMarkdown(text)`
   - Detect if text contains markdown
   - Optimize translation path

## Data Flow

### User Message Flow

```
User Types Message (Sami)
         ↓
ChatInterface.handleSubmit()
         ↓
App.handleSendMessage()
         ↓
ChatOrchestrator.sendMessage()
         ↓
TranslationService.translateWithMarkdown(text, 'se-nb')
         ↓
[If markdown detected]
├─→ extractMarkdownSegments()
├─→ extractTranslatableText()
├─→ Translate each segment via TartuNLP API
├─→ applyTranslations()
└─→ reconstructFromSegments()
         ↓
[Message in Norwegian]
         ↓
GeminiService.sendMessage() OR ChatGPTService.sendMessage()
         ↓
[AI Response in Norwegian]
         ↓
TranslationService.translateWithMarkdown(text, 'nb-se')
         ↓
[Response in Sami]
         ↓
ChatInterface displays message
```

## State Management

### Application State
- Managed with React `useState` hooks
- No external state management library
- Local to components

### Session State
```typescript
interface ChatSession {
  id: string;                    // Unique session ID
  provider: AIProvider;           // 'gemini' | 'chatgpt'
  messages: Message[];            // Conversation history
  systemInstruction: string;      // Context for AI
  createdAt: Date;               // Session timestamp
}
```

### Message State
```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;                // Text in Norwegian (internal)
}

interface DisplayMessage {
  id: string;                     // Unique message ID
  role: 'user' | 'assistant';
  content: string;                // Text in Sami (displayed)
  timestamp: Date;
}
```

## Security Considerations

### API Key Storage
- Stored only in browser memory (React state)
- Never persisted to localStorage/sessionStorage
- Not sent to any server except target APIs
- User must re-enter on page refresh

### XSS Protection
- All user input sanitized before rendering
- DOMPurify cleans markdown HTML output
- No direct HTML injection

### CORS
- All API calls from browser (no proxy)
- Relies on APIs supporting CORS
- TartuNLP: Public CORS-enabled endpoint
- Gemini/OpenAI: CORS-enabled for browser requests

## Performance Optimizations

### Translation Batching
- Sequential translation with configurable delay
- Prevents rate limiting
- Maintains order for complex markdown

### Markdown Optimization
- Quick check if markdown exists
- Skip complex parsing for plain text
- Preserve code blocks without translation

### React Optimizations
- Functional components
- Minimal re-renders
- Memoization where needed (future enhancement)

## Error Handling

### Translation Errors
- Fallback to original text
- Log error to console
- Continue conversation

### AI Provider Errors
- Display error message to user
- Preserve conversation history
- Allow retry with same message

### Network Errors
- Timeout handling
- Retry logic (future enhancement)
- User-friendly error messages

## Future Enhancements

### Potential Improvements
1. **Conversation Persistence**: Save sessions to localStorage
2. **Streaming Responses**: Real-time AI response display
3. **Voice Input**: Speech-to-text in Sami
4. **Export Functionality**: Download conversations
5. **Multi-language Support**: Other Sami variants (South, Lule)
6. **Offline Mode**: Cache translations
7. **Analytics**: Usage statistics
8. **Themes**: Customizable UI themes
9. **Keyboard Shortcuts**: Power user features
10. **Message Editing**: Edit and resend messages

## Testing Strategy

### Unit Tests (Future)
- Markdown parsing utilities
- Translation service logic
- Message formatting

### Integration Tests (Future)
- API service interactions
- Chat orchestrator flow
- Component interactions

### E2E Tests (Future)
- Complete user workflows
- Cross-browser testing
- Mobile responsiveness

## Deployment

### Build Output
```bash
npm run build
```
Creates optimized static files in `dist/`:
- `index.html`: Entry point
- `assets/*.js`: Bundled JavaScript
- `assets/*.css`: Bundled styles

### Hosting Options
- **Static Hosting**: Vercel, Netlify, GitHub Pages
- **CDN**: CloudFlare, AWS CloudFront
- **Traditional**: Any web server (nginx, Apache)

### Environment Variables
Currently API keys are entered via UI, but could be pre-configured:
```
VITE_GEMINI_API_KEY=...
VITE_OPENAI_API_KEY=...
```

## Dependencies

### Production Dependencies
- `react` & `react-dom`: UI framework
- `marked`: Markdown parsing
- `dompurify`: XSS protection

### Development Dependencies
- `vite`: Build tool
- `typescript`: Type safety
- `@vitejs/plugin-react`: React support
- `eslint`: Code quality

### Bundle Size
- Production build: ~211 KB (JS)
- Gzipped: ~69 KB
- CSS: ~7 KB (gzipped ~2 KB)

## License & Acknowledgments

Built with:
- React ecosystem
- TartuNLP translation API
- Google Gemini API
- OpenAI ChatGPT API

For the Sami language community 🇳🇴 🇸🇪 🇫🇮 🇷🇺
