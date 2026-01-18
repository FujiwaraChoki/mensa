import { browser } from '$app/environment';
import type { Theme } from '$lib/types';

export function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    if (!browser) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export function applyTheme(theme: Theme): void {
  if (!browser) return;
  document.documentElement.setAttribute('data-theme', getEffectiveTheme(theme));
}

export function subscribeToSystemTheme(callback: () => void): () => void {
  if (!browser) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}
