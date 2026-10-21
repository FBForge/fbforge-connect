<script setup>
import CopyValue from './CopyValue.vue';
import ActionNotice from './ActionNotice.vue';
import DocumentationLink from './DocumentationLink.vue';
import { inject, ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from './native.js';
import { caseStorageNotice } from './cases.js';
const storageWarning = ref('');
import { processWorkspaceKey } from './process-context.js';
const processWorkspace = inject(processWorkspaceKey, null);
import { caseWorkspaceKey } from './case-context.js';
const caseWorkspace = inject(caseWorkspaceKey, null);
import SchemaSourceConsent from './SchemaSourceConsent.vue';
import DraftDataPreview from './DraftDataPreview.vue';
import FileDropInput from './FileDropInput.vue';
import {
  loadReplyTarget,
  loadReplySchema,
  prepareReply,
  executeReply,
  cancelReply,
  replyState,
} from './reply-sending.js';
import ExampleDraftDialog from './ExampleDraftDialog.vue';
import { errorMessage, diagnosticCode } from './diagnostics.js';
import { resetsSessions } from './sessions.js';

const props = defineProps({ session: Object, proof: Object, busy: Boolean, guided: Boolean });
const expanded = ref(false);
const emit = defineEmits(['busy', 'activity', 'fatal', 'invalidate', 'event-log']);
const allowExternalSchemas = ref(false);
watch(
  () => props.session?.sessionId,
  () => {
    allowExternalSchemas.value = false;
  },
);
const processChoice = ref(0);
const target = ref(null),
  choice = ref(0),
  mime = ref('application/json'),
  process = ref(false),
  model = ref(''),
  message = ref('');
const text = ref('{\n  "status": "erhalten"\n}'),
  file = shallowRef(null),
  attachments = ref([]);
const prepared = ref(null),
  outcome = ref(null),
  outcomeOwner = ref(''),
  working = ref(false),
  error = ref('');
const diagnostic = ref(''),
  errorNotice = ref(null);
const cleanupOwner = ref('');
const schemaPackage = shallowRef(null),
  schemaFile = shallowRef(null),
  schemaNotice = ref('');
const exampleDialog = ref(null),
  exampleButton = ref(null);
const owner = shallowRef(null),
  dialog = ref(null),
  prepareButton = ref(null),
  resultHeading = ref(null),
  schemaOptions = ref(null);
const context = computed(
  () => `${props.session?.apiVersion}/${props.session?.sessionId}/${props.proof?.proofId}`,
);
watch([processChoice, () => target.value?.processMessages], () => {
  const selected = target.value?.processMessages?.[processChoice.value];
  model.value = selected?.processModelId || '';
  message.value = selected?.messageId || '';
  if (!selected) process.value = false;
});
function useBpmnSelection() {
  diagnostic.value = '';
  const selection = processWorkspace?.selection.value;
  const index =
    target.value?.processMessages?.findIndex(
      (row) => row.processModelId === selection?.processModelId && row.messageId === selection?.messageId,
    ) ?? -1;
  if (index < 0) {
    error.value =
      'Diese BPMN-Nachricht wird im geprüften FIT-Connect-Rückkanal nicht als Prozessantwort angeboten.';
    return;
  }
  if (selection.schemaUri) {
    const schemaIndex = target.value.schemas.findIndex(
      (row) =>
        row.schemaUri === selection.schemaUri &&
        (row.mimeType === null || row.mimeType === selection.mimeType),
    );
    if (schemaIndex < 0) {
      error.value = 'Das BPMN-Antwortschema wird im geprüften Rückkanal nicht angeboten.';
      return;
    }
    choice.value = schemaIndex;
    mime.value = selection.mimeType;
  }
  processChoice.value = index;
  process.value = true;
  model.value = selection.processModelId;
  message.value = selection.messageId;
}
const selected = computed(() => target.value?.schemas[choice.value]);
const format = computed(() => selected.value?.mimeType || mime.value);
const schemaContext = computed(() =>
  JSON.stringify([context.value, selected.value?.schemaUri, format.value]),
);
watch(
  schemaContext,
  () => {
    schemaPackage.value = null;
    schemaFile.value = null;
    schemaNotice.value = '';
  },
  { flush: 'sync' },
);
const locked = computed(
  () =>
    cleanupOwner.value === props.session?.sessionId ||
    (outcomeOwner.value === props.session?.sessionId &&
      (outcome.value?.status === 'uncertain' || outcome.value?.error === 'content_cleanup_failed')),
);
const disabled = computed(
  () =>
    props.busy || working.value || !props.session || !props.proof || locked.value || Boolean(prepared.value),
);
let revision = 0,
  alive = true;
const messages = {
  example_unavailable:
    'Für dieses Schema konnte kein vollständiger fiktiver Antwortentwurf erzeugt werden. Bitte geben Sie die Antwort manuell ein. Ihr bisheriger Antwortinhalt bleibt erhalten.',
  schema_http_error:
    'Das Antwortschema ist nicht verfügbar. Die Quelle hat den Abruf mit einem HTTP-Fehler abgewiesen. Ihr bisheriger Antwortinhalt bleibt erhalten.',
  schema_required:
    'Bitte das aktuelle Antwortschema laden. Die Vorbereitung benötigt eine native Schemaprüfung.',
  schema_id_mismatch:
    'Die Kennung $id Ihrer lokalen Schemadatei fehlt oder stimmt nicht mit dem angebotenen Antwortschema überein. Wählen Sie das passende Schema des Onlinedienstes. Ihr Antwortentwurf bleibt erhalten.',
  data_schema_invalid:
    'Der Antwortinhalt entspricht nicht dem ausgewählten Schema. Bitte Fachdaten und Pflichtfelder prüfen. Es wurde nichts versendet.',
  schema_unavailable:
    'Das Antwortschema ist nicht verfügbar oder die Quelle hat eine Fehlerantwort statt eines Schemas geliefert. Ihr bisheriger Antwortinhalt bleibt erhalten. Alternativ können Sie eine lokale JSON-Schemadatei mit passender $id verwenden.',
  schema_consent_required:
    'Bitte die Freigabe öffentlicher Schemaquellen aktivieren oder ein lokales beziehungsweise mitgeliefertes Schema verwenden.',
  data_format_invalid: 'Der Antwortinhalt passt nicht zum gewählten JSON-/XML-Format.',
  reply_channel_missing:
    'In den geprüften Metadaten ist kein unterstützter FIT-Connect-Antwortkanal enthalten. Der Absender muss eine neue Einreichung mit Antwortschlüssel und Antwortschema senden. In FBForge Connect aktivieren Sie dafür unter „Anlagen & Antwortkanal“ die Option „Antworten über FIT-Connect anbieten“. Bei anderen Onlinediensten prüfen Sie deren Versandkonfiguration. Die vorhandene Einreichung können Sie weiterhin annehmen oder ablehnen.',
  verification_failed:
    'Der geprüfte Antwortkanal ist nicht mehr verfügbar oder enthält widersprüchliche Angaben. Bitte die Einreichung erneut prüfen.',
  invalid_resource: 'Das Ergebnis passt nicht mehr zur aktuellen Einreichung. Bitte erneut prüfen.',
  invalid_submission:
    'Bitte Antwortschema, Format und Inhalte prüfen. Höchstens 32 MiB je Datei und 64 MiB insgesamt.',
  resource_denied: 'Diese TEST-Zugangsdaten dürfen die Antwort nicht versenden.',
  resource_unavailable:
    'Der Reply-Versand konnte nicht abgeschlossen werden. Bei ungewissem Ausgang bitte nicht erneut senden.',
  confirmation_expired: 'Die Bestätigung ist abgelaufen. Bitte die Antwort erneut vorbereiten.',
  send_locked: 'Der letzte Reply-Versuch ist gesperrt. Bei ungewissem Ausgang zuerst den Vorgang prüfen.',
  content_cleanup_failed:
    'Lokale Dateien konnten nicht vollständig entfernt werden. Bitte die Sitzung abmelden.',
};
function explain(cause) {
  const code = typeof cause === 'string' ? cause : cause?.message;
  return typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] : errorMessage(cause);
}
async function cancelKnown(value, active) {
  if (!value || !active) return;
  try {
    await cancelReply(invoke, active, value.attempt.attemptId);
  } catch (cause) {
    if (alive && resetsSessions(cause)) emit('fatal', cause);
  }
}
function reset() {
  expanded.value = false;
  schemaPackage.value = null;
  schemaFile.value = null;
  schemaNotice.value = '';
  revision++;
  const previous = prepared.value,
    active = owner.value;
  prepared.value = null;
  dialog.value?.close();
  target.value = null;
  choice.value = 0;
  error.value = '';
  diagnostic.value = '';
  file.value = null;
  attachments.value = [];
  text.value = '{\n  "status": "erhalten"\n}';
  process.value = false;
  model.value = '';
  message.value = '';
  if (outcome.value?.status !== 'uncertain' && outcome.value?.error !== 'content_cleanup_failed') {
    outcome.value = null;
    storageWarning.value = '';
    outcomeOwner.value = '';
  }
  if (!working.value) void cancelKnown(previous, active);
}
watch(context, reset, { flush: 'sync' });
onBeforeUnmount(() => {
  alive = false;
  reset();
});
async function run(action, operation) {
  if (working.value || props.busy || !props.session) return;
  const active = { ...props.session },
    stamp = revision,
    started = performance.now();
  const current = () => alive && stamp === revision;
  working.value = true;
  emit('busy', true);
  error.value = '';
  diagnostic.value = '';
  let status = 'Erfolgreich';
  try {
    status = (await operation(active, current)) || status;
    if (!current()) status = 'Abgebrochen';
  } catch (cause) {
    status = 'Fehlgeschlagen';
    if (current()) {
      error.value = explain(cause);
      diagnostic.value = diagnosticCode(cause);
      if ((typeof cause === 'string' ? cause : cause?.message) === 'content_cleanup_failed') {
        cleanupOwner.value = active.sessionId;
        emit('invalidate');
      }
    }
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    working.value = false;
    emit('busy', false);
    emit('activity', {
      api: active.apiVersion,
      role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action,
      status,
      started,
    });
  }
}
async function load() {
  if (disabled.value) return;
  const proof = { ...props.proof };
  await run('Geprüften Antwortkanal laden', async (active, current) => {
    target.value = null;
    const state = await replyState(invoke, active);
    if (!current()) return;
    if (state.status === 'uncertain' || state.error === 'content_cleanup_failed') {
      outcome.value = state;
      outcomeOwner.value = active.sessionId;
      return 'Ausgang ungewiss';
    }
    if (state.status === 'prepared') await cancelReply(invoke, active, state.attemptId);
    const result = await loadReplyTarget(invoke, active, proof);
    if (current()) {
      target.value = result;
      choice.value = 0;
    }
  });
  if (error.value) {
    await nextTick();
    errorNotice.value?.focus();
  }
}
async function loadSchema(example = false) {
  if (disabled.value || !selected.value) return;
  const external = !schemaFile.value;
  schemaPackage.value = null;
  schemaNotice.value = '';
  const proof = { ...props.proof },
    key = schemaContext.value,
    local = schemaFile.value;
  const selection = {
    schemaUri: selected.value.schemaUri,
    mimeType: format.value,
    allowExternalSchemas: external && allowExternalSchemas.value,
  };
  await run('Antwortschema laden', async (active, current) => {
    const loaded = await loadReplySchema(invoke, active, proof, selection, local);
    if (!current() || schemaContext.value !== key) return 'Abgebrochen';
    schemaPackage.value = loaded;
    schemaNotice.value = 'Schema geladen. Der Antwortinhalt wird beim Vorbereiten im nativen Kern geprüft.';
    if (example) {
      const draft = await exampleDialog.value
        .choose({
          source: loaded.document,
          mimeType: selection.mimeType,
          uri: selection.schemaUri,
          replacing: Boolean(file.value || text.value.trim()),
        })
        .catch((cause) => {
          if (current() && schemaContext.value === key && cause?.message === 'schema_unavailable') {
            schemaPackage.value = null;
            schemaNotice.value = '';
          }
          throw cause;
        });
      if (draft === null || !current() || schemaContext.value !== key) return 'Abgebrochen';
      file.value = null;
      text.value = draft;
      schemaNotice.value =
        'Fiktiver Antwortentwurf erzeugt. Vor dem Versand werden die exakten Daten gegen das Antwortschema geprüft.';
    }
  });
  if (example) {
    await nextTick();
    if (schemaContext.value === key) exampleButton.value?.focus();
  } else if (error.value) {
    await nextTick();
    if (schemaContext.value === key) errorNotice.value?.focus();
  }
}
function chooseSchemaFile(files) {
  if (disabled.value) return;
  schemaPackage.value = null;
  schemaNotice.value = '';
  schemaFile.value = files[0] || null;
  if (diagnostic.value === 'schema_id_mismatch') {
    diagnostic.value = '';
    error.value = '';
  }
}
function changeSchemaFile() {
  if (disabled.value) return;
  schemaOptions.value?.setAttribute('open', '');
  const picker = document.getElementById('reply-schema-file');
  picker?.focus();
  picker?.click();
}
function addFiles(files) {
  if (disabled.value) return;
  for (const item of files)
    attachments.value.push({
      id: crypto.randomUUID(),
      file: item,
      mimeType: item.type || 'application/octet-stream',
      description: '',
    });
}
const hasDraft = computed(
  () =>
    !locked.value &&
    !outcome.value &&
    (Boolean(file.value) || attachments.value.length > 0 || text.value !== '{\n  "status": "erhalten"\n}'),
);
async function begin() {
  if (disabled.value) return;
  expanded.value = true;
  const key = context.value;
  if (!target.value) await load();
  await nextTick();
  if (context.value === key) document.getElementById(file.value ? 'reply-data-file' : 'reply-data')?.focus();
}
defineExpose({ begin, hasDraft, discardDraft: reset });
async function prepare() {
  if (disabled.value || !selected.value) return;
  const key = schemaContext.value,
    proof = { ...props.proof },
    schema = { ...selected.value },
    mimeType = format.value,
    local = schemaFile.value,
    external = !local && allowExternalSchemas.value,
    payload = file.value || new Blob([text.value]),
    files = attachments.value.map((item) => ({ ...item })),
    processMessage =
      props.session.apiVersion === 'v3' && process.value
        ? { processModelId: model.value.trim(), messageId: message.value.trim() }
        : null;
  await run('Antwort lokal vorbereiten', async (active, current) => {
    let packet = schemaPackage.value;
    if (!packet) {
      packet = await loadReplySchema(
        invoke,
        active,
        proof,
        { schemaUri: schema.schemaUri, mimeType, allowExternalSchemas: external },
        local,
      );
      if (!current() || schemaContext.value !== key) return 'Abgebrochen';
      schemaPackage.value = packet;
    }
    if (!current() || schemaContext.value !== key) return 'Abgebrochen';
    const draft = {
      proofId: proof.proofId,
      schemaId: packet.schemaId,
      schemaUri: schema.schemaUri,
      mimeType,
      processMessage,
    };
    const result = await prepareReply(invoke, active, proof, draft, payload, files);
    if (!current() || schemaContext.value !== key) {
      await cancelKnown(result, active);
      return 'Abgebrochen';
    }
    prepared.value = result;
    owner.value = active;
    outcome.value = null;
  });
  await nextTick();
  if (alive && prepared.value) dialog.value?.showModal();
  else if (error.value && !schemaPackage.value) {
    schemaOptions.value?.setAttribute('open', '');
    if (diagnostic.value === 'schema_id_mismatch') errorNotice.value?.focus();
    else document.getElementById('reply-schema-sources')?.focus();
  }
}
async function dismiss() {
  if (!prepared.value || working.value) return;
  const value = prepared.value;
  await run('Antwortvorbereitung verwerfen', async () => {
    await cancelReply(invoke, owner.value, value.attempt.attemptId);
    prepared.value = null;
    dialog.value?.close();
  });
  await nextTick();
  if (!prepareButton.value?.disabled) prepareButton.value?.focus();
}
function openEventLog() {
  if (!outcome.value?.replyId || outcomeOwner.value !== props.session?.sessionId) return;
  emit('event-log', {
    apiVersion: props.session.apiVersion,
    sessionId: props.session.sessionId,
    caseId: outcome.value.caseId,
    replyId: outcome.value.replyId,
  });
}
async function send() {
  if (!prepared.value || working.value || props.busy) return;
  const value = prepared.value,
    active = owner.value;
  await run('Antwort an TEST senden', async (_, current) => {
    const result = await executeReply(invoke, active, value.attempt);
    if (result.replyId && result.caseId) caseWorkspace?.remember(active, result);
    prepared.value = null;
    dialog.value?.close();
    if (current()) {
      outcome.value = result;
      outcomeOwner.value = active.sessionId;
      await nextTick();
      resultHeading.value?.focus();
    }
    if (result.error === 'content_cleanup_failed') {
      cleanupOwner.value = active.sessionId;
      emit('invalidate');
    }
    if (resetsSessions(result.error)) emit('fatal', result.error);
    if (result.status === 'sent') {
      const warning = await caseStorageNotice(invoke, active);
      if (current()) storageWarning.value = warning;
    }
    return result.status === 'sent' && !result.error
      ? 'Erfolgreich'
      : result.status === 'uncertain'
        ? 'Ausgang ungewiss'
        : 'Fehlgeschlagen';
  });
}
</script>

<template>
  <section
    v-show="!guided || expanded || outcome || error"
    class="tool-section"
    aria-labelledby="reply-send-title"
    :aria-busy="working"
  >
    <ExampleDraftDialog ref="exampleDialog" :context-key="schemaContext" />
    <h2 id="reply-send-title">Auf die Einreichung antworten</h2>
    <p>
      Verfassen Sie Ihre Antwort und prüfen Sie den Entwurf vor dem Senden. Eine Antwort schließt den Empfang
      noch nicht ab.
    </p>
    <p v-if="!proof">Zuerst die Inhalte der Einreichung entschlüsseln und prüfen.</p>
    <button
      v-if="!target && diagnostic !== 'reply_channel_missing'"
      class="button secondary"
      type="button"
      :disabled="disabled"
      @click="load"
    >
      Antwortmöglichkeiten laden
    </button>
    <form v-if="target" class="send-form" @submit.prevent="prepare">
      <fieldset :disabled="disabled">
        <legend>Antwort</legend>
        <div class="client-actions">
          <button ref="exampleButton" class="button secondary" type="button" @click="loadSchema(true)">
            Fiktiven Antwortentwurf erzeugen
          </button>
        </div>
        <DraftDataPreview
          :schema-document="schemaPackage?.document"
          :schema-uri="selected?.schemaUri"
          :text="text"
          :file="file"
          :mime-type="format"
          :context-key="context"
          :disabled="disabled"
        >
          <label v-if="!file" for="reply-data">
            Antwortinhalt
            <textarea id="reply-data" v-model="text" rows="6" required spellcheck="false"></textarea>
          </label>
          <p v-else>
            {{ file.name }} · {{ file.size }} Bytes
            <button class="button secondary" type="button" @click="file = null">Eingabefeld verwenden</button>
          </p>
        </DraftDataPreview>
        <p v-if="schemaNotice" class="small-note" role="status">{{ schemaNotice }}</p>
        <SchemaSourceConsent id="reply-schema-sources" v-model="allowExternalSchemas" :disabled="disabled" />
        <div class="client-fields">
          <label v-if="target.schemas.length > 1" for="reply-schema">
            Angebotenes Antwortschema
            <select id="reply-schema" v-model="choice">
              <option v-for="(item, index) in target.schemas" :key="index" :value="index">
                {{ item.schemaUri }}{{ item.mimeType ? ` · ${item.mimeType}` : '' }}
              </option>
            </select>
          </label>
          <label v-if="!selected?.mimeType" for="reply-mime">
            Antwortformat
            <select id="reply-mime" v-model="mime">
              <option value="application/json">JSON</option>
              <option value="application/xml">XML</option>
            </select>
          </label>
          <p v-else>
            Antwortformat:
            <strong>{{ format === 'application/json' ? 'JSON' : 'XML' }}</strong>
          </p>
          <FileDropInput
            id="reply-data-file"
            label="Fachdaten aus Datei (optional)"
            accept=".json,.xml,application/json,application/xml,text/xml"
            :disabled="disabled"
            @files="(files) => (file = files[0] || null)"
          />
        </div>
        <details ref="schemaOptions" class="reply-schema-options">
          <summary>Antwortschema und technische Optionen</summary>
          <CopyValue v-if="selected" label="Antwortschema" :value="selected.schemaUri" />
          <div class="client-fields">
            <FileDropInput
              id="reply-schema-file"
              label="Lokales Antwortschema (optional, JSON mit passender $id)"
              accept=".json,application/json,application/schema+json"
              :disabled="disabled"
              @files="chooseSchemaFile"
            >
              Maximal 2 MiB. Bei lokaler Auswahl werden keine externen Referenzen geladen.
            </FileDropInput>
            <p v-if="schemaFile">
              {{ schemaFile.name }}
              <button
                class="button secondary"
                type="button"
                @click="
                  schemaFile = null;
                  schemaPackage = null;
                "
              >
                Lokales Schema entfernen
              </button>
            </p>
          </div>

          <div class="client-actions">
            <button class="button secondary" type="button" @click="loadSchema(false)">
              Antwortschema laden
            </button>
          </div>
        </details>
        <details v-if="session?.apiVersion === 'v3'" :open="process">
          <summary>Als Prozessnachricht antworten</summary>
          <label class="checkbox-label">
            <input v-model="process" type="checkbox" :disabled="!target?.processMessages?.length" />
            Als angebotene Prozessnachricht antworten
          </label>
          <p v-if="!target?.processMessages?.length">
            Dieser geprüfte Rückkanal bietet keine Prozessantworten an. Eine normale fachliche Antwort ist mit
            seinen angebotenen Schemata möglich.
          </p>
          <button
            v-if="processWorkspace?.selection.value"
            class="button secondary"
            type="button"
            @click="useBpmnSelection"
          >
            BPMN-Auswahl mit angebotenem Antwortkanal abgleichen
          </button>
          <div v-if="process" class="client-fields">
            <label for="reply-process-choice">
              Angebotene Prozessantwort
              <select id="reply-process-choice" v-model="processChoice">
                <option v-for="(item, index) in target.processMessages" :key="index" :value="index">
                  {{ item.messageId }} · {{ item.processModelId }}
                </option>
              </select>
            </label>
          </div>
        </details>
      </fieldset>
      <fieldset :disabled="disabled">
        <legend>Antwortanlagen</legend>
        <FileDropInput
          id="reply-files"
          label="Antwortanlagen hinzufügen"
          multiple
          :disabled="disabled"
          @files="addFiles"
        />
        <div v-for="item in attachments" :key="item.id" class="client-fields">
          <p>
            <strong>{{ item.file.name }}</strong>
            <br />
            {{ item.file.size }} Bytes
          </p>
          <label :for="`reply-description-${item.id}`">
            Beschreibung
            <input
              :id="`reply-description-${item.id}`"
              type="text"
              v-model="item.description"
              maxlength="1000"
            />
          </label>
          <button
            class="button secondary"
            type="button"
            @click="attachments = attachments.filter((value) => value.id !== item.id)"
          >
            Anlage entfernen
          </button>
        </div>
        <p class="small-note">
          Höchstens 32 MiB je Datei und 64 MiB insgesamt. Schema und Format müssen zum angebotenen
          Antwortkanal passen.
        </p>
      </fieldset>
      <button ref="prepareButton" class="button" type="submit" :disabled="disabled">
        Antwort prüfen und vorbereiten
      </button>
    </form>
    <p v-if="working" role="status">Antwortaktion läuft …</p>
    <p v-if="storageWarning" role="status">{{ storageWarning }}</p>
    <ActionNotice
      v-if="error"
      ref="errorNotice"
      :title="
        diagnostic === 'reply_channel_missing'
          ? 'Kein Antwortkanal angeboten'
          : diagnostic === 'schema_id_mismatch'
            ? 'Antwortschema passt nicht zum Angebot'
            : 'Antwortaktion fehlgeschlagen'
      "
      :message="error"
      :tone="diagnostic === 'reply_channel_missing' ? 'warning' : 'error'"
      :code="diagnostic"
      :api-version="session?.apiVersion"
    >
      <template v-if="diagnostic === 'schema_id_mismatch' && selected">
        <CopyValue :value="selected.schemaUri" label="Erwartete Schema-Kennung" />
        <button class="button secondary" type="button" :disabled="disabled" @click="changeSchemaFile">
          Passendes Schema auswählen
        </button>
      </template>
      <DocumentationLink topic="replies">Anleitung zu Antworten</DocumentationLink>
    </ActionNotice>
    <p v-if="cleanupOwner === session?.sessionId" role="alert">{{ messages.content_cleanup_failed }}</p>
    <div v-if="outcome && outcomeOwner === session?.sessionId" role="status">
      <h3 ref="resultHeading" tabindex="-1">
        {{
          outcome.status === 'sent'
            ? 'Antwort an TEST übergeben'
            : outcome.status === 'uncertain'
              ? 'Reply-Versandausgang ungewiss'
              : 'Reply-Versand fehlgeschlagen'
        }}
      </h3>
      <p v-if="outcome.replyId">
        Reply ID:
        <CopyValue :value="outcome.replyId" label="Reply ID" />
      </p>
      <p>
        Vorgang:
        <CopyValue :value="outcome.caseId" label="Case ID" />
      </p>
      <button
        v-if="outcome.replyId"
        type="button"
        class="button secondary"
        :disabled="busy || working"
        @click="openEventLog"
      >
        Event Log der Antwort prüfen
      </button>
      <p v-if="outcome.status === 'uncertain'">
        Bitte nicht erneut senden. Der Dienst kann die Antwort bereits erhalten haben.
      </p>
      <p v-if="outcome.error">{{ explain(outcome.error) }}</p>
    </div>
    <dialog
      ref="dialog"
      class="tool-dialog receipt-dialog"
      aria-labelledby="reply-confirm-title"
      @cancel.prevent="dismiss"
    >
      <template v-if="prepared">
        <h2 id="reply-confirm-title">Antwort an TEST senden?</h2>
        <dl class="receipt-dialog-context">
          <dt>API</dt>
          <dd>{{ owner.apiVersion }}</dd>
          <dt>Einreichung</dt>
          <dd>
            <code>{{ prepared.summary.submissionId }}</code>
          </dd>
          <dt>Vorgang</dt>
          <dd>
            <code>{{ prepared.summary.caseId }}</code>
          </dd>
          <dt>Antwortschema</dt>
          <dd>{{ prepared.summary.schemaUri }}</dd>
          <dt>Antwortinhalt</dt>
          <dd>{{ prepared.summary.mimeType }} · {{ prepared.summary.dataBytes }} Bytes</dd>
        </dl>
        <p v-if="prepared.summary.processMessage">
          Prozess: {{ prepared.summary.processMessage.processModelId }} · Nachricht:
          {{ prepared.summary.processMessage.messageId }}
        </p>
        <ul v-if="prepared.summary.attachments.length">
          <li v-for="(item, index) in prepared.summary.attachments" :key="index">
            {{ item.fileName }} · {{ item.bytes }} Bytes
            <span v-if="item.description">· {{ item.description }}</span>
          </li>
        </ul>
        <p>
          <span class="status-badge ok">Antwortschema geprüft</span>
          Der native Kern hat die exakten vorbereiteten Fachdaten gegen das gewählte Schema geprüft. Eine
          fachliche Prüfung bleibt erforderlich.
        </p>
        <p>
          Die Bestätigung gilt 60 Sekunden. Dieser Schritt versendet die verschlüsselte Antwort an FIT-Connect
          TEST.
        </p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="client-actions">
          <button class="button secondary" type="button" :disabled="working" autofocus @click="dismiss">
            Abbrechen
          </button>
          <button class="button" type="button" :disabled="working" @click="send">
            {{ working ? 'Wird übertragen …' : 'Antwort jetzt senden' }}
          </button>
        </div>
      </template>
    </dialog>
  </section>
</template>
