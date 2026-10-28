import { computed, inject, ref, watch } from 'vue';

export const schemaSourceAccessKey = Symbol('schemaSourceAccess');
const identity = (session) => `${session?.apiVersion || ''}/${session?.sessionId || ''}`;

export function createSchemaSourceAccess(session) {
  const allowed = ref(false);
  const key = computed(() => identity(session()));
  watch(key, () => (allowed.value = false), { flush: 'sync' });
  return { key, allowed };
}

export function useSchemaSourceAccess(session) {
  const shared = inject(schemaSourceAccessKey, null);
  const local = shared || createSchemaSourceAccess(session);
  return computed({
    get: () => local.key.value === identity(session()) && local.allowed.value,
    set: (value) => {
      if (local.key.value === identity(session())) local.allowed.value = value === true;
    },
  });
}

// Only wrap schema reads or validation. Transmission must keep its own confirmation.
export async function withSchemaSourceAccess(operation, request, current = () => true) {
  try {
    return await operation();
  } catch (cause) {
    if ((typeof cause === 'string' ? cause : cause?.message) !== 'schema_consent_required') throw cause;
    if (!current() || !(await request()) || !current()) throw new Error('content_cancelled');
    return operation();
  }
}
