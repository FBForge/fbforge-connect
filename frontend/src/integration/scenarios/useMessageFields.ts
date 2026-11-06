import { ref, computed } from 'vue';
import { messageFields } from './fields.ts';
import type { Scenario, Scope } from './types.ts';
export function useMessageFields(source: () => Scenario) {
  const caseId = ref(source().pack.cases[0].id),
    scope = ref<Scope>('request'),
    path = ref('');
  const item = computed(
    () => source().pack.cases.find((c) => c.id === caseId.value) || source().pack.cases[0],
  );
  const message = computed(() => item.value[scope.value]);
  const fields = computed(() => {
    try {
      return message.value ? messageFields(message.value.data, message.value.mimeType) : [];
    } catch {
      return [];
    }
  });
  const selected = computed(() => fields.value.find((f) => f.path === path.value));
  return { caseId, scope, path, item, message, fields, selected };
}
