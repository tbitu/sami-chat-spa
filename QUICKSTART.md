# Sámi Chat - Quick Start

## 🚀 Get Started

1. **Start the translation backend** (separate service - see its README)
   - Local backend: `http://localhost:8000` (recommended)
   - Or use TartuNLP Public API (select in UI)
2. **Install and run this frontend:**
   ```bash
   npm install
   npm run dev
   ```
3. **Open `http://localhost:5173`**
4. **Configure services**: 
   - Select translation service (local or public)
   - Choose your Sami language (sme, smj, sma, smn, or sms)
   - Enter your API key (Gemini or OpenAI)
5. **Start chatting in Sami!**

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

- **Select language**: Choose your Sami language from dropdown (Northern, Lule, Southern, Inari, or Skolt)
- **Send messages**: Type in Sami, press "Sádde" or Enter
- **Switch AI**: Use dropdown to change between Gemini (gemini-flash-latest) and ChatGPT
- **Toggle formatting**: Check "Bisuhit hámidivvon" to preserve markdown (code blocks, tables, etc.)
- **Clear chat**: Click "Ođđa ságastallan" to reset conversation
- **Change UI language**: Select from menu (Sami languages, Norwegian, English)

## 🌐 How It Works

```
Sami → Language Detection (Stage 1) → Translate to Finnish → 
AI (Finnish only) → Validate (Stage 2) → Translate to Sami → 
Validate Quality (Stage 3) → You
```

**Automatic quality control**:
- 3-stage language validation ensures correct output
- Automatic retries if wrong language detected (up to 2 retries for LLM, 3 for translation)
- Corruption detection catches translation artifacts
- 25-second timeout prevents hanging requests

## 🔧 Development

```bash
npm run dev      # Dev server with hot reload → http://localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview production build
npm run lint     # Run ESLint
npm test         # Run Vitest unit tests
```

**Testing translation API**:
```bash
node archive/tools/test-translation-batch.mjs
```

**Environment variables**:
- `VITE_TRANSLATION_API_URL`: Override translation backend URL

## 🐛 Troubleshooting

**API key not working?**
- Check it's valid and has credits/quota
- Gemini keys start with: `AIza...`
- OpenAI keys start with: `sk-...`

**Translation errors?**
- Ensure backend is running on `http://localhost:8000`
- OR select "TartuNLP Public API" in configuration
- Check browser console for detailed error messages
- Verify Sami language is correctly selected

**Wrong language in output?**
- App auto-retries up to 2 times for LLM language issues
- Check console for Stage 2 validation warnings
- Try rephrasing your input

**Markdown formatting broken?**
- Enable "Bisuhit hámidivvon" (Preserve formatting) checkbox
- Markdown uses pipe separator (`|`) - may cause context bleeding in rare cases
- Check console for corruption detection warnings

**Build issues?**
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📝 Example

## 📝 Example Conversations

**Northern Sami (sme)**:  
**You**: Buorre beaivi! Maid don sáhtát veahkehit?  
**AI**: Bures boahtin! Mun sáhttán veahkehit ollu iešguđet áššiid...

**Lule Sami (smj)**:  
**You**: Buorre biejvve! Mij galggá dahkat?  
**AI**: Buorre biejvve! Mån sáhtáv viehkedit máŋggaj ásjáj...

**Southern Sami (sma)**:  
**You**: Buerie biejjie! Maam manne daarpesjidh?  
**AI**: Buerie biejjie! Manne maahta darjodh jïjnjeminie aamhtesinie...

**Inari Sami (smn)**:  
**You**: Pyereest peivvi! Mii tun puáhtá viehâ?  
**AI**: Pyereest peivvi! Mun puáhtám viehâ máŋgán aašijn...

**Skolt Sami (sms)**:  
**You**: Tiõrv! Mii tõn vuäitt viikkâd?  
**AI**: Tiõrv! Muu vuäittam viikkâd määŋgid aašij...

---

**Pro Tips**:
- Enable markdown for code snippets: `` `code here` ``
- Use formatting for emphasis: **lihavuohta** (bold), *kursiva* (italic)
- Create tables and lists - formatting is preserved!
- Sessions auto-save to browser storage - refresh safely

---

**Lihkku osku!** (Good luck!)

````
