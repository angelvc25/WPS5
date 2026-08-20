import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  Language,
  TranslationKey,
  translations,
} from '@/i18n/translations';

type Vars = Record<string, string | number>;

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
}

function loadLanguage(): Language {
  try {
    if (typeof localStorage === 'undefined') return 'es';
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // ignore
  }
  return 'es';
}

function persistLanguage(lang: Language) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  } catch {
    // ignore
  }
}

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  ));
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'es',
  setLanguage: () => {},
  t: (key) => translations.es[key] ?? String(key),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(loadLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    persistLanguage(lang);
  }, []);

  const t = useCallback((key: TranslationKey, vars?: Vars) => {
    const dict = translations[language] || translations.es;
    return interpolate(dict[key] ?? translations.es[key] ?? String(key), vars);
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
