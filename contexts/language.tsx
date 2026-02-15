import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Platform, NativeModules } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSetting, setSetting } from '@/lib/db';
import { translate, SUPPORTED_LANGUAGES, type Language } from '@/lib/i18n';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export function useTranslation() {
  return useContext(LanguageContext);
}

function getDeviceLanguage(): Language {
  try {
    const locale =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ??
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ??
          'en'
        : NativeModules.I18nManager?.localeIdentifier ?? 'en';
    // Extract the language code (e.g. "pt-BR" → "pt", "de_DE" → "de")
    const code = locale.split(/[-_]/)[0].toLowerCase();
    if (SUPPORTED_LANGUAGES.has(code)) return code as Language;
  } catch {}
  return 'en';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [language, setLanguageState] = useState<Language>(getDeviceLanguage);

  useEffect(() => {
    getSetting(db, 'language')
      .then((value) => {
        if (value && SUPPORTED_LANGUAGES.has(value)) {
          setLanguageState(value as Language);
        }
      })
      .catch(() => {});
  }, [db]);

  const setLanguage = useCallback(
    (lang: Language) => {
      setLanguageState(lang);
      setSetting(db, 'language', lang).catch(() => {});
    },
    [db],
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
