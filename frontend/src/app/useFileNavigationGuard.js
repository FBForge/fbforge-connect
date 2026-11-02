import { onMounted, onBeforeUnmount } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
export function useFileNavigationGuard() {
  function preventFileNavigation(event) {
    event.preventDefault();
  }
  onMounted(() => {
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    if (isTauri()) document.addEventListener('contextmenu', preventFileNavigation);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('dragover', preventFileNavigation);
    window.removeEventListener('drop', preventFileNavigation);
    document.removeEventListener('contextmenu', preventFileNavigation);
  });
}
