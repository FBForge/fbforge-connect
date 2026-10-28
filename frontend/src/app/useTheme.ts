import { ref, watch, onScopeDispose } from 'vue';
type Theme = 'light' | 'dark';
type Preference = Theme | 'system';

/** Appearance is optional. Storage failures must never block the application. */
export function useTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('fit-connect.theme');
  } catch {
    // A restricted WebView can still follow the system preference.
  }
  const preference = ref<Preference>(saved === 'light' || saved === 'dark' ? saved : 'system');
  const media = matchMedia('(prefers-color-scheme: dark)');
  const theme = ref<Theme>('light');
  function apply() {
    theme.value = preference.value === 'system' ? (media.matches ? 'dark' : 'light') : preference.value;
    document.documentElement.dataset.theme = theme.value;
  }
  watch(preference, apply, { immediate: true });
  media.addEventListener('change', apply);
  onScopeDispose(() => media.removeEventListener('change', apply));
  function setPreference(value: Preference): void {
    preference.value = value;
    try {
      if (value === 'system') localStorage.removeItem('fit-connect.theme');
      else localStorage.setItem('fit-connect.theme', value);
    } catch {
      // Keep the current theme for this session.
    }
  }
  return { theme, preference, setPreference };
}
