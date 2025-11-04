# Translation Service Configuration Fix

## Problem
The translation service had a hardcoded default of `'local-llm'` which could be used even if the user selected `'tartunlp-public'` in the API configuration screen.

## Solution
Changed the translation service configuration to:
1. **No default value** - `translationConfig` is now `null` initially
2. **Explicit configuration required** - The service MUST be configured via `configureTranslationService()`
3. **Clear error messages** - If translation is attempted before configuration, a helpful error is thrown

## Changes Made

### `src/services/translation.ts`

**Before:**
```typescript
let translationConfig: TranslationConfig = {
  service: 'local-llm',  // ❌ Hardcoded default!
  apiUrl: viteEnvUrl || 'http://localhost:8000/translation/v2'
};
```

**After:**
```typescript
// Translation configuration - MUST be set by user via configureTranslationService()
// No default service is set to ensure the user explicitly chooses
let translationConfig: TranslationConfig | null = null;
```

**Added Safety Checks:**
```typescript
function getApiUrl(): string {
  if (!translationConfig) {
    throw new Error('Translation service not configured. Please select a translation service in the API configuration screen.');
  }
  // ... rest of function
}

async function translateText(...) {
  if (!translationConfig) {
    throw new Error('Translation service not configured. Please select a translation service in the API configuration screen.');
  }
  // ... rest of function
}
```

## How It Works Now

### 1. New User (No Saved Configuration)
```
User opens app
  ↓
API Config screen shows
  ↓
User selects translation service: 'tartunlp-public' ✅
  ↓
configureTranslationService({ service: 'tartunlp-public' }) called
  ↓
translationConfig = { service: 'tartunlp-public' }
  ↓
Saved to localStorage for future visits
```

### 2. Returning User (With Saved Configuration)
```
User opens app
  ↓
App.tsx reads from localStorage:
  - Translation service: 'tartunlp-public' (saved from previous visit)
  ↓
configureTranslationService({ service: 'tartunlp-public' }) called automatically
  ↓
User's choice is respected ✅
```

### 3. Error Case (Configuration Not Set)
```
User somehow bypasses config screen
  ↓
Tries to send a message
  ↓
Translation attempted
  ↓
Error thrown: "Translation service not configured. Please select a translation service in the API configuration screen."
  ↓
User is informed clearly what to do ✅
```

## UI Default

The API configuration screen (`src/components/ApiConfig.tsx`) defaults to `'tartunlp-public'`:

```typescript
const [translationService, setTranslationService] = useState<TranslationService>('tartunlp-public');
```

This is the **UI default** (what's pre-selected in the dropdown), NOT a fallback. The user still must click "Álggahit" (Start) to confirm their choice.

## Guarantees

✅ **No automatic fallback to 'local-llm'**
- The only way 'local-llm' is used is if the user explicitly selects it

✅ **User's choice is always respected**
- Whatever the user selects in the API config screen is used
- No hidden defaults override their choice

✅ **Clear error messages**
- If something goes wrong, users know exactly what to do

✅ **Persistent configuration**
- User's choice is saved in localStorage
- Automatically loaded on subsequent visits
- Can be changed anytime via the hamburger menu

## Testing

To verify the fix works:

1. **Test 1: New user selecting tartunlp-public**
   ```
   1. Clear localStorage (Dev Tools → Application → Local Storage → Clear)
   2. Reload page
   3. Select "TartuNLP Public API" in dropdown
   4. Click "Álggahit"
   5. Send a message
   6. Check console logs: should show "via tartunlp-public" ✅
   ```

2. **Test 2: New user selecting local-llm**
   ```
   1. Clear localStorage
   2. Reload page
   3. Select "Local Translation Service" in dropdown
   4. Click "Álggahit"
   5. Send a message
   6. Check console logs: should show "via local-llm" ✅
   ```

3. **Test 3: Returning user**
   ```
   1. Complete Test 1
   2. Reload page
   3. App should auto-configure with saved choice
   4. Send a message
   5. Check console logs: should match saved choice ✅
   ```

4. **Test 4: Change selection**
   ```
   1. Click hamburger menu (☰)
   2. Click "Sálke" (logout)
   3. Select different translation service
   4. Click "Álggahit"
   5. Send a message
   6. Check console logs: should reflect new choice ✅
   ```

## Backward Compatibility

Existing users with saved localStorage values will continue to work:
- If they have `'local-llm'` saved, it will be loaded and used ✅
- If they have `'tartunlp-public'` saved, it will be loaded and used ✅
- No breaking changes for existing users

## Migration Notes

No migration needed. The change is fully backward compatible.

To change translation service:
1. Click hamburger menu (☰)
2. Click "Sálke" to go back to API config
3. Select your preferred translation service
4. Click "Álggahit"
