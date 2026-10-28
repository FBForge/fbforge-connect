<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick, useId } from 'vue';
import { invoke } from './native.js';
import { loadedKeys } from './resources.js';
import { errorMessage, diagnosticCode } from './diagnostics.js';
import { receiveMessages } from './receive/messages.js';
import { beginMessageExport, finishMessageExport } from './message-export.js';
import { runMessageBatch } from './message-batch.js';
import { useSchemaSourceAccess } from './schema-source-access.js';
import SchemaSourceConsent from './SchemaSourceConsent.vue';
import CopyValue from './CopyValue.vue';
const props = defineProps({
  session: Object,
  items: Array,
  reply: Boolean,
  busy: Boolean,
  destinationId: String,
  schemas: { type: Function, default: () => [] },
});
const emit = defineEmits(['busy', 'outcome', 'open']);
const id = useId(),
  dialog = ref(null),
  schemaDialog = ref(null);
const external = useSchemaSourceAccess(() => props.session);
const mode = ref('download'),
  snapshot = ref([]),
  keys = ref([]),
  signingKid = ref('');
const results = ref([]),
  running = ref(false),
  loading = ref(false),
  stopped = ref(false),
  finished = ref(false);
const error = ref(''),
  directory = ref(''),
  allowNoScanner = ref(false);
let generation = 0,
  opener;
const context = computed(
  () => `${props.session?.apiVersion}/${props.session?.sessionId}/${props.destinationId}`,
);
watch(context, () => {
  generation++;
  stopped.value = true;
  if (!running.value) dialog.value?.close();
});
onBeforeUnmount(() => {
  generation++;
  stopped.value = true;
});
const labels = {
  checking: 'Wird geprüft',
  saving: 'Wird gespeichert',
  accepting: 'Annahme wird bestätigt',
  saved: 'Gespeichert',
  accepted: 'Gespeichert und angenommen',
  manual: 'Manuell prüfen',
  uncertain: 'Ausgang ungewiss',
  cancelled: 'Abgebrochen',
};
const summary = computed(() =>
  Object.entries({
    accepted: 'angenommen',
    saved: 'gespeichert',
    manual: 'manuell zu prüfen',
    uncertain: 'mit ungewissem Ausgang',
    cancelled: 'abgebrochen',
  })
    .map(([status, label]) => ({
      count: results.value.filter((item) => item.status === status).length,
      label,
    }))
    .filter((item) => item.count)
    .map((item) => `${item.count} ${item.label}`)
    .join(', '),
);
function explain(cause) {
  const messages = receiveMessages(props.reply);
  return Object.hasOwn(messages, cause) ? messages[cause] : errorMessage(cause);
}
async function show(accept) {
  if (props.busy || !props.session || !props.items?.length) return;
  opener = document.activeElement;
  generation++;
  mode.value = accept ? 'accept' : 'download';
  snapshot.value = props.items.map((item) => ({ ...item }));
  results.value = [];
  keys.value = [];
  signingKid.value = '';
  error.value = '';
  directory.value = '';
  finished.value = false;
  stopped.value = false;
  allowNoScanner.value = false;
  dialog.value.showModal();
  if (accept) {
    loading.value = true;
    const stamp = generation;
    try {
      const data = await loadedKeys(invoke, props.session);
      if (stamp !== generation) return;
      keys.value = data.keys.filter(
        (key) => key.purpose === 'sign' && key.destinationId === props.destinationId,
      );
      if (keys.value.length === 1) signingKid.value = keys.value[0].kid;
    } catch (cause) {
      if (stamp === generation) error.value = errorMessage(cause);
    } finally {
      loading.value = false;
    }
  }
}
async function close() {
  if (running.value) {
    stopped.value = true;
    return;
  }
  generation++;
  dialog.value.close();
  await nextTick();
  opener?.focus();
}
async function start() {
  if (running.value || loading.value || (mode.value === 'accept' && !signingKid.value)) return;
  const session = { ...props.session },
    stamp = generation;
  const current = () => stamp === generation && !stopped.value;
  const items = snapshot.value.map((item) => ({ ...item }));
  running.value = true;
  emit('busy', true);
  error.value = '';
  stopped.value = false;
  let target;
  try {
    target = await beginMessageExport(invoke, session);
    if (!target || !current()) return;
    directory.value = target.directory;
    await runMessageBatch({
      invoke,
      session,
      items,
      exportId: target.exportId,
      reply: props.reply,
      destinationId: props.destinationId,
      accept: mode.value === 'accept',
      signingKid: signingKid.value,
      allowNoScanner: allowNoScanner.value,
      schemas: props.schemas,
      allowExternalSchemas: () => external.value,
      requestSchemas: () => schemaDialog.value.request(),
      current,
      onProgress: (value) => (results.value = value),
      onOutcome: (value) => emit('outcome', value),
    });
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    if (target) await finishMessageExport(invoke, target.exportId).catch(() => {});
    running.value = false;
    finished.value = true;
    emit('busy', false);
  }
}
async function inspect(item) {
  await close();
  emit('open', item);
}
defineExpose({ show });
</script>
<template>
  <div class="client-actions">
    <button type="button" class="button secondary" :disabled="busy || !items?.length" @click="show(false)">
      Auswahl herunterladen
    </button>
    <button v-if="!reply" type="button" class="button" :disabled="busy || !items?.length" @click="show(true)">
      Prüfen, speichern und annehmen
    </button>
  </div>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="tool-dialog message-batch-dialog"
      :aria-labelledby="`${id}-title`"
      @cancel.prevent="close"
    >
      <h2 :id="`${id}-title`">
        {{ mode === 'accept' ? 'Einreichungen prüfen und annehmen' : 'Nachrichten herunterladen' }}
      </h2>
      <p v-if="running" role="status">
        {{ results.length }} von {{ snapshot.length }} Nachrichten in Bearbeitung.{{
          stopped ? ' Der Durchlauf wird gestoppt.' : ''
        }}
      </p>
      <p v-if="finished && results.length" role="status">{{ summary }}.</p>
      <div class="batch-dialog-body" tabindex="0" role="region" aria-label="Nachrichten und Prüfergebnisse">
        <p>
          {{ snapshot.length }} {{ reply ? 'Antworten' : 'Einreichungen' }} ausgewählt. Jede Nachricht wird
          separat geprüft und mit Metadaten, Fachdaten und Anlagen in einem eigenen Ordner gespeichert.
        </p>
        <p class="small-note">
          Auch ein Download benötigt eine erfolgreiche Entschlüsselung und technische Prüfung. Nicht prüfbare
          Nachrichten bleiben offen und werden nicht automatisch abgelehnt.
        </p>
        <p v-if="mode === 'accept'">
          Nur vollständig gespeicherte Nachrichten mit erfolgreicher technischer Prüfung werden angenommen.
          Schemafehler und andere offene Prüfungen erfordern Ihre manuelle Entscheidung. Die technische
          Prüfung ersetzt keine fachliche Prüfung.
        </p>
        <p v-if="session?.environment === 'PROD'" class="batch-production-note">
          PROD: Jede Annahme wird zusätzlich im nativen Bestätigungsdialog abgefragt.
        </p>
        <template v-if="!finished && mode === 'accept'">
          <p v-if="loading" role="status">Signaturschlüssel werden geladen …</p>
          <p v-else-if="!keys.length" role="status">
            Laden Sie zuerst einen passenden privaten Signaturschlüssel in der Empfangseinrichtung.
            Herunterladen ist auch ohne Signaturschlüssel möglich.
          </p>
          <label v-if="keys.length > 1" class="batch-signing-key">
            Signaturschlüssel
            <select v-model="signingKid" :disabled="running">
              <option value="">Bitte auswählen</option>
              <option v-for="key in keys" :key="key.kid" :value="key.kid">{{ key.kid }}</option>
            </select>
          </label>
          <label class="checkbox-label">
            <input v-model="allowNoScanner" type="checkbox" :disabled="running" />
            Annahmen ohne Malwarescan erlauben
          </label>
          <p class="small-note">
            Ohne diese Freigabe bleiben Nachrichten mit dem Hinweis „Kein Malwarescan durchgeführt“ zur
            manuellen Prüfung stehen.
          </p>
        </template>
        <div v-show="!finished">
          <SchemaSourceConsent
            ref="schemaDialog"
            v-model="external"
            :id="`${id}-schemas`"
            :context-key="context"
            :disabled="false"
          />
        </div>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="finished && results.length < snapshot.length" role="status">
          {{ snapshot.length - results.length }} Nachrichten wurden nicht bearbeitet. Bereits gespeicherte
          Dateien bleiben erhalten.
        </p>
        <div v-if="directory" class="small-note"><CopyValue :value="directory" label="Exportordner" /></div>
        <ol v-if="results.length" class="batch-results" aria-label="Ergebnisse des Durchlaufs">
          <li v-for="item in results" :key="item.replyId || item.submissionId">
            <strong>{{ labels[item.status] }}</strong>
            <p class="small-note">
              {{ reply ? 'Reply ID' : 'Submission ID' }}: {{ item.replyId || item.submissionId }}
            </p>
            <p v-if="item.error">{{ explain(item.error) }}</p>
            <p v-if="item.status === 'uncertain'">
              Prüfen Sie die Nachricht im Event Log, bevor Sie den Durchlauf erneut starten.
            </p>
            <details v-if="item.error" class="trace-details">
              <summary>Fehlercode anzeigen</summary>
              <code>{{ diagnosticCode(item.error) }}</code>
            </details>
            <p v-if="item.saved" class="small-note">{{ item.saved.fileCount }} Dateien gespeichert.</p>
            <button
              v-if="!running && item.status === 'manual'"
              type="button"
              class="button secondary"
              @click="inspect(item)"
            >
              Einzeln öffnen und prüfen
            </button>
          </li>
        </ol>
      </div>
      <div class="client-actions batch-footer">
        <button type="button" class="button secondary" autofocus @click="close">
          {{ running ? 'Durchlauf stoppen' : finished ? 'Schließen' : 'Abbrechen' }}
        </button>
        <button
          v-if="!finished"
          type="button"
          class="button"
          :disabled="running || loading || (mode === 'accept' && !signingKid)"
          @click="start"
        >
          Zielordner wählen und starten
        </button>
      </div>
    </dialog>
  </Teleport>
</template>
<style scoped>
.message-batch-dialog {
  max-width: 760px;
}
.message-batch-dialog[open] {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
.message-batch-dialog h2 {
  flex-shrink: 0;
  margin: 0;
  font-size: 1.3rem;
  overflow-wrap: anywhere;
}
.batch-dialog-body {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.batch-dialog-body:focus-visible {
  outline-offset: -2px;
}
.batch-dialog-body > p:first-child {
  margin-top: 0;
}
.batch-footer {
  flex-shrink: 0;
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.batch-signing-key {
  display: grid;
  gap: 8px;
  margin-block: 16px;
}
.batch-results {
  padding-left: 24px;
}
.batch-results li {
  padding-block: 16px;
  border-bottom: 1px solid var(--line);
  overflow-wrap: anywhere;
}
.batch-results p {
  margin-block: 6px;
}
.batch-production-note {
  padding: 12px;
  border: 1px solid var(--status-error-line);
  border-radius: 8px;
  background: var(--status-error-bg);
  color: var(--status-error-ink);
}
</style>
