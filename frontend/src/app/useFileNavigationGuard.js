import { onMounted, onBeforeUnmount } from 'vue';
export function useFileNavigationGuard() {
  function preventFileNavigation(event) {
    event.preventDefault();
  }
  onMounted(() => {
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('dragover', preventFileNavigation);
    window.removeEventListener('drop', preventFileNavigation);
  });
}
