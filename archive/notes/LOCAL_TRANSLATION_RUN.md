This repository includes a helper script to produce a Northern Sámi translation (`sme.json`) from the Norwegian Bokmål base (`nb.json`) using the project's translation service (TartuNLP by default).

How it works

- `scripts/translate-nb-to-sme.ts` reads `src/i18n/locales/nb.json`, collects all string values, and calls the project's `batchTranslate` function (which uses the configured translation backend in `src/services/translation.ts`) with direction `nor-sme`.
- The script writes the output to `src/i18n/locales/sme.json`.

Run locally

1. Ensure you have either the local translation backend running (default: `http://localhost:8000/translation/v2`) or that you want to use the public TartuNLP API.

2. By default the script configures the public TartuNLP API. If you want to use the local backend, edit the script (`scripts/translate-nb-to-sme.ts`) to call:

   configureTranslationService({ service: 'local-llm', apiUrl: 'http://localhost:8000/translation/v2' });

3. Build and run the script with ts-node (or compile + run with node):

```bash
# install ts-node if you don't have it
npm install -D ts-node typescript @types/node

# run the script (from repo root)
npx ts-node scripts/translate-nb-to-sme.ts
```

Notes and safety

- The script will call the configured translation service for each string in `nb.json`. Review the output `sme.json` manually before committing — automatic translations may need human proofreading.
- The translation API may rate-limit; the script uses a 200ms delay between calls by default. Adjust `delayMs` in `scripts/translate-nb-to-sme.ts` if necessary.
- The script preserves markdown syntax using the same utility functions the app uses for message translation.

If you'd like, I can run a dry-run that writes `sme.json` with placeholders here (without calling any remote API) so you can see the structure first. Let me know which option you prefer.