import { computed, ref } from 'vue';
import { exampleMessages } from './generate-example.js';
import { xmlMessageKey } from './xml-examples.js';

// A selection belongs to the exact loaded package, never to a previous recipient or schema.
export function useExampleMessages() {
  const roots = ref([]),
    selection = ref('');
  let previous = null;
  const requestedRoot = computed(() => roots.value.find((root) => xmlMessageKey(root) === selection.value));
  function reset() {
    previous = null;
    roots.value = [];
    selection.value = '';
  }
  function choose(source, mime, uri) {
    let messages;
    try {
      messages = exampleMessages(source, mime, uri);
    } catch (cause) {
      reset();
      throw cause;
    }
    roots.value = messages.roots;
    if (previous !== source || !requestedRoot.value)
      selection.value = messages.selected ? xmlMessageKey(messages.selected) : '';
    previous = source;
    return !roots.value.length || Boolean(requestedRoot.value);
  }
  return { roots, selection, requestedRoot, choose, reset };
}
