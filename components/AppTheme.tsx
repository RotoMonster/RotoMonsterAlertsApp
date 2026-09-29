import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = '@rm_alerts:theme';

const light = {
  bg: '#f8fafc',
  card: '#ffffff',
  bar: '#ffffff',
  text: '#1e293b',
  body: '#475569',
  sub: '#64748b',
  muted: '#94a3b8',
  border: '#e2e8f0',
  control: '#cbd5e1',
  link: '#2563eb',
  linkBg: '#eff6ff',
  allTab: '#475569',
  tabInactive: '#999999',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0f172a',
  card: '#1e293b',
  bar: '#111827',
  text: '#e2e8f0',
  body: '#cbd5e1',
  sub: '#94a3b8',
  muted: '#64748b',
  border: '#334155',
  control: '#475569',
  link: '#60a5fa',
  linkBg: 'rgba(96, 165, 250, 0.15)',
  allTab: '#cbd5e1',
  tabInactive: '#64748b',
  danger: '#f87171',
  dangerBg: 'rgba(220, 38, 38, 0.12)',
  dangerBorder: 'rgba(220, 38, 38, 0.35)',
};

type AppThemeValue = {
  preference: ThemePreference;
  scheme: 'light' | 'dark';
  colors: Palette;
  setPreference: (preference: ThemePreference) => void;
};

const AppThemeContext = createContext<AppThemeValue>({
  preference: 'system',
  scheme: 'light',
  colors: light,
  setPreference: () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (stored === 'system' || stored === 'light' || stored === 'dark') setPreferenceState(stored);
      })
      .catch(() => {});
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
  }, []);

  const scheme: 'light' | 'dark' = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ preference, scheme, colors: scheme === 'dark' ? dark : light, setPreference }),
    [preference, scheme, setPreference]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export const useAppTheme = () => useContext(AppThemeContext);
