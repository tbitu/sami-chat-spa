import { useEffect, useState, useCallback } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { ApiConfig } from './components/ApiConfig';
import { ChatOrchestrator } from './services/chat-orchestrator';
import { AIProvider, TranslationService, SamiLanguage } from './types/chat';
import { configureTranslationService } from './services/translation';
import './App.css';
import { useTranslation } from 'react-i18next';
import type { ServerConfig } from './services/server-config';
import { fetchServerConfig, pickServerProvider } from './services/server-config';


function App() {
  const { i18n } = useTranslation();
  
  const [orchestrator, setOrchestrator] = useState<ChatOrchestrator | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [configChecked, setConfigChecked] = useState(false);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [samiLanguage, setSamiLanguage] = useState<SamiLanguage>(() => {
    // Load saved language from localStorage or default to Northern Sami
    try {
      const saved = localStorage.getItem('sami_chat_language') as SamiLanguage;
      return saved || 'sme';
    } catch {
      return 'sme';
    }
  });

  // persisted API-related localStorage keys are managed in the Chat header

  const handleConfigured = useCallback((
    geminiKey: string, 
    openaiKey: string, 
    translationService: TranslationService,
    geminiModel?: string
  ) => {
    // Server-configured proxies take precedence; the manual flow is disabled when serverConfig is present.
    if (serverConfig) return;

    // Configure translation service with current Sami language
    configureTranslationService({ 
      service: translationService,
      samiLanguage,
    });
    
    const orch = new ChatOrchestrator(geminiKey, openaiKey, geminiModel);
    
    // If a session was restored, ensure its provider is compatible with the
    // configured API keys. If not, create a fresh session using an available provider.
    const restored = orch.getCurrentSession();
    if (restored) {
      // If session expects Gemini but user supplied only OpenAI, recreate as chatgpt
      if (restored.provider === 'gemini' && (!geminiKey || !geminiKey.trim()) && openaiKey && openaiKey.trim()) {
        orch.createSession('chatgpt');
      }

      // If session expects ChatGPT but user supplied only Gemini, recreate as gemini
      if (restored.provider === 'chatgpt' && (!openaiKey || !openaiKey.trim()) && geminiKey && geminiKey.trim()) {
        orch.createSession('gemini');
      }
    }

    // Only create a new session if one doesn't already exist (restored from sessionStorage)
    if (!orch.getCurrentSession()) {
      // Determine initial provider based on which keys are provided
      let initialProvider: AIProvider = 'gemini';
      if (!geminiKey && openaiKey) {
        initialProvider = 'chatgpt';
      }
      
      orch.createSession(initialProvider);
    }
    
    setOrchestrator(orch);
  }, [samiLanguage, serverConfig]);

  const handleLanguageChange = (language: SamiLanguage) => {
    // Save to localStorage
    try {
      localStorage.setItem('sami_chat_language', language);
    } catch (e) {
      console.warn('Failed to save language to localStorage:', e);
    }
    
    // Update state
    setSamiLanguage(language);
    
    // Update UI language
    i18n.changeLanguage(language);
    
    // Reconfigure translation service with new language
    const storedTranslation = (localStorage.getItem('sami_chat_translation_service') || 'tartunlp-public') as TranslationService;
    configureTranslationService({
      service: storedTranslation,
      samiLanguage: language,
    });
  };

  // Auto-configure from localStorage if keys exist
  useEffect(() => {
    if (serverConfig) {
      setConfigChecked(true);
      return;
    }

    const controller = new AbortController();
    (async () => {
      const config = await fetchServerConfig(controller.signal);
      if (config) {
        setServerConfig(config);

        if (samiLanguage !== i18n.language) {
          i18n.changeLanguage(samiLanguage);
        }

        let storedTranslation: TranslationService = 'tartunlp-public';
        try {
          if (typeof window !== 'undefined') {
            storedTranslation = (localStorage.getItem('sami_chat_translation_service') || 'tartunlp-public') as TranslationService;
          }
        } catch {
          // ignore storage access issues
        }
        configureTranslationService({
          service: config.translationService || storedTranslation,
          samiLanguage,
        });

        const preferredProvider = pickServerProvider(config);
        if (preferredProvider) {
          const orch = new ChatOrchestrator(undefined, undefined, config.providers.gemini?.model, {
            proxyBaseUrl: config.proxyBaseUrl,
            enableGemini: Boolean(config.providers.gemini?.enabled),
            enableChatGpt: Boolean(config.providers.chatgpt?.enabled),
            chatGptModel: config.providers.chatgpt?.model,
            initialProvider: preferredProvider,
          });

          // Start a clean server-backed session
          orch.clearSession();
          orch.createSession(preferredProvider);
          setOrchestrator(orch);
        }

        setConfigChecked(true);
        return;
      }

      setConfigChecked(true);
    })();

    return () => controller.abort();
  }, [i18n, samiLanguage, serverConfig]);

  useEffect(() => {
    // Do not auto-configure from localStorage if a server key is present or while the server probe is pending.
    if (serverConfig || !configChecked) return;

    try {
      if (typeof window !== 'undefined') {
        const storedGemini = localStorage.getItem('sami_chat_gemini_key') || '';
        const storedOpenai = localStorage.getItem('sami_chat_openai_key') || '';
        const storedModel = localStorage.getItem('sami_chat_gemini_model') || undefined;
        const storedTranslation = (localStorage.getItem('sami_chat_translation_service') || 'tartunlp-public') as TranslationService;

        // Sync i18n language with saved Sami language
        if (samiLanguage !== i18n.language) {
          i18n.changeLanguage(samiLanguage);
        }

        if ((storedGemini && storedGemini.trim()) || (storedOpenai && storedOpenai.trim())) {
          // Defer configuration until next tick to avoid React state update during render
          setTimeout(() => handleConfigured(storedGemini.trim(), storedOpenai.trim(), storedTranslation, storedModel), 0);
        }
      }
    } catch (e) {
      // ignore storage access errors
    }
  }, [configChecked, handleConfigured, i18n, samiLanguage, serverConfig]);

  const handleSendMessage = async (message: string, preserveFormatting?: boolean): Promise<string> => {
    console.log('[App] handleSendMessage called with message:', message.substring(0, 50));
    console.log('[App] preserveFormatting:', preserveFormatting);
    
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    setIsLoading(true);
    try {
      console.log('[App] Using non-streaming version');
      const response = await orchestrator.sendMessage(message, preserveFormatting);
      return response;
    } finally {
      console.log('[App] Setting isLoading to false');
      setIsLoading(false);
    }
  };

  const handleNewConversation = useCallback(() => {
    if (!orchestrator) return;

    orchestrator.clearSession();

    const available = orchestrator.getAvailableProviders();
    if (available.length === 0) {
      console.warn('[App] No available providers to start a new conversation');
      return;
    }

    const initialProvider: AIProvider = available.includes('gemini') ? 'gemini' : available[0];
    orchestrator.createSession(initialProvider);
    setOrchestrator(orchestrator);
  }, [orchestrator]);

  if (!configChecked && !orchestrator) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Checking server configuration...</div>;
  }

  if (!orchestrator) {
    return (
      <div>
        <ApiConfig 
          onConfigured={handleConfigured}
          currentLanguage={samiLanguage}
          onLanguageChange={handleLanguageChange}
        />
      </div>
    );
  }

  return (
    <div>
      <ChatInterface
        onSendMessage={handleSendMessage}
        onStreamMessage={async (message, preserveFormatting, handlers) => {
          if (!orchestrator) throw new Error('Orchestrator not initialized');
          setIsLoading(true);
          try {
            await orchestrator.streamMessage(message, preserveFormatting, handlers);
          } finally {
            setIsLoading(false);
          }
        }}
        isLoading={isLoading}
        onClearSession={() => {
          if (orchestrator) {
            orchestrator.clearSession();
          }
        }}
        onNewConversation={handleNewConversation}
        currentLanguage={samiLanguage}
        onLanguageChange={handleLanguageChange}
      />
    </div>
  );
}

export default App;
