import { prefs } from './ui.js';

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  prefs.set('theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111827' : '#4f46e5');
  window.dispatchEvent(new CustomEvent('themechange'));
}

export const toggleTheme = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
