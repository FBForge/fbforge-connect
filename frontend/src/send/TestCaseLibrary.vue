<script setup>
import { computed, watch, ref, shallowRef, nextTick } from 'vue';
import { invoke } from '../native.js';
import {
  listTestLibrary,
  readTestLibrary,
  saveTestLibrary,
  deleteTestLibrary,
  testLibraryError,
} from '../test-library.js';
import { parseTestPack, serializeTestPack, testPackError, TEST_PACK_BYTES } from '../test-packs.js';
import { downloadLocal } from '../local-download.js';
import FileDropInput from '../FileDropInput.vue';
const props = defineProps({ disabled: Boolean, createPack: Function });
const emit = defineEmits(['choose', 'busy']);
const entries = shallowRef([]),
  choice = ref('');
const pending = ref(false),
  error = ref(''),
  notice = ref(''),
  removal = ref(null),
  removeDialog = ref(null),
  removeButton = ref(null),
  managementSummary = ref(null);
const selected = computed(() => {
  const [id, caseId] = choice.value.split(':');
  const entry = entries.value.find((item) => item.id === id);
  return entry && { entry, caseId };
});
const messageScope = ref('library');
const saveNotice = computed(() => (messageScope.value === 'save' ? notice.value : ''));
const saveError = computed(() => (messageScope.value === 'save' ? error.value : ''));
let ownsBusy = false;
function claimBusy() {
  ownsBusy = true;
  emit('busy', true);
}
async function act(operation, scope = 'library') {
  if (pending.value || props.disabled) return;
  messageScope.value = scope;
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    await operation();
  } catch (cause) {
    error.value = testLibraryError(cause);
  } finally {
    pending.value = false;
    if (ownsBusy) {
      ownsBusy = false;
      emit('busy', false);
    }
  }
}
async function refresh() {
  entries.value = await listTestLibrary(invoke);
  if (!selected.value && entries.value.length)
    choice.value = `${entries.value[0].id}:${entries.value[0].cases[0].id}`;
}
let loaded = false;
watch(
  () => props.disabled,
  (blocked) => {
    if (!blocked && !loaded) {
      loaded = true;
      void act(refresh);
    }
  },
  { immediate: true },
);
async function store(pack) {
  claimBusy();
  const entry = await saveTestLibrary(invoke, pack);
  entries.value = [...entries.value, entry];
  choice.value = `${entry.id}:${entry.cases[0].id}`;
  notice.value =
    'Testfall geschützt auf diesem Windows-Benutzerkonto gespeichert. Er bleibt nach einem Neustart verfügbar.';
}
function saveDraft(name, exportOnly = false) {
  return act(async () => {
    if (!name.trim()) {
      error.value = 'Bitte geben Sie dem Testfall einen Namen.';
      return;
    }
    const pack = await props.createPack(name.trim());
    if (!pack) return;
    if (exportOnly) {
      downloadLocal(serializeTestPack(pack), 'testfall.fctest.json');
      notice.value = 'Testfall als unverschlüsselte Datei exportiert.';
    } else await store(pack);
  }, 'save');
}
function load() {
  const value = selected.value;
  if (!value) return;
  act(async () => {
    claimBusy();
    const pack = await readTestLibrary(invoke, value.entry.id);
    const item = pack.cases.find((item) => item.id === value.caseId);
    if (!item) throw new Error('test_pack_invalid');
    ownsBusy = false;
    emit('busy', false);
    await nextTick();
    emit('choose', structuredClone(item));
  });
}
function exportSelected() {
  const value = selected.value;
  if (value)
    act(async () =>
      downloadLocal(
        serializeTestPack(await readTestLibrary(invoke, value.entry.id)),
        'testpaket.fctest.json',
      ),
    );
}
function importPack(files) {
  if (!files[0]) return;
  act(async () => {
    if (files[0].size > TEST_PACK_BYTES) throw new Error('test_pack_limit');
    let pack;
    try {
      pack = parseTestPack(new TextDecoder('utf-8', { fatal: true }).decode(await files[0].arrayBuffer()));
    } catch (cause) {
      error.value = testPackError(cause);
      return;
    }
    await store(pack);
  });
}
async function confirmRemoval() {
  removal.value = selected.value?.entry;
  await nextTick();
  removeDialog.value.showModal();
}
function closeRemoval() {
  if (!pending.value) {
    removeDialog.value.close();
    removal.value = null;
    removeButton.value?.focus();
  }
}
function remove() {
  const entry = removal.value;
  if (!entry) return;
  act(async () => {
    claimBusy();
    await deleteTestLibrary(invoke, entry.id);
    entries.value = entries.value.filter((item) => item.id !== entry.id);
    if (!selected.value)
      choice.value = entries.value.length ? `${entries.value[0].id}:${entries.value[0].cases[0].id}` : '';
    removeDialog.value.close();
    removal.value = null;
    notice.value = 'Testpaket aus der lokalen Sammlung gelöscht. Exportierte Dateien bleiben erhalten.';
    await nextTick();
    managementSummary.value?.focus();
  });
}
defineExpose({ saveDraft, saveNotice, saveError, pending });
</script>
<template>
  <section class="test-case-library" :aria-labelledby="entries.length ? 'send-library-title' : undefined">
    <h3 v-if="entries.length" id="send-library-title">Meine Testfälle</h3>
    <div v-if="entries.length" class="test-case-choice">
      <label for="send-library-choice">
        Gespeicherten Testfall auswählen
        <select id="send-library-choice" v-model="choice" :disabled="disabled || pending">
          <optgroup v-for="entry in entries" :key="entry.id" :label="entry.name">
            <option v-for="item in entry.cases" :key="item.id" :value="`${entry.id}:${item.id}`">
              {{ item.name }}
            </option>
          </optgroup>
        </select>
      </label>
      <button
        class="button secondary"
        type="button"
        :disabled="disabled || pending || !selected"
        @click="load"
      >
        Testfall laden
      </button>
    </div>
    <details>
      <summary ref="managementSummary">
        {{ entries.length ? 'Testpakete importieren, exportieren und löschen' : 'Testpaket importieren' }}
      </summary>
      <p class="small-note">
        Die lokale Sammlung ist für Ihr Windows-Benutzerkonto verschlüsselt. Exportierte Testpakete sind
        unverschlüsselt. Verwenden Sie fiktive Daten.
      </p>
      <div v-if="entries.length" class="client-actions">
        <button
          class="button secondary"
          type="button"
          :disabled="disabled || pending || !selected"
          @click="exportSelected"
        >
          Testpaket exportieren
        </button>
        <button
          ref="removeButton"
          class="button secondary"
          type="button"
          :disabled="disabled || pending || !selected"
          @click="confirmRemoval"
        >
          Testpaket löschen
        </button>
      </div>
      <FileDropInput
        id="send-library-import"
        label="Testpaket importieren"
        accept=".json,application/json"
        :disabled="disabled || pending"
        @files="importPack"
      />
    </details>
    <p v-if="pending && messageScope !== 'save'" role="status">Testfallsammlung wird verarbeitet …</p>
    <p v-if="notice && messageScope !== 'save'" role="status">{{ notice }}</p>
    <p v-if="error && messageScope !== 'save'" role="alert">{{ error }}</p>
    <dialog
      ref="removeDialog"
      class="tool-dialog"
      aria-labelledby="delete-test-title"
      @cancel.prevent="closeRemoval"
    >
      <h2 id="delete-test-title">Testpaket aus der Sammlung löschen?</h2>
      <p>
        {{ removal?.name }} · {{ removal?.cases.length }} Testfälle. Ihr aktueller Entwurf und exportierte
        Dateien bleiben erhalten.
      </p>
      <p v-if="error && messageScope !== 'save'" role="alert">{{ error }}</p>
      <div class="client-actions">
        <button class="button secondary" type="button" autofocus :disabled="pending" @click="closeRemoval">
          Abbrechen
        </button>
        <button class="button" type="button" :disabled="pending" @click="remove">Endgültig löschen</button>
      </div>
    </dialog>
  </section>
</template>
