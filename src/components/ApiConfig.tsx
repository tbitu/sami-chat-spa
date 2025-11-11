// API Configuration component
import React, { useEffect, useState } from 'react';
import { GeminiService, GeminiModel } from '../services/gemini';
import { useTranslation } from 'react-i18next';
import { TranslationService, SamiLanguage } from '../types/chat';
import { LanguageSelector } from './LanguageSelector';
import './ApiConfig.css';
import './menu.css';

interface ApiConfigProps {
  onConfigured: (geminiKey: string, openaiKey: string, translationService: TranslationService, geminiModel?: string) => void;
  currentLanguage: SamiLanguage;
  onLanguageChange: (language: SamiLanguage) => void;
}

export const ApiConfig: React.FC<ApiConfigProps> = ({ onConfigured, currentLanguage, onLanguageChange }) => {
  const { t } = useTranslation();
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [preserveFormatting, setPreserveFormatting] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sami_chat_preserve_formatting');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  // Default to TartuNLP public API (preferred selection on first screen)
  const [translationService, setTranslationService] = useState<TranslationService>('tartunlp-public');
  const [error, setError] = useState('');
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const handleGeminiKeyChange = async (key: string) => {
    setGeminiKey(key);
    // Persist Gemini key to localStorage so users don't have to re-enter it.
    try {
      if (typeof window !== 'undefined') {
        if (key.trim()) {
          localStorage.setItem('sami_chat_gemini_key', key);
        } else {
          localStorage.removeItem('sami_chat_gemini_key');
        }
      }
    } catch (e) {
      // Ignore storage errors (e.g., private mode)
    }
    
    // Clear models if key is cleared
    if (!key.trim()) {
      setAvailableModels([]);
      setSelectedModel('');
      return;
    }

    // Fetch models if key looks valid
    if (key.startsWith('AIza') && key.length > 20) {
      setIsLoadingModels(true);
      try {
        const service = new GeminiService(key);
        const models = await service.listAvailableModels();
        setAvailableModels(models);
        
        // Auto-select first model if available
        if (models.length > 0) {
          // Extract just the model name (e.g., "models/gemini-pro" -> "gemini-pro")
          const firstModelName = models[0].name.replace('models/', '');
          setSelectedModel(firstModelName);
        }
      } catch (err) {
        console.error('Error fetching models:', err);
      } finally {
        setIsLoadingModels(false);
      }
    }
  };

  // Persist OpenAI key when it changes
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (openaiKey.trim()) {
          localStorage.setItem('sami_chat_openai_key', openaiKey);
        } else {
          localStorage.removeItem('sami_chat_openai_key');
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
  }, [openaiKey]);

  // Persist translation service and selected model
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('sami_chat_translation_service', translationService);
        if (selectedModel) {
          localStorage.setItem('sami_chat_gemini_model', selectedModel);
        } else {
          localStorage.removeItem('sami_chat_gemini_model');
        }
      }
    } catch (e) {
      // ignore
    }
  }, [translationService, selectedModel]);

  // Read persisted values on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const storedGemini = localStorage.getItem('sami_chat_gemini_key');
        const storedOpenai = localStorage.getItem('sami_chat_openai_key');
        const storedTranslation = localStorage.getItem('sami_chat_translation_service');
        const storedModel = localStorage.getItem('sami_chat_gemini_model');

        if (storedGemini) {
          setGeminiKey(storedGemini);
          // Trigger model fetch if key looks valid
          handleGeminiKeyChange(storedGemini);
        }
        if (storedOpenai) setOpenaiKey(storedOpenai);
        if (storedTranslation) setTranslationService(storedTranslation as TranslationService);
        if (storedModel) setSelectedModel(storedModel);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Listen for preserveFormatting changes from other components
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const val = (ev as CustomEvent).detail?.value;
        if (typeof val === 'boolean') setPreserveFormatting(val);
      } catch (err) {
        // Keep non-empty to satisfy lint rules; log unexpected event shapes for debugging.
        console.debug('[ApiConfig] preserve_formatting handler error:', err);
      }
    };
    window.addEventListener('sami_preserve_formatting_changed', handler as EventListener);
    return () => window.removeEventListener('sami_preserve_formatting_changed', handler as EventListener);
  }, []);

  const clearPersistence = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('sami_chat_gemini_key');
        localStorage.removeItem('sami_chat_openai_key');
        localStorage.removeItem('sami_chat_translation_service');
        localStorage.removeItem('sami_chat_gemini_model');
      }
    } catch (e) {
      // ignore
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const trimmedGeminiKey = geminiKey.trim();
    const trimmedOpenaiKey = openaiKey.trim();
    
    // Validate at least one key is provided
    if (!trimmedGeminiKey && !trimmedOpenaiKey) {
      setError('Čális unnimusat ovtta API-čoavdaga');
      return;
    }
    
    // Validate Gemini key format if provided
    if (trimmedGeminiKey && !trimmedGeminiKey.startsWith('AIza')) {
      setError('Gemini API-čoavdda galggašii álggahit "AIza". Iskkut govvet olles čoavdaga.');
      return;
    }
    
    // Validate OpenAI key format if provided
    if (trimmedOpenaiKey && !trimmedOpenaiKey.startsWith('sk-')) {
      setError('OpenAI API-čoavdda galggašii álggahit "sk-". Iskkut govvet olles čoavdaga.');
      return;
    }
    
    onConfigured(trimmedGeminiKey, trimmedOpenaiKey, translationService, selectedModel || undefined);
  };

  return (
    <div className="api-config-overlay">
      <div className="api-config-modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>{t('apiConfig.title')}</h2>
            <p className="description">{t('apiConfig.description')}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Language selector for Sami languages */}
            <LanguageSelector
              currentLanguage={currentLanguage}
              onLanguageChange={onLanguageChange}
            />
            <div className="hc-menu" style={{ marginLeft: 8 }}>
              <button aria-label="menu" onClick={() => setMenuOpen(!menuOpen)} className="hc-menu-button">☰</button>
              {menuOpen && (
                <div className="hc-menu-dropdown">
                  <div className="hc-menu-section hc-menu-actions">
                    <button onClick={() => { setTimeout(() => window.location.reload(), 50); }}>{t('menu.salke')}</button>
                    <button onClick={() => { clearPersistence(); window.location.reload(); }}>{t('menu.resetPersistence')}</button>
                  </div>

                  <div className="hc-menu-section hc-menu-section--separator">
                    <label>
                      <input type="checkbox" checked={preserveFormatting} onChange={(e) => { const newValue = e.target.checked; setPreserveFormatting(newValue); try { localStorage.setItem('sami_chat_preserve_formatting', String(newValue)); window.dispatchEvent(new CustomEvent('sami_preserve_formatting_changed', { detail: { value: newValue } })); } catch (err) { console.debug('[ApiConfig] Failed to persist preserve_formatting preference:', err); } }} />
                      <span style={{ marginLeft: 8 }}>{t('chatInterface.preserveFormatting')}</span>
                    </label>
                  </div>

                  <div className="hc-menu-section hc-menu-section--separator">
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('menu.modelSelectorTitle') || 'Model'}</div>
                    {availableModels.length > 0 ? (
                      <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="api-input">
                        {availableModels.map((model) => (
                          <option key={model.name} value={model.name.replace('models/', '')}>{model.displayName}</option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ color: '#666' }}>(default)</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="translation-service">{t('apiConfig.translationServiceLabel')}</label>
            <select
              id="translation-service"
              value={translationService}
              onChange={(e) => setTranslationService(e.target.value as TranslationService)}
              className="api-input"
            >
              <option value="local-llm">{t('apiConfig.translationServiceOptions.local-llm')}</option>
              <option value="tartunlp-public">{t('apiConfig.translationServiceOptions.tartunlp-public')}</option>
            </select>
            <small>
              Vállje gokko don geavahit báikkálaš jorgalanmoddála dahje almmolaš TartuNLP API
            </small>
          </div>

          <div className="input-group">
            <label htmlFor="gemini-key">{t('apiConfig.geminiKeyLabel')}</label>
            <input
              id="gemini-key"
              type="password"
              value={geminiKey}
              onChange={(e) => handleGeminiKeyChange(e.target.value)}
              placeholder="AIza..."
              className="api-input"
            />
            <small>
              <a
                href="https://aistudio.google.com/app/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get API key
              </a>
            </small>
          </div>

          {availableModels.length > 0 && (
            <div className="input-group">
              <label htmlFor="gemini-model">Gemini Model</label>
              <select
                id="gemini-model"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="api-input"
              >
                {availableModels.map((model) => (
                  <option key={model.name} value={model.name.replace('models/', '')}>
                    {model.displayName}
                  </option>
                ))}
              </select>
              {isLoadingModels && <small>{t('apiConfig.fetchModelsLoading')}</small>}
            </div>
          )}

          <div className="input-group">
            <label htmlFor="openai-key">{t('apiConfig.openaiKeyLabel')}</label>
            <input
              id="openai-key"
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className="api-input"
            />
            <small>
              <a
                href="https://platform.openai.com/account/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get API key
              </a>
            </small>
          </div>

          {error && (
            <div className="error-message" style={{ color: '#d32f2f', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#ffebee', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!geminiKey.trim() && !openaiKey.trim()}
            className="submit-button"
          >
            {t('apiConfig.submit')}
          </button>
        </form>

        <div className="info-box">
          <strong>{t('apiConfig.noteTitle')}</strong> {t('apiConfig.noteBody')}
        </div>
      </div>
    </div>
  );
};
