<script setup>
import { ref, watch } from 'vue';
import FileDropInput from '../FileDropInput.vue';
import { invoke } from '../native.js';
import { downloadLocal } from '../local-download.js';
import { validateTemplate, profileWorkspace } from './destination-templates.js';
const props = defineProps({ session: Object, changes: Object, disabled: Boolean });
const emit = defineEmits(['apply']);
const workspace = ref(null),
  name = ref(''),
  selected = ref(''),
  error = ref(''),
  notice = ref(''),
  pending = ref(false),
  imported = ref(null);
let generation = 0;
watch(
  () => props.session?.sessionId,
  async () => {
    const stamp = ++generation;
    workspace.value = null;
    selected.value = '';
    imported.value = null;
    if (props.session)
      try {
        const data = await profileWorkspace(invoke, props.session);
        if (stamp === generation) workspace.value = data;
      } catch {
        if (stamp === generation) error.value = 'Geschützte Vorlagen konnten nicht geladen werden.';
      }
  },
  { immediate: true },
);
function template() {
  return validateTemplate({
    format: 'fbforge-connect-destination-template',
    version: 1,
    name: name.value.trim(),
    changes: props.changes,
  });
}
async function save() {
  if (props.disabled || pending.value) return;
  pending.value = true;
  error.value = '';
  notice.value = '';
  const session = { ...props.session },
    stamp = generation;
  try {
    const value = template();
    const data = await profileWorkspace(invoke, session, {
      action: 'save_template',
      template: { id: crypto.randomUUID(), name: value.name, changes: value.changes },
    });
    if (stamp === generation) {
      workspace.value = data;
      notice.value = data
        ? 'Vorlage im Profil geschützt gespeichert.'
        : 'Zum geschützten Speichern bitte ein gespeichertes Profil verbinden.';
    }
  } catch {
    if (stamp === generation)
      error.value =
        'Vorlage konnte nicht gespeichert werden. Bitte Namen, Feldauswahl und Profil prüfen (höchstens 20 Vorlagen).';
  } finally {
    pending.value = false;
  }
}
function exportFile() {
  error.value = '';
  try {
    downloadLocal(JSON.stringify(template(), null, 2), 'destination.fctemplate.json');
  } catch {
    error.value = 'Bitte der Vorlage einen Namen geben und mindestens ein gültiges Änderungsfeld wählen.';
  }
}
async function importFile(files) {
  const stamp = generation;
  imported.value = null;
  error.value = '';
  try {
    if (!files[0] || files[0].size > 24 * 1024) throw new Error();
    const value = validateTemplate(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await files[0].arrayBuffer())),
    );
    if (stamp === generation) imported.value = value;
  } catch {
    if (stamp === generation)
      error.value =
        'Keine gültige Destination-Vorlage (höchstens 24 KiB). Unbekannte Felder werden abgewiesen.';
  }
}
function apply(value) {
  if (value && !props.disabled) {
    emit('apply', JSON.parse(JSON.stringify(value.changes)));
    notice.value =
      'Vorlage in die Bearbeitung übernommen. Noch nichts auf dem Server geändert. Bitte Vorschau für die gewählten Destinations erstellen.';
  }
}
async function remove() {
  if (!selected.value || pending.value || props.disabled) return;
  const stamp = generation;
  pending.value = true;
  try {
    const value = await profileWorkspace(invoke, props.session, {
      action: 'delete_template',
      id: selected.value,
    });
    if (stamp === generation) {
      workspace.value = value;
      selected.value = '';
    }
  } catch {
    error.value = 'Vorlage konnte nicht gelöscht werden.';
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <details>
    <summary>Konfigurationsvorlagen</summary>
    <p>
      Vorlagen übernehmen ausgewählte Felder in die Bearbeitung. Erst die aktuelle Servervorschau und Ihre
      separate Bestätigung ändern eine Destination. Leistungen und Schemata werden vollständig ersetzt, wenn
      sie in der Vorlage enthalten sind.
    </p>
    <label>
      Vorlagenname
      <input v-model="name" maxlength="160" :disabled="disabled || pending" />
    </label>
    <div class="client-actions">
      <button
        type="button"
        class="button secondary"
        :disabled="disabled || pending || !workspace"
        @click="save"
      >
        Vorlage geschützt speichern
      </button>
      <button type="button" class="button secondary" :disabled="disabled || pending" @click="exportFile">
        Vorlage exportieren
      </button>
    </div>
    <p class="small-note">
      Exportierte Vorlagen sind unverschlüsselt und können Kontaktangaben enthalten. Zugangsdaten und
      Schlüssel werden nicht übernommen.
    </p>
    <template v-if="workspace?.templates.length">
      <label>
        Gespeicherte Vorlage
        <select aria-label="Gespeicherte Vorlage" v-model="selected" :disabled="disabled || pending">
          <option value="">Bitte wählen</option>
          <option v-for="item in workspace.templates" :value="item.id" :key="item.id">{{ item.name }}</option>
        </select>
      </label>
      <div class="client-actions">
        <button
          type="button"
          class="button secondary"
          :disabled="disabled || pending || !selected"
          @click="apply(workspace.templates.find((item) => item.id === selected))"
        >
          Vorlage übernehmen
        </button>
        <button
          type="button"
          class="button secondary"
          :disabled="disabled || pending || !selected"
          @click="remove"
        >
          Vorlage löschen
        </button>
      </div>
    </template>
    <FileDropInput
      id="destination-template-import"
      label="Vorlage importieren"
      accept=".json,application/json"
      :disabled="disabled || pending"
      @files="importFile"
    />
    <div v-if="imported">
      <h4>{{ imported.name }}</h4>
      <pre>{{ JSON.stringify(imported.changes, null, 2) }}</pre>
      <button type="button" class="button secondary" :disabled="disabled || pending" @click="apply(imported)">
        Import in Bearbeitung übernehmen
      </button>
    </div>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>
