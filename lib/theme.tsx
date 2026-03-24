import React, { createContext, useContext, useState, useEffect } from 'react';
import db from './database';

export const themes = {
  dark: {
    background: '#111827',
    card: '#1F2937',
    input: '#374151',
    border: '#374151',
    text: '#fff',
    textSecondary: '#D1D5DB',
    textMuted: '#9CA3AF',
    primary: '#3B82F6',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
  },
  light: {
    background: '#F3F4F6',
    card: '#FFFFFF',
    input: '#E5E7EB',
    border: '#D1D5DB',
    text: '#111827',
    textSecondary: '#374151',
    textMuted: '#6B7280',
    primary: '#3B82F6',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
  },
};

type ThemeMode = 'dark' | 'light';
type ThemeColors = typeof themes.dark;

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark',
  colors: themes.dark,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    try {
      const saved = db.getFirstSync<{ value: string }>("SELECT value FROM user_settings WHERE key = 'theme_mode'");
      if (saved && (saved.value === 'dark' || saved.value === 'light')) {
        setModeState(saved.value);
      }
    } catch (_) {}
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      db.runSync("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('theme_mode', ?)", [newMode]);
    } catch (_) {}
  };

  return (
    <ThemeContext.Provider value={{ mode, colors: themes[mode], setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
