# Development Guide

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- A code editor (VS Code recommended)
- Git for version control

### Initial Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd sami-chat-spa

# Install dependencies
npm install

# Start development server
npm run dev
```

## Development Workflow

### 1. Running the Dev Server
```bash
npm run dev
```
- Opens at `http://localhost:5173`
- Hot module replacement (HMR) enabled
- Changes reflect immediately

### 2. Code Style
- TypeScript strict mode enabled
- ESLint for code quality
- 2-space indentation
- Follow React best practices

### 3. File Organization
```
src/
├── components/       # UI components (presentational)
├── services/        # Business logic and API calls
├── utils/           # Pure utility functions
├── types/           # TypeScript type definitions
├── App.tsx          # Root component
└── main.tsx         # Application entry point
```

## Adding New Features

### Adding a New AI Provider

1. **Create Service Class** (`src/services/your-provider.ts`)
```typescript
import { AIService, Message } from '../types/chat';

export class YourProviderService implements AIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendMessage(
    messages: Message[],
    systemInstruction: string
  ): Promise<string> {
    // Implement API call
    // Return response text
  }
}
```

2. **Update Type Definitions** (`src/types/chat.ts`)
```typescript
export type AIProvider = 'gemini' | 'chatgpt' | 'your-provider';
```

3. **Update Chat Orchestrator** (`src/services/chat-orchestrator.ts`)
```typescript
import { YourProviderService } from './your-provider';

export class ChatOrchestrator {
  private yourProviderService?: YourProviderService;

  constructor(
    geminiApiKey?: string,
    openaiApiKey?: string,
    yourProviderApiKey?: string
  ) {
    // ... existing code
    if (yourProviderApiKey) {
      this.yourProviderService = new YourProviderService(yourProviderApiKey);
    }
  }

  private getService(provider: AIProvider): AIService {
    // ... existing code
    if (provider === 'your-provider') {
      if (!this.yourProviderService) {
        throw new Error('Your Provider API key not configured');
      }
      return this.yourProviderService;
    }
  }
}
```

4. **Update UI** (`src/components/ChatInterface.tsx`)
```typescript
<select /* ... */>
  <option value="gemini">Gemini</option>
  <option value="chatgpt">ChatGPT</option>
  <option value="your-provider">Your Provider</option>
</select>
```

5. **Update API Config** (`src/components/ApiConfig.tsx`)
Add input field for new API key.

### Adding New Translation Languages

1. **Update Translation Service** (`src/services/translation.ts`)
```typescript
export type TranslationDirection = 
  | 'se-nb'  // Northern Sami ↔ Norwegian
  | 'nb-se'
  | 'sma-nb' // Southern Sami ↔ Norwegian
  | 'nb-sma';
```

2. **Add Language Selection UI**
Create dropdown for language selection in ChatInterface.

### Adding New Components

1. **Create Component File** (`src/components/YourComponent.tsx`)
```typescript
import React from 'react';
import './YourComponent.css';

interface YourComponentProps {
  // Define props
}

export const YourComponent: React.FC<YourComponentProps> = ({ 
  /* props */ 
}) => {
  return (
    <div className="your-component">
      {/* Component JSX */}
    </div>
  );
};
```

2. **Create Styles** (`src/components/YourComponent.css`)
```css
.your-component {
  /* Styles */
}

@media (prefers-color-scheme: light) {
  .your-component {
    /* Light mode styles */
  }
}
```

3. **Import and Use**
```typescript
import { YourComponent } from './components/YourComponent';
```

## Testing

### Manual Testing Checklist
- [ ] Enter API keys
- [ ] Send message in Sami
- [ ] Verify translation and response
- [ ] Switch between providers
- [ ] Clear chat history
- [ ] Test markdown formatting
- [ ] Test on mobile viewport
- [ ] Test dark/light mode

### Adding Automated Tests (Future)
```bash
# Install testing libraries
npm install --save-dev @testing-library/react @testing-library/jest-dom vitest

# Run tests
npm run test
```

Example test:
```typescript
import { render, screen } from '@testing-library/react';
import { Message } from './Message';

describe('Message Component', () => {
  it('renders user message correctly', () => {
    render(<Message role="user" content="Buorre beaivi!" />);
    expect(screen.getByText('Don')).toBeInTheDocument();
    expect(screen.getByText('Buorre beaivi!')).toBeInTheDocument();
  });
});
```

## Debugging

### Browser DevTools
- Open DevTools (F12)
- Check Console for errors
- Network tab for API calls
- React DevTools extension helpful

### Common Issues

**Issue**: Translation failing
- Check TartuNLP API status
- Verify network connectivity
- Check browser console for errors

**Issue**: API key not working
- Verify key is correct
- Check for extra spaces
- Ensure API has credits/quota

**Issue**: Build failing
```bash
# Clear cache and rebuild
rm -rf node_modules/.vite dist
npm install
npm run build
```

## Code Quality

### Running ESLint
```bash
npm run lint
```

### Auto-fix Issues
```bash
npx eslint . --ext ts,tsx --fix
```

### TypeScript Checking
```bash
npx tsc --noEmit
```

## Building for Production

### Standard Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Analyzing Bundle Size
```bash
# Install analyzer
npm install --save-dev rollup-plugin-visualizer

# Update vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [react(), visualizer()],
});

# Build and open stats
npm run build
open stats.html
```

## Deployment

### Deploy to Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Deploy to Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

### Deploy to GitHub Pages
```bash
# Update vite.config.ts
export default defineConfig({
  base: '/sami-chat-spa/',
  plugins: [react()],
});

# Build
npm run build

# Deploy (using gh-pages package)
npm install --save-dev gh-pages
npx gh-pages -d dist
```

## Environment Variables

### Local Development
Create `.env.local`:
```
VITE_GEMINI_API_KEY=your_key_here
VITE_OPENAI_API_KEY=your_key_here
```

### Using in Code
```typescript
const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
```

### Production Environment
Set environment variables in your hosting platform:
- Vercel: Project Settings → Environment Variables
- Netlify: Site Settings → Build & Deploy → Environment

## Git Workflow

### Branching Strategy
```bash
main           # Production-ready code
├── develop    # Development branch
├── feature/*  # Feature branches
└── bugfix/*   # Bug fix branches
```

### Commit Messages
Follow conventional commits:
```
feat: add streaming response support
fix: resolve markdown table translation bug
docs: update API documentation
style: format code with prettier
refactor: simplify translation service
test: add unit tests for markdown utils
chore: update dependencies
```

### Before Committing
```bash
# Check for issues
npm run lint
npm run build

# Stage changes
git add .

# Commit
git commit -m "feat: add new feature"

# Push
git push origin feature/your-feature
```

## Performance Optimization

### Lazy Loading Components
```typescript
import { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HeavyComponent />
    </Suspense>
  );
}
```

### Memoization
```typescript
import { useMemo, useCallback } from 'react';

const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

const memoizedCallback = useCallback(() => {
  doSomething(a, b);
}, [a, b]);
```

### Code Splitting
Vite automatically splits code by route and dynamic imports.

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
npm run dev -- --port 3000
```

### Module Not Found
```bash
# Clear node_modules
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors
```bash
# Restart TypeScript server (VS Code)
Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"
```

## Resources

### Documentation
- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [TartuNLP API](https://api.tartunlp.ai/)

### Learning Resources
- [React Tutorial](https://react.dev/learn)
- [TypeScript in React](https://react-typescript-cheatsheet.netlify.app/)
- [Modern JavaScript](https://javascript.info/)

### Community
- [React Discord](https://discord.gg/react)
- [TypeScript Discord](https://discord.gg/typescript)

## Contributing

### Pull Request Process
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Update documentation
5. Submit PR with description

### Code Review Checklist
- [ ] Code follows style guide
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No console errors
- [ ] Responsive design maintained
- [ ] Accessibility considered

## License

[Specify your license]

---

Happy coding! 🚀
