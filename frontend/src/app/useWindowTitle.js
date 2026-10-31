import { watch } from 'vue';
import { productName } from '../product.js';
export function useWindowTitle(environment) {
  watch(
    environment,
    (value) => {
      document.title = `${productName} · FIT-Connect ${value}`;
    },
    { immediate: true },
  );
}
