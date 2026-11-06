import { ref, computed, watch } from 'vue';
import { messageFor, messageOptions } from './messages.ts';
import { messageFields } from './fields.ts';
import type { Scenario, Scope } from './types.ts';
export function useMessageFields(source: () => Scenario) {
  const caseId = ref(source().pack.cases[0].id),
    scope = ref<Scope>('request'),
    path = ref('');
  const item = computed(
    () => source().pack.cases.find((c) => c.id === caseId.value) || source().pack.cases[0],
  );
  const options = computed(() => messageOptions(source(), item.value.id));
  const message = computed(() => messageFor(source().pack, source().followups, item.value.id, scope.value));
  const fields = computed(() => {
    try {
      return message.value ? messageFields(message.value.data, message.value.mimeType) : [];
    } catch {
      return [];
    }
  });
  const selected = computed(() => fields.value.find((f) => f.path === path.value));
  watch(options, (value) => {
    if (!value.some((option) => option.value === scope.value)) scope.value = 'request';
  });
  watch(fields, (value) => {
    if (!value.some((field) => field.path === path.value)) path.value = '';
  });
  return { caseId, scope, path, item, message, fields, selected, options };
}
