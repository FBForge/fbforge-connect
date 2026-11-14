<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { invoke } from '../native.ts';
import {
  listAnswerSchemas,
  readAnswerSchema,
  saveAnswerSchema,
  deleteAnswerSchema,
  answerSchemaError,
} from '../answer-schema-library.js';
const props = defineProps({ session: Object, result: Object, disabled: Boolean });
const emit = defineEmits(['load', 'busy']);
const rows = ref([]),
  choice = ref(''),
  pending = ref(false),
  error = ref(''),
  notice = ref(''),
  confirmation = ref(null);
let generation = 0,
  refreshNeeded = false;
onBeforeUnmount(() => {
  generation++;
  emit('busy', false);
});
watch(pending, (value) => emit('busy', value));
async function act(operation) {
  if (pending.value || props.disabled || !props.session) return;
  const stamp = generation,
    active = { ...props.session },
    current = () => stamp === generation;
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    await operation(active, current);
  } catch (cause) {
    if (current()) error.value = answerSchemaError(cause);
  } finally {
    if (current()) pending.value = false;
  }
}
function refresh() {
  return act(async (active, current) => {
    refreshNeeded = false;
    const value = await listAnswerSchemas(invoke, active);
    if (current()) {
      rows.value = value;
    }
  });
}
watch(
  () => props.session?.sessionId,
  () => {
    generation++;
    rows.value = [];
    choice.value = '';
    confirmation.value = null;
    pending.value = false;
    refreshNeeded = Boolean(props.session);
    void refresh();
  },
  { immediate: true },
);
watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled && refreshNeeded) void refresh();
  },
);
watch(
  () => props.result,
  () => {
    confirmation.value = null;
  },
);
function load() {
  return act(async (active, current) => {
    const entry = await readAnswerSchema(invoke, active, choice.value);
    if (entry && current()) emit('load', entry.draft.definition);
  });
}
function save(confirmed = false) {
  return act(async (active, current) => {
    if (!props.result) return;
    const result = JSON.parse(JSON.stringify(props.result));
    const previous = confirmed
      ? confirmation.value?.entry
      : await readAnswerSchema(invoke, active, result.schema.$id);
    if (!current()) return;
    if (previous && !confirmed) {
      confirmation.value = { kind: 'replace', entry: previous };
      return;
    }
    const next = await saveAnswerSchema(invoke, active, result, previous);
    if (current()) {
      rows.value = next;
      choice.value = result.schema.$id;
      confirmation.value = null;
      notice.value = 'Antwortschema im Profil gespeichert. Bei derselben URI wird es automatisch verwendet.';
    }
  });
}
function remove() {
  return act(async (active, current) => {
    const next = await deleteAnswerSchema(invoke, active, confirmation.value.entry);
    if (current()) {
      rows.value = next;
      choice.value = '';
      confirmation.value = null;
      notice.value = 'Antwortschema aus dem Profil entfernt.';
    }
  });
}
</script>
<template>
  <section class="saved-answer-schemas" aria-label="Antwortschemas im Profil">
    <h3>Antwortschemas im Profil</h3>
    <p v-if="!session" class="small-note">
      Zum dauerhaften Speichern ein Profil verbinden. Sie können den Entwurf weiterhin als Datei exportieren.
    </p>
    <template v-else>
      <div class="client-actions">
        <button class="button" :disabled="disabled || pending || !result" @click="save()">
          Im Profil speichern
        </button>
        <button class="button secondary" :disabled="disabled || pending" @click="refresh">
          Bibliothek aktualisieren
        </button>
      </div>
      <div v-if="rows.length" class="saved-schema-picker">
        <label>
          Gespeichertes Antwortschema
          <select v-model="choice" :disabled="disabled || pending">
            <option value="">Bitte auswählen</option>
            <option v-for="row in rows" :key="row.uri" :value="row.uri">
              {{ row.title }} · {{ row.uri }}
            </option>
          </select>
        </label>
        <div class="client-actions">
          <button class="button secondary" :disabled="disabled || pending || !choice" @click="load">
            Entwurf öffnen
          </button>
          <button
            class="button secondary"
            :disabled="disabled || pending || !choice"
            @click="confirmation = { kind: 'delete', entry: rows.find((r) => r.uri === choice) }"
          >
            Aus Profil entfernen
          </button>
        </div>
      </div>
      <div
        v-if="confirmation"
        class="notice warning"
        role="group"
        :aria-label="confirmation.kind === 'replace' ? 'Antwortschema ersetzen' : 'Antwortschema entfernen'"
      >
        <p>
          {{
            confirmation.kind === 'replace'
              ? 'Unter dieser URI ist bereits ein Schema gespeichert. Die neue Definition ersetzt es für künftige lokale Prüfungen. Für inkompatible Änderungen eine neue URI verwenden.'
              : 'Dieses Antwortschema aus dem Profil entfernen? Exportierte Dateien bleiben erhalten.'
          }}
        </p>
        <code>{{ confirmation.entry.uri }}</code>
        <div class="client-actions">
          <button class="button secondary" :disabled="pending" @click="confirmation = null">Abbrechen</button>
          <button
            class="button"
            :disabled="pending"
            @click="confirmation.kind === 'replace' ? save(true) : remove()"
          >
            {{ confirmation.kind === 'replace' ? 'Definition ersetzen' : 'Jetzt entfernen' }}
          </button>
        </div>
      </div>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.saved-answer-schemas {
  border-block: 1px solid var(--line);
  padding-block: 1rem;
  margin-block: 1.5rem;
}
.saved-schema-picker {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}
</style>
