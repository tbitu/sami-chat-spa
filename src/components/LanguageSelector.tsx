// Language selector component for Sami languages
import React from 'react';
import type { SamiLanguage } from '../types/chat';
import './ApiConfig.css';

interface LanguageSelectorProps {
  currentLanguage: SamiLanguage;
  onLanguageChange: (language: SamiLanguage) => void;
}

// Sami languages supported by TartuNLP with Finnish translation pairs
const SAMI_LANGUAGES: Array<{ code: SamiLanguage; name: string; nativeName: string }> = [
  { code: 'sme', name: 'Northern Sami', nativeName: 'Davvisámegiella' },
  { code: 'smj', name: 'Lule Sami', nativeName: 'Julevsámegiella' },
  { code: 'sma', name: 'Southern Sami', nativeName: 'Åarjelsaemien' },
  { code: 'smn', name: 'Inari Sami', nativeName: 'Anarâškielâ' },
  { code: 'sms', name: 'Skolt Sami', nativeName: 'Sääʹmǩiõll' },
];

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  currentLanguage,
  onLanguageChange,
}) => {
  return (
    <div style={{ display: 'inline-block' }}>
      <label htmlFor="sami-language-selector" style={{ position: 'absolute', left: '-9999px' }}>
        Sami language
      </label>
      <select
        id="sami-language-selector"
        value={currentLanguage}
        onChange={(e) => onLanguageChange(e.target.value as SamiLanguage)}
        className="api-input"
        style={{ minWidth: 180 }}
        aria-label="Select Sami language"
      >
        {SAMI_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName}
          </option>
        ))}
      </select>
    </div>
  );
};
