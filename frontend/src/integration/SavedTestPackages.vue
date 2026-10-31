<script setup>
import { ref, onBeforeUnmount } from 'vue';
import { invoke } from '../native.js';
import { listTestLibrary, readTestLibrary, saveTestLibrary, testLibraryError } from '../test-library.js';
const props = defineProps({ createPack: Function, disabled: Boolean, hasPack: Boolean });
const emit = defineEmits(['open']);
const entries = ref([]),
  choice = ref(''),
  pending = ref(false),
  notice = ref(''),
  error = ref('');
let alive = true;
onBeforeUnmount(() => {
  alive = false;
});
async function act(operation) {
  if (props.disabled || pending.value) return;
  pending.value = true;
  error.value = notice.value = '';
  try {
    await operation();
  } catch (cause) {
    if (alive) error.value = testLibraryError(cause);
  } finally {
    if (alive) pending.value = false;
  }
}
function load() {
  return act(async () => {
    const rows = await listTestLibrary(invoke);
    if (!alive) return;
    entries.value = rows;
    notice.value = rows.length ? '' : 'Noch keine Testpakete gespeichert.';
  });
}
function save() {
  // Validate and commit the edited expectations before claiming the asynchronous storage operation.
  if (props.disabled || pending.value) return;
  const pack = props.createPack();
  if (!pack) return;
  return act(async () => {
    const entry = await saveTestLibrary(invoke, pack);
    const rows = await listTestLibrary(invoke);
    if (!alive) return;
    entries.value = rows;
    choice.value = entry.id;
    notice.value =
      'Testpaket dauerhaft und verschlüsselt für Ihr Windows-Benutzerkonto gespeichert. Es bleibt nach einem Neustart verfügbar.';
  });
}
function open() {
  return act(async () => {
    const pack = await readTestLibrary(invoke, choice.value);
    if (alive) emit('open', pack);
  });
}
</script>
<template>
  <section aria-label="Geschützte Testpaketsammlung">
    <div class="client-actions">
      <button
        class="button secondary"
        type="button"
        :disabled="disabled || pending || !hasPack"
        @click="save"
      >
        In Testpaketsammlung speichern
      </button>
      <button class="button secondary" type="button" :disabled="disabled || pending" @click="load">
        Gespeicherte Testpakete laden
      </button>
    </div>
    <p class="small-note">
      Dieselbe lokale Sammlung steht im Versand und in Testabläufen zur Verfügung. Dateiexporte sind
      unverschlüsselt.
    </p>
    <template v-if="entries.length">
      <label>
        <span id="saved-package-choice-label">Gespeichertes Testpaket auswählen</span>
        <select aria-labelledby="saved-package-choice-label" v-model="choice" :disabled="disabled || pending">
          <option value="">Bitte auswählen</option>
          <option v-for="entry in entries" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
        </select>
      </label>
      <div class="client-actions">
        <button
          class="button secondary"
          type="button"
          :disabled="disabled || pending || !choice"
          @click="open"
        >
          Gespeichertes Testpaket öffnen
        </button>
      </div>
    </template>
    <p v-if="pending" role="status">Testpaketsammlung wird verarbeitet …</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
