// Chat interface component
import React, { useState, useRef, useEffect } from 'react';
import { Message } from './Message';
import './ChatInterface.css';
import { useTranslation } from 'react-i18next';
import type { SamiLanguage } from '../types/chat';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  onSendMessage: (message: string, preserveFormatting?: boolean) => Promise<string>;
  isLoading: boolean;
  onModelChange?: (model?: string) => void;
  onClearSession?: () => void;
  currentLanguage: SamiLanguage;
  onLanguageChange: (language: SamiLanguage) => void;
}
import { ModelSelector } from './ModelSelector';
import { LanguageSelector } from './LanguageSelector';
import { sanitizePlaceholders } from '../utils/markdown';
import './menu.css';

const DISPLAY_MESSAGES_STORAGE_KEY = 'sami_chat_display_messages';

// Helper functions for display message persistence
function saveDisplayMessages(messages: DisplayMessage[]): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(DISPLAY_MESSAGES_STORAGE_KEY, JSON.stringify(messages));
    }
  } catch (e) {
    console.warn('Failed to save display messages to sessionStorage:', e);
  }
}

function loadDisplayMessages(): DisplayMessage[] {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = sessionStorage.getItem(DISPLAY_MESSAGES_STORAGE_KEY);
      if (stored) {
        const messages = JSON.parse(stored) as DisplayMessage[];
        // Restore Date objects and sanitize any legacy placeholders
        return messages.map(msg => ({
          ...msg,
          content: sanitizePlaceholders(msg.content),
          timestamp: new Date(msg.timestamp),
        }));
      }
    }
  } catch (e) {
    console.warn('Failed to load display messages from sessionStorage:', e);
  }
  return [];
}

function clearDisplayMessages(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(DISPLAY_MESSAGES_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Failed to clear display messages from sessionStorage:', e);
  }
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  onSendMessage,
  isLoading,
  onModelChange,
  onClearSession,
  currentLanguage,
  onLanguageChange,
}) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    // Load messages from sessionStorage on mount
    return loadDisplayMessages();
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [preserveFormatting, setPreserveFormatting] = useState<boolean>(() => {
    // Load preserve formatting preference from localStorage
    try {
      const saved = localStorage.getItem('sami_chat_preserve_formatting');
      // Default to true if not set (enable markdown preservation by default)
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    saveDisplayMessages(messages);
  }, [messages]);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus the input on mount so users can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep preserveFormatting in sync if changed from other overlays
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        // @ts-ignore - CustomEvent
        const val = (ev as CustomEvent).detail?.value;
        if (typeof val === 'boolean') setPreserveFormatting(val);
      } catch {
        // ignore
      }
    };
    window.addEventListener('sami_preserve_formatting_changed', handler as EventListener);
    return () => window.removeEventListener('sami_preserve_formatting_changed', handler as EventListener);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[ChatInterface] Form submitted, input:', input);
    console.log('[ChatInterface] isLoading:', isLoading);
    
    if (!input.trim() || isLoading) return;

    console.log('[ChatInterface] Proceeding with message send');
    
    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = input; // Store before clearing
  setInput('');
  // keep focus in the input after sending
  inputRef.current?.focus();

    console.log('[ChatInterface] Calling onSendMessage with preserveFormatting:', preserveFormatting);
    
    try {
      const response = await onSendMessage(messageToSend, preserveFormatting);
      
      console.log('[ChatInterface] onSendMessage completed');
      
      // Add assistant response
      const assistantMessage: DisplayMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: sanitizePlaceholders(response),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('[ChatInterface] Error sending message:', error);
      
      const errorMessage: DisplayMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Meattáhus čuožžilii: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Note: chat clearing is available via the hamburger menu (resetPersistence).

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h1>{t('chatInterface.title')}</h1>
        <div className="header-controls">
          {/* Language selector for Sami languages */}
          <LanguageSelector
            currentLanguage={currentLanguage}
            onLanguageChange={onLanguageChange}
          />
          {/* Model selector moved into hamburger menu as a submenu */}
          {/* Formatting toggle moved into hamburger menu (preserveFormatting state still lives here) */}
          {/* Hamburger menu (language selection removed) */}
          <div style={{ position: 'relative' }} aria-hidden={false}>
            <div className="hc-menu" style={{ marginLeft: 8 }}>
              <button
                aria-label="menu"
                onClick={() => setMenuOpen(!menuOpen)}
                className="hc-menu-button"
              >
                ☰
              </button>
              {menuOpen && (
                <div className="hc-menu-dropdown">
                  <div className="hc-menu-section hc-menu-actions">
                    <button onClick={() => { clearDisplayMessages(); setMessages([]); setMenuOpen(false); if (onClearSession) onClearSession(); setTimeout(() => window.location.reload(), 50); }}>{t('menu.salke')}</button>
                    <button onClick={() => { clearPersistence(); window.location.reload(); }}>{t('menu.resetPersistence')}</button>
                  </div>

                  <div className="hc-menu-section hc-menu-section--separator">
                    <label>
                      <input type="checkbox" checked={preserveFormatting} onChange={(e) => { const newValue = e.target.checked; setPreserveFormatting(newValue); try { localStorage.setItem('sami_chat_preserve_formatting', String(newValue)); window.dispatchEvent(new CustomEvent('sami_preserve_formatting_changed', { detail: { value: newValue } })); } catch {} }} />
                      <span style={{ marginLeft: 8 }}>{t('chatInterface.preserveFormatting')}</span>
                    </label>
                  </div>

                  <div className="hc-menu-section hc-menu-section--separator">
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('menu.modelSelectorTitle') || 'Model'}</div>
                    <ModelSelector onModelChange={onModelChange} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Removed external red 'Sálke' clear button; kept clear functionality in the menu */}
        </div>
      </div>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>{t('chatInterface.empty.welcome')}</p>
            <p>{t('chatInterface.empty.hint')}</p>
          </div>
        )}
        {messages.map((msg) => (
          <Message key={msg.id} role={msg.role} content={sanitizePlaceholders(msg.content)} />
        ))}
        {isLoading && (
          <div className="loading-indicator">
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chatInterface.inputPlaceholder')}
          disabled={isLoading}
          className="message-input"
        />
        <button type="submit" disabled={!input.trim() || isLoading} className="send-button">
          {t('chatInterface.send')}
        </button>
      </form>
    </div>
  );
};
