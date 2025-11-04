import React, { useEffect, useState } from 'react';
import { GeminiService, GeminiModel } from '../services/gemini';
import './ApiConfig.css';

interface ModelSelectorProps {
  onModelChange?: (model?: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange }) => {
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('sami_chat_gemini_model');
      if (stored) setSelectedModel(stored);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Persist selection
    try {
      if (selectedModel) {
        localStorage.setItem('sami_chat_gemini_model', selectedModel);
      } else {
        localStorage.removeItem('sami_chat_gemini_model');
      }
    } catch (e) {
      // ignore
    }

    if (onModelChange) onModelChange(selectedModel || undefined);
  }, [selectedModel, onModelChange]);

  useEffect(() => {
    const key = (() => {
      try {
        return localStorage.getItem('sami_chat_gemini_key') || '';
      } catch (e) {
        return '';
      }
    })();

    if (!key || !key.startsWith('AIza')) return;

    setIsLoading(true);
    const svc = new GeminiService(key);
    svc.listAvailableModels()
      .then((m) => {
        setAvailableModels(m);
        if (m.length > 0 && !selectedModel) {
          const first = m[0].name.replace('models/', '');
          setSelectedModel(first);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [selectedModel]);

  return (
    <div style={{ display: 'inline-block', marginLeft: 12 }}>
      <label htmlFor="header-gemini-model" style={{ position: 'absolute', left: '-9999px' }}>Gemini model</label>
      <select
        id="header-gemini-model"
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        className="api-input"
        style={{ minWidth: 180 }}
      >
        {availableModels.length === 0 && <option value="">(default)</option>}
        {availableModels.map((model) => (
          <option key={model.name} value={model.name.replace('models/', '')}>
            {model.displayName}
          </option>
        ))}
      </select>
      {isLoading && <small style={{ marginLeft: 8 }}>Loading…</small>}
    </div>
  );
};
