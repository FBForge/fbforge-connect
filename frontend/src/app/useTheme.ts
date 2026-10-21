import { ref } from 'vue';
type Theme = 'light' | 'dark';

/** Appearance is optional. Storage failures must never block the application. */
export function useTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('fit-connect.theme');
  } catch {
    // A restricted WebView can still follow the system preference.
  }
  const theme = ref<Theme>(
    saved === 'light' || saved === 'dark'
      ? saved
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
  );
  document.documentElement.dataset.theme = theme.value;
  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme.value;
    try {
      localStorage.setItem('fit-connect.theme', theme.value);
    } catch {
      // Keep the current theme for this session.
    }
  }
  return { theme, toggleTheme };
}
