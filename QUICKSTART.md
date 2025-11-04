# Sámi Chat - Quick Start Guide

## 🚀 Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```

3. **Open browser**
   - Navigate to `http://localhost:5173`
   - Enter your API key(s) when prompted
   - Start chatting in Northern Sami!

## 📋 API Key Setup

### Google Gemini API
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key (starts with `AIza...`)

### OpenAI ChatGPT API
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-...`)

**Note**: You only need ONE of these APIs to use the application.

## 🎯 Usage Tips

### Basic Chat
- Type your message in Northern Sami
- Press "Sádde" (Send) or hit Enter
- Wait for the AI response (also in Sami)

### Provider Selection
- Use the dropdown in the header to switch between Gemini and ChatGPT
- Switching providers creates a new conversation session

### Clear History
- Click "Čuohcat" button to clear all messages
- This resets the conversation but keeps your API keys

### Markdown Support
The app supports rich formatting:
- **Bold**: `**text**`
- *Italic*: `*text*`
- Code: `` `code` ``
- Code blocks: ``` ```code``` ```
- Lists, tables, headings, and more!

## 🔧 Development Commands

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## 🌐 Translation Flow

```
User Input (Sami)
    ↓
TartuNLP Translation (Sami → Norwegian)
    ↓
AI Provider (Gemini or ChatGPT)
    ↓
TartuNLP Translation (Norwegian → Sami)
    ↓
Display to User (Sami)
```

## ⚙️ Technical Details

### Technology Stack
- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI**: Custom CSS with dark/light mode
- **Markdown**: Marked + DOMPurify
- **APIs**: Gemini, OpenAI, TartuNLP

### Project Structure
```
src/
├── components/         # React UI components
├── services/          # API integration services
├── utils/             # Utility functions
├── types/             # TypeScript types
├── App.tsx            # Main app component
└── main.tsx           # Entry point
```

### Key Features
- **Session Management**: Maintains conversation context
- **Markdown Preservation**: Keeps formatting through translation
- **Privacy**: API keys stored locally only
- **Responsive**: Works on mobile and desktop
- **Bilingual**: Sami interface with Norwegian backend

## 🐛 Troubleshooting

### API Key Issues
- Make sure your API key is valid and has credits
- Check the browser console for error messages
- Gemini keys start with `AIza...`
- OpenAI keys start with `sk-...`

### Translation Errors
- TartuNLP API may have occasional downtime
- Complex markdown may require retry
- Check your internet connection

### Build Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

## 📝 Example Conversations

**User**: Buorre beaivi! Maid don sáhtát veahkehit?
**AI**: Bures boahtin! Mun lean veahkkehat AI. Mun sáhttán veahkehit máŋggain áššiin...

**User**: Makkár dáhpáhusat leat odne?
**AI**: Mu dieđut bohtet jagi 2023 rájes, muhto mun sáhttán gullat ja vástidit jearaldagaide...

## 🤝 Contributing

Want to improve the app? Some ideas:
- Add more AI providers
- Improve markdown handling
- Add conversation export
- Enhance UI/UX
- Add more Sami language variants

## 📄 License

[Add your license information]

## 🆘 Support

- Report issues on GitHub
- Check the README for detailed documentation
- Contact [your contact info]

---

**Lihkku osku!** (Good luck!)
