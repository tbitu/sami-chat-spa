// Chat interface component
import React, { useState, useRef, useEffect } from 'react';
import { Message } from './Message';
import './ChatInterface.css';
import { useTranslation } from 'react-i18next';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatInterfaceProps {
  onSendMessage: (message: string, onProgress?: (chunk: string) => void) => Promise<string>;
  isLoading: boolean;
  onModelChange?: (model?: string) => void;
  onClearSession?: () => void;
}
import { ModelSelector } from './ModelSelector';
import { sanitizePlaceholders } from '../utils/markdown';

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
}) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    // Load messages from sessionStorage on mount
    return loadDisplayMessages();
  });
  const [menuOpen, setMenuOpen] = useState(false);
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

    // Create placeholder for streaming assistant message
    const assistantId = crypto.randomUUID();
    console.log('[ChatInterface] Created placeholder message with ID:', assistantId);
    
    const assistantMessage: DisplayMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages(prev => [...prev, assistantMessage]);

    console.log('[ChatInterface] Calling onSendMessage with callback');
    
    try {
      await onSendMessage(messageToSend, (chunk: string) => {
        const sanitized = sanitizePlaceholders(chunk);
        console.log('[ChatInterface] Progress callback - received chunk:', sanitized.length, 'chars');
        // Update the streaming message with each chunk (sanitized)
        setMessages(prev => 
          prev.map(msg => 
            msg.id === assistantId 
              ? { ...msg, content: msg.content + sanitized }
              : msg
          )
        );
      });
      
      console.log('[ChatInterface] onSendMessage completed, marking as not streaming');
      
      // Mark streaming as complete
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantId 
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    } catch (error) {
      console.error('[ChatInterface] Error sending message:', error);
      
      // Remove the placeholder and add error message
      setMessages(prev => prev.filter(msg => msg.id !== assistantId));
      
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
          {/* Model selector moved into header for quick switching */}
          <ModelSelector onModelChange={onModelChange} />
          {/* Hamburger menu (language selection removed) */}
          <div style={{ position: 'relative' }} aria-hidden={false}>
            <div className="hc-menu" style={{ display: 'inline-block', marginLeft: 8 }}>
              <button
                aria-label="menu"
                onClick={() => setMenuOpen(!menuOpen)}
                className="hc-menu-button"
              >
                ☰
              </button>
              {menuOpen && (
                <div className="hc-menu-dropdown">
                  <button
                    onClick={() => {
                      // Clear the chat session and display messages
                      clearDisplayMessages();
                      setMessages([]);
                      setMenuOpen(false);
                      // Clear the orchestrator session
                      if (onClearSession) {
                        onClearSession();
                      }
                      // Reload to reset the UI completely
                      setTimeout(() => window.location.reload(), 50);
                    }}
                  >
                    {t('menu.salke')}
                  </button>
                  <button
                    onClick={() => {
                      clearPersistence();
                      window.location.reload();
                    }}
                  >
                    {t('menu.resetPersistence')}
                  </button>
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
          <div key={msg.id}>
            <Message role={msg.role} content={sanitizePlaceholders(msg.content)} />
            {msg.isStreaming && (
              <div className="streaming-indicator">
                <div className="spinner"></div>
                <span>{t('chatInterface.streaming')}</span>
              </div>
            )}
          </div>
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
