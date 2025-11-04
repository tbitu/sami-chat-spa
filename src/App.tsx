import { useEffect, useState } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { ApiConfig } from './components/ApiConfig';
import { ChatOrchestrator } from './services/chat-orchestrator';
import { AIProvider, TranslationService } from './types/chat';
import { configureTranslationService } from './services/translation';
import './App.css';


function App() {
  
  const [orchestrator, setOrchestrator] = useState<ChatOrchestrator | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // persisted API-related localStorage keys are managed in the Chat header

  const handleConfigured = (
    geminiKey: string, 
    openaiKey: string, 
    translationService: TranslationService,
    geminiModel?: string
  ) => {
    // Configure translation service
    configureTranslationService({ service: translationService });
    
    const orch = new ChatOrchestrator(geminiKey, openaiKey, geminiModel);
    
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
  };

  // Auto-configure from localStorage if keys exist
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const storedGemini = localStorage.getItem('sami_chat_gemini_key') || '';
        const storedOpenai = localStorage.getItem('sami_chat_openai_key') || '';
        const storedModel = localStorage.getItem('sami_chat_gemini_model') || undefined;
        const storedTranslation = (localStorage.getItem('sami_chat_translation_service') || 'tartunlp-public') as TranslationService;

        if ((storedGemini && storedGemini.trim()) || (storedOpenai && storedOpenai.trim())) {
          // Defer configuration until next tick to avoid React state update during render
          setTimeout(() => handleConfigured(storedGemini.trim(), storedOpenai.trim(), storedTranslation, storedModel), 0);
        }
      }
    } catch (e) {
      // ignore storage access errors
    }
  }, []);

  const handleSendMessage = async (
    message: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> => {
    console.log('[App] handleSendMessage called with message:', message.substring(0, 50));
    
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    setIsLoading(true);
    try {
      if (onProgress) {
        console.log('[App] Using streaming version');
        try {
          // Try streaming version first
          const response = await orchestrator.sendMessageStreaming(message, onProgress);
          console.log('[App] Streaming succeeded, response length:', response.length);
          return response;
        } catch (streamError) {
          console.warn('[App] Streaming failed, falling back to non-streaming:', streamError);
          // Fallback to non-streaming on error
          const response = await orchestrator.sendMessage(message);
          return response;
        }
      } else {
        console.log('[App] Using non-streaming version');
        // Direct non-streaming
        const response = await orchestrator.sendMessage(message);
        return response;
      }
    } finally {
      console.log('[App] Setting isLoading to false');
      setIsLoading(false);
    }
  };

  if (!orchestrator) {
    return (
      <div>
        <ApiConfig onConfigured={handleConfigured} />
      </div>
    );
  }

  return (
    <div>
      <ChatInterface
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onModelChange={(model) => {
          if (orchestrator && model) {
            orchestrator.setGeminiModel(model);
          }
        }}
        onClearSession={() => {
          if (orchestrator) {
            orchestrator.clearSession();
          }
        }}
      />
    </div>
  );
}

export default App;
