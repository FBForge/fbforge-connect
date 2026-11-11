<script setup>
import { computed, watch, ref, shallowRef, nextTick } from 'vue';
import { invoke } from '../native.ts';
import { saveTestLibrary, readTestLibrary, testLibraryError } from '../test-library.js';
import { readTestFlow } from '../integration/test-flow-library.js';
import { listTests, readTest, removeTest } from '../integration/scenarios/collection.ts';
import { saveScenario } from '../integration/scenarios/storage.ts';
import { scenarioFrom } from '../integration/scenarios/model.ts';
import { serializeTestPack, TEST_PACK_BYTES } from '../test-packs.js';
import { downloadLocal } from '../local-download.js';
import FileDropInput from '../FileDropInput.vue';
const props = defineProps({ disabled: Boolean, createPack: Function });
const emit = defineEmits(['choose', 'busy', 'manage']);
const entries = shallowRef([]),
  choice = ref(''),
  caseId = ref(''),
  document = shallowRef(null);
const pending = ref(false),
  error = ref(''),
  notice = ref(''),
  removal = ref(null),
  removeDialog = ref(null),
  removeButton = ref(null),
  managementSummary = ref(null);
const selected = computed(() => entries.value.find((entry) => `${entry.kind}:${entry.id}` === choice.value));
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
async function readSelection() {
  document.value = null;
  caseId.value = '';
  if (!selected.value) return;
  const entry = selected.value,
    value = await readTest(invoke, entry);
  if (selected.value !== entry) return;
  document.value = value;
  caseId.value = value.pack.cases[0].id;
}
async function refresh() {
  entries.value = await listTests(invoke);
  if (!selected.value)
    choice.value = entries.value.length ? `${entries.value[0].kind}:${entries.value[0].id}` : '';
  await readSelection();
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
function chooseEntry() {
  void act(readSelection);
}
async function store(pack) {
  claimBusy();
  const entry = await saveTestLibrary(invoke, pack);
  choice.value = `pack:${entry.id}`;
  await refresh();
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
      if (await downloadLocal(serializeTestPack(pack), 'testfall.fctest.json'))
        notice.value = 'Testfall als unverschlüsselte Datei exportiert.';
    } else await store(pack);
  }, 'save');
}
function load() {
  if (!selected.value) return;
  void act(async () => {
    claimBusy();
    const value = await readTest(invoke, selected.value);
    const item = value.pack.cases.find((item) => item.id === caseId.value);
    if (!item) throw Error('test_pack_invalid');
    ownsBusy = false;
    emit('busy', false);
    await nextTick();
    emit('choose', structuredClone(item));
  });
}
function exportSelected() {
  if (selected.value)
    void act(async () => {
      const entry = selected.value;
      const value =
        entry.kind === 'pack'
          ? await readTestLibrary(invoke, entry.id)
          : entry.kind === 'flow'
            ? await readTestFlow(invoke, entry.id)
            : await readTest(invoke, entry);
      await downloadLocal(JSON.stringify(value, null, 2), 'testpaket.fctest.json');
    });
}
function importPack(files) {
  if (!files[0]) return;
  void act(async () => {
    if (files[0].size > TEST_PACK_BYTES) throw Error('test_pack_limit');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await files[0].arrayBuffer()));
    if (value.format === 'fbforge-connect-testpack') await store(value);
    else {
      const definition = scenarioFrom(value);
      definition.id = crypto.randomUUID();
      claimBusy();
      await saveScenario(invoke, definition);
      choice.value = `test:${definition.id}`;
      await refresh();
      notice.value = 'Test geschützt gespeichert. Er bleibt nach einem Neustart verfügbar.';
    }
  });
}
async function confirmRemoval() {
  removal.value = selected.value;
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
  if (!removal.value) return;
  void act(async () => {
    claimBusy();
    await removeTest(invoke, removal.value);
    await refresh();
    removeDialog.value.close();
    removal.value = null;
    notice.value =
      'Test aus der lokalen Sammlung gelöscht. Bisherige Durchläufe und exportierte Dateien bleiben erhalten.';
    await nextTick();
    managementSummary.value?.focus();
  });
}
defineExpose({ saveDraft, saveNotice, saveError, pending });
</script>
<template>
  <details class="test-case-library">
    <summary>Gespeicherten Test verwenden</summary>
    <div v-if="entries.length" class="test-case-choice">
      <label for="send-library-choice">
        Gespeicherten Test auswählen
        <select
          id="send-library-choice"
          v-model="choice"
          :disabled="disabled || pending"
          @change="chooseEntry"
        >
          <option v-for="entry in entries" :key="entry.kind + entry.id" :value="`${entry.kind}:${entry.id}`">
            {{ entry.name }}
          </option>
        </select>
      </label>
      <label v-if="document && document.pack.cases.length > 1">
        Testfall auswählen
        <select v-model="caseId" :disabled="disabled || pending">
          <option v-for="item in document.pack.cases" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <button
        class="button secondary"
        type="button"
        :disabled="disabled || pending || !document"
        @click="load"
      >
        Testfall laden
      </button>
    </div>
    <p v-else-if="!pending" class="small-note">
      Noch keine Tests gespeichert. Sie können diesen Entwurf als Testfall speichern.
    </p>
    <p class="small-note">
      Ihre geschützte Sammlung steht auch unter „Integration testen“ zur Verfügung und bleibt nach einem
      Neustart erhalten.
    </p>
    <button class="button secondary" :disabled="disabled || pending" @click="emit('manage')">
      Tests bearbeiten und durchführen
    </button>
    <details>
      <summary ref="managementSummary">Tests importieren, exportieren und löschen</summary>
      <p class="small-note">
        Die lokale Sammlung ist für Ihr Windows-Benutzerkonto verschlüsselt. Exportierte Dateien sind
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
    <p v-if="pending && messageScope !== 'save'" role="status">Testsammlung wird verarbeitet …</p>
    <p v-if="notice && messageScope !== 'save'" role="status">{{ notice }}</p>
    <p v-if="error && messageScope !== 'save'" role="alert">{{ error }}</p>
    <dialog
      ref="removeDialog"
      class="tool-dialog"
      aria-labelledby="delete-test-title"
      @cancel.prevent="closeRemoval"
    >
      <h2 id="delete-test-title">Test aus der Sammlung löschen?</h2>
      <p>
        {{ removal?.name }}. Der Test und seine ursprüngliche Vorlage werden entfernt. Ihr aktueller Entwurf,
        bisherige Durchläufe und exportierte Dateien bleiben erhalten.
      </p>
      <p v-if="error && messageScope !== 'save'" role="alert">{{ error }}</p>
      <div class="client-actions">
        <button class="button secondary" type="button" autofocus :disabled="pending" @click="closeRemoval">
          Abbrechen
        </button>
        <button class="button" type="button" :disabled="pending" @click="remove">Endgültig löschen</button>
      </div>
    </dialog>
  </details>
</template>
