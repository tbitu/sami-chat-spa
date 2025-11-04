# Translation Service Configuration

The Sami Chat SPA now supports configurable translation services. You can choose between using a local LLM backend or the public TartuNLP API.

## Configuration Options

### 1. Local LLM (Default)
- **Service**: `local-llm`
- **URL**: `http://localhost:8000/translation/v2` (configurable via `VITE_TRANSLATION_API_URL` environment variable)
- **Use case**: When you have a local backend server running with GPU-accelerated translation
- **Advantages**: Faster, no rate limits, privacy
- **Requirements**: Local backend server must be running

### 2. TartuNLP Public API
- **Service**: `tartunlp-public`
- **URL**: `https://api.tartunlp.ai/translation/v2`
- **Use case**: When you don't have a local backend or want to use the public service
- **Advantages**: No local setup required
- **Considerations**: Requires internet connection, may have rate limits

## How to Use

### In the UI

When you start the application, the API configuration screen now includes a dropdown to select your preferred translation service:

1. **Local LLM (localhost:8000)** - Uses your local translation backend
2. **TartuNLP Public API** - Uses the public TartuNLP API

Simply select your preferred option before submitting the configuration.

### Programmatic Configuration

You can also configure the translation service programmatically in your code:

```typescript
import { configureTranslationService } from './services/translation';

// Configure to use local LLM
configureTranslationService({
  service: 'local-llm',
  apiUrl: 'http://localhost:8000/translation/v2'
});

// Configure to use public TartuNLP API
configureTranslationService({
  service: 'tartunlp-public'
});

// Configure with custom URL
configureTranslationService({
  service: 'local-llm',
  apiUrl: 'http://my-custom-server:9000/translate'
});
```

## Environment Variables

You can set a custom translation API URL using the `VITE_TRANSLATION_API_URL` environment variable:

```bash
# .env file
VITE_TRANSLATION_API_URL=http://my-custom-server:9000/translate
```

This is used as the default URL when `local-llm` service is selected and no custom URL is provided.

## Implementation Details

### Files Modified

1. **`src/types/chat.ts`**
   - Added `TranslationService` type
   - Added `TranslationConfig` interface

2. **`src/services/translation.ts`**
   - Added `configureTranslationService()` function
   - Made API URL dynamic based on configuration
   - Updated error messages to reflect the selected service

3. **`src/components/ApiConfig.tsx`**
   - Added translation service selector dropdown
   - Passes selected service to parent component

4. **`src/App.tsx`**
   - Receives translation service configuration
   - Calls `configureTranslationService()` before initializing chat

### Translation Service Flow

1. User selects translation service in API Config screen
2. Configuration is passed to `App.tsx`
3. `App.tsx` calls `configureTranslationService()` with the selected service
4. Translation service updates its internal configuration
5. All subsequent translation requests use the configured service

## Testing

To test the configuration:

1. **Test Local LLM**:
   - Select "Local LLM (localhost:8000)"
   - Ensure your local backend is running
   - Send a message and verify translations work

2. **Test Public API**:
   - Select "TartuNLP Public API"
   - Send a message and verify translations work
   - Check console logs for API URL being used

## Troubleshooting

- **Local LLM not working**: Ensure your backend server is running on port 8000
- **Public API not working**: Check your internet connection
- Check browser console for detailed error messages including which service is being used
