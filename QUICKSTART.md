# Sámi Chat - Quick Start

## 🚀 Get Started

1. **Start the translation backend** (separate service - see its README)
2. **Install and run this frontend:**
   ```bash
   npm install
   npm run dev
   ```
3. **Open `http://localhost:5173`**
4. **Enter your API key** (Gemini or OpenAI)
5. **Start chatting in Northern Sami!**

## 🔑 Get an API Key

Choose **one** of these:

**Google Gemini** (recommended for beginners)
- Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
- Click "Create API Key"
- Copy the key (starts with `AIza...`)

**OpenAI ChatGPT**
- Visit [OpenAI Platform](https://platform.openai.com/api-keys)
- Click "Create new secret key"
- Copy the key (starts with `sk-...`)

## 💬 Using the App

- **Send messages**: Type in Northern Sami, press "Sádde" or Enter
- **Switch AI**: Use dropdown to change between Gemini and ChatGPT
- **Clear chat**: Click "Čuohcat" to reset conversation
- **Markdown**: Supports **bold**, *italic*, `code`, lists, tables, etc.

## 🌐 How It Works

```
Sami → Translate to Norwegian → AI → Translate to Sami → You
```

Translation happens automatically using local TartuNLP models.

## 🔧 Development

```bash
npm run dev      # Dev server with hot reload
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## 🐛 Troubleshooting

**API key not working?**
- Check it's valid and has credits
- Gemini keys: `AIza...`
- OpenAI keys: `sk-...`

**Translation errors?**
- Ensure backend is running on `http://localhost:8000`
- Check browser console for errors

**Build issues?**
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📝 Example

**You**: Buorre beaivi! Maid don sáhtát veahkehit?  
**AI**: Bures boahtin! Mun sáhttán veahkehit ollu iešguđet áššiid...

---

**Lihkku osku!** (Good luck!)
