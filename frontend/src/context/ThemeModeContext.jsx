import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { darkTheme, lightTheme } from '../GlobalStyles';

const STORAGE_KEY = 'beta-admin-theme-mode';

const ThemeModeContext = createContext(null);

export const ThemeModeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (error) {
      console.error('Could not read theme mode from storage:', error);
    }
    return 'light';
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      console.error('Could not save theme mode:', error);
    }
    document.documentElement.setAttribute('data-theme-mode', mode);
  }, [mode]);

  const toggleMode = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const theme = mode === 'dark' ? darkTheme : lightTheme;

  const value = useMemo(
    () => ({
      mode,
      setMode,
      toggleMode,
      isDark: mode === 'dark',
      theme,
    }),
    [mode, theme],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
};

export const useThemeMode = () => {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeModeProvider');
  }
  return context;
};
