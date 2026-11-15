import { onMounted, onBeforeUnmount } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
export function useFileNavigationGuard() {
  function preventFileNavigation(event) {
    event.preventDefault();
  }
  function preventContextMenu(event) {
    // Keep text editing available while suppressing the WebView browser menu elsewhere.
    if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
  }
  onMounted(() => {
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    if (isTauri()) document.addEventListener('contextmenu', preventContextMenu);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('dragover', preventFileNavigation);
    window.removeEventListener('drop', preventFileNavigation);
    document.removeEventListener('contextmenu', preventContextMenu);
  });
}
