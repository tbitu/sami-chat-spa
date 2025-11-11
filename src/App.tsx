import { useEffect, useState, useCallback } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { ApiConfig } from './components/ApiConfig';
import { ChatOrchestrator } from './services/chat-orchestrator';
import { AIProvider, TranslationService, SamiLanguage } from './types/chat';
import { configureTranslationService } from './services/translation';
import './App.css';
import { useTranslation } from 'react-i18next';


function App() {
  const { i18n } = useTranslation();
  
  const [orchestrator, setOrchestrator] = useState<ChatOrchestrator | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
  }, [samiLanguage]);

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
  }, [handleConfigured, i18n, samiLanguage]);

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

    // Clear current session but keep API keys in localStorage
    orchestrator.clearSession();

    // Create a new session with the same default provider logic
    const storedGemini = localStorage.getItem('sami_chat_gemini_key') || '';
    const storedOpenai = localStorage.getItem('sami_chat_openai_key') || '';

    let initialProvider: AIProvider = 'gemini';
    if (!storedGemini.trim() && storedOpenai.trim()) {
      initialProvider = 'chatgpt';
    }

    orchestrator.createSession(initialProvider);
    // Force re-render by recreating the orchestrator object in state
    setOrchestrator(orchestrator);
  }, [orchestrator]);

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
