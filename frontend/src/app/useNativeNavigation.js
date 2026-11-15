import { onMounted, onBeforeUnmount } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
const destinations = {
  start: 'Start',
  send: 'Senden',
  receive: 'Empfangen',
  cases: 'Vorgänge',
  destinations: 'Destinations',
  process: 'Prozesse',
  events: 'Event Log',
  tests: 'Testwerkzeuge',
  scanner: 'Virenscan',
  diagnostics: 'Diagnose',
  settings: 'Einstellungen',
  help: 'Hilfe',
};
export function useNativeNavigation(navigate) {
  let remove;
  let active = true;
  onMounted(async () => {
    if (!isTauri()) return;
    try {
      const unlisten = await listen('application-navigation', ({ payload }) => {
        if (active && typeof payload === 'string' && Object.hasOwn(destinations, payload))
          void navigate(destinations[payload]);
      });
      if (active) remove = unlisten;
      else unlisten();
    } catch {
      /* Browser fixtures have no native menu events. */
    }
  });
  onBeforeUnmount(() => {
    active = false;
    remove?.();
  });
}
