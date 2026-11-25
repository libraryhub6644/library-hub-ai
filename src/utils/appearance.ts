import { useEffect, useState } from 'react';

export type AppearanceMode = 'dark' | 'light';

const STORAGE_KEY = 'lh_appearance_mode';
const EVENT_NAME = 'lh-appearance-change';

export function getSavedAppearance(): AppearanceMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyAppearanceMode(mode: AppearanceMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: mode }));
  } catch {
    // ignore storage errors
  }
}

export function useAppearanceMode(): [AppearanceMode, (mode: AppearanceMode) => void, () => void] {
  const [mode, setModeState] = useState<AppearanceMode>(() => getSavedAppearance());

  useEffect(() => {
    applyAppearanceMode(mode);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<AppearanceMode>).detail;
      if (next === 'light' || next === 'dark') {
        setModeState(next);
      }
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const setMode = (next: AppearanceMode) => {
    setModeState(next);
    applyAppearanceMode(next);
  };

  const toggleMode = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  return [mode, setMode, toggleMode];
}
