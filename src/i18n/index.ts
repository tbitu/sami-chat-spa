import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import nb from './locales/nb.json';
import sme from './locales/sme.json';

const resources = {
  en: { translation: en },
  nb: { translation: nb },
  sme: { translation: sme },
};

// Use saved language if present (i18next uses 'i18nextLng' in localStorage)
const saved = (typeof window !== 'undefined' && (localStorage.getItem('i18nextLng') || localStorage.getItem('language')))
  ? (localStorage.getItem('i18nextLng') || localStorage.getItem('language'))
  : null;

const defaultLng = saved || 'sme';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: defaultLng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
