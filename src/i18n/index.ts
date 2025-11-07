import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import nb from './locales/nb.json';
import sme from './locales/sme.json';
import smj from './locales/smj.json';
import sma from './locales/sma.json';
import smn from './locales/smn.json';
import sms from './locales/sms.json';

const resources = {
  en: { translation: en },
  nb: { translation: nb },
  sme: { translation: sme },
  smj: { translation: smj },
  sma: { translation: sma },
  smn: { translation: smn },
  sms: { translation: sms },
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
