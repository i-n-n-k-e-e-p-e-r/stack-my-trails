import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Appearance } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSetting, setSetting } from '@/lib/db';

export type ThemePreference = 'light' | 'dark' | 'auto';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'auto',
  setPreference: () => {},
});

export function useThemePreference() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [preference, setPreferenceState] = useState<ThemePreference>('auto');

  useEffect(() => {
    getSetting(db, 'theme')
      .then((value) => {
        if (value === 'light' || value === 'dark' || value === 'auto') {
          setPreferenceState(value);
          Appearance.setColorScheme(value === 'auto' ? null : value);
        }
      })
      .catch(() => {});
  }, [db]);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      Appearance.setColorScheme(pref === 'auto' ? null : pref);
      setSetting(db, 'theme', pref).catch(() => {});
    },
    [db],
  );

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
