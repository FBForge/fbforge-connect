<script setup>
import { inject, ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from './native.js';
import { processWorkspaceKey } from './process-context.js';
const processWorkspace = inject(processWorkspaceKey, null);
import { caseWorkspaceKey } from './case-context.js';
const caseWorkspace = inject(caseWorkspaceKey, null);
import SchemaSourceConsent from './SchemaSourceConsent.vue';
import DraftDataPreview from './DraftDataPreview.vue';
import {
  loadReplyTarget,
  loadReplySchema,
  prepareReply,
  executeReply,
  cancelReply,
  replyState,
} from './reply-sending.js';
import { generateExample } from './generate-example.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';

const props = defineProps({ session: Object, proof: Object, busy: Boolean });
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
const cleanupOwner = ref('');
const schemaPackage = shallowRef(null),
  schemaFile = shallowRef(null),
  schemaNotice = ref('');
const owner = shallowRef(null),
  dialog = ref(null),
  prepareButton = ref(null),
  resultHeading = ref(null);
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
  schema_required:
    'Bitte das aktuelle Antwortschema laden. Die Vorbereitung benötigt eine native Schemaprüfung.',
  data_schema_invalid:
    'Der Antwortinhalt entspricht nicht dem ausgewählten Schema. Bitte Fachdaten und Pflichtfelder prüfen. Es wurde nichts versendet.',
  schema_unavailable:
    'Das Antwortschema oder eine benötigte Referenz ist nicht verfügbar. Alternativ eine lokale JSON-Schemadatei mit passender $id verwenden.',
  schema_consent_required:
    'Bitte die Freigabe öffentlicher Schemaquellen aktivieren oder ein lokales beziehungsweise mitgeliefertes Schema verwenden.',
  data_format_invalid: 'Der Antwortinhalt passt nicht zum gewählten JSON-/XML-Format.',
  reply_channel_missing: 'Die geprüfte Einreichung bietet keinen unterstützten FIT-Connect-Antwortkanal an.',
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
const explain = (cause) =>
  messages[typeof cause === 'string' ? cause : cause?.message] || errorMessage(cause);
async function cancelKnown(value, active) {
  if (!value || !active) return;
  try {
    await cancelReply(invoke, active, value.attempt.attemptId);
  } catch (cause) {
    if (alive && resetsSessions(cause)) emit('fatal', cause);
  }
}
function reset() {
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
  file.value = null;
  attachments.value = [];
  text.value = '{\n  "status": "erhalten"\n}';
  process.value = false;
  model.value = '';
  message.value = '';
  if (outcome.value?.status !== 'uncertain' && outcome.value?.error !== 'content_cleanup_failed') {
    outcome.value = null;
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
  let status = 'Erfolgreich';
  try {
    status = (await operation(active, current)) || status;
    if (!current()) status = 'Abgebrochen';
  } catch (cause) {
    status = 'Fehlgeschlagen';
    if (current()) {
      error.value = explain(cause);
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
      const draft = await generateExample(loaded.document, selection.mimeType, selection.schemaUri);
      if (!current() || schemaContext.value !== key) return 'Abgebrochen';
      file.value = null;
      text.value = draft;
      schemaNotice.value =
        'Fiktiver Antwortentwurf erzeugt. Vor dem Versand werden die exakten Daten gegen das Antwortschema geprüft.';
    }
  });
}
function chooseSchemaFile(event) {
  if (disabled.value) return;
  schemaPackage.value = null;
  schemaNotice.value = '';
  schemaFile.value = event.target.files?.[0] || null;
  event.target.value = '';
}
function addFiles(event) {
  if (disabled.value) return;
  for (const item of event.dataTransfer?.files || event.target.files || [])
    attachments.value.push({
      id: crypto.randomUUID(),
      file: item,
      mimeType: item.type || 'application/octet-stream',
      description: '',
    });
  if (event.target.type === 'file') event.target.value = '';
}
async function prepare() {
  if (disabled.value || !selected.value || !schemaPackage.value) return;
  const proof = { ...props.proof },
    schema = { ...selected.value };
  const draft = {
    proofId: proof.proofId,
    schemaId: schemaPackage.value.schemaId,
    schemaUri: schema.schemaUri,
    mimeType: format.value,
    processMessage:
      props.session.apiVersion === 'v3' && process.value
        ? { processModelId: model.value.trim(), messageId: message.value.trim() }
        : null,
  };
  await run('Antwort lokal vorbereiten', async (active, current) => {
    const result = await prepareReply(
      invoke,
      active,
      proof,
      draft,
      file.value || new Blob([text.value]),
      attachments.value,
    );
    if (!current()) {
      await cancelKnown(result, active);
      return 'Abgebrochen';
    }
    prepared.value = result;
    owner.value = active;
    outcome.value = null;
  });
  await nextTick();
  if (alive && prepared.value) dialog.value?.showModal();
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
    return result.status === 'sent' && !result.error
      ? 'Erfolgreich'
      : result.status === 'uncertain'
        ? 'Ausgang ungewiss'
        : 'Fehlgeschlagen';
  });
}
</script>

<template>
  <section class="tool-section" aria-labelledby="reply-send-title" :aria-busy="working">
    <h2 id="reply-send-title">Auf die Einreichung antworten</h2>
    <p>
      Das SDK verschlüsselt die Antwort mit dem angebotenen Schlüssel aus den geprüften Metadaten. Eine
      Antwort schließt den Empfang der Einreichung noch nicht ab.
    </p>
    <p v-if="!proof">Zuerst die Inhalte der Einreichung entschlüsseln und prüfen.</p>
    <button v-if="!target" class="button secondary" type="button" :disabled="disabled" @click="load">
      Antwortmöglichkeiten laden
    </button>
    <form v-if="target" class="send-form" @submit.prevent="prepare">
      <fieldset :disabled="disabled">
        <legend>Antwort</legend>
        <div class="client-fields">
          <label for="reply-schema">
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
          <label for="reply-data-file">
            Fachdaten aus Datei (optional)
            <input
              id="reply-data-file"
              type="file"
              accept=".json,.xml,application/json,application/xml,text/xml"
              @change="file = $event.target.files[0] || null"
            />
          </label>
        </div>
        <label v-if="!file" for="reply-data">
          Antwortinhalt
          <textarea id="reply-data" v-model="text" rows="6" required spellcheck="false"></textarea>
        </label>
        <p v-else>
          {{ file.name }} · {{ file.size }} Bytes
          <button class="button secondary" type="button" @click="file = null">Eingabefeld verwenden</button>
        </p>
        <div class="client-fields">
          <label for="reply-schema-file">
            Lokales Antwortschema (optional, JSON mit passender $id)
            <input
              id="reply-schema-file"
              type="file"
              accept=".json,application/json,application/schema+json"
              @change="chooseSchemaFile"
            />
            <small>Maximal 2 MiB. Bei lokaler Auswahl werden keine externen Referenzen geladen.</small>
          </label>
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
        <SchemaSourceConsent id="reply-schema-sources" v-model="allowExternalSchemas" :disabled="disabled" />
        <div class="client-actions">
          <button class="button secondary" type="button" @click="loadSchema(false)">
            Antwortschema laden
          </button>
          <button class="button secondary" type="button" @click="loadSchema(true)">
            Fiktiven Antwortentwurf erzeugen
          </button>
        </div>
        <p v-if="schemaNotice" class="small-note" role="status">{{ schemaNotice }}</p>
        <DraftDataPreview
          :schema-document="schemaPackage?.document"
          :schema-uri="selected?.schemaUri"
          :text="text"
          :file="file"
          :mime-type="format"
          :context-key="context"
          :disabled="disabled"
        />
        <template v-if="session?.apiVersion === 'v3'">
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
        </template>
      </fieldset>
      <fieldset :disabled="disabled">
        <legend>Antwortanlagen</legend>
        <div class="file-drop-zone" @dragover.prevent @drop.prevent="addFiles">
          <label for="reply-files">
            Eine oder mehrere Anlagen hier ablegen oder auswählen
            <input id="reply-files" type="file" multiple @change="addFiles" />
          </label>
        </div>
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
      <button ref="prepareButton" class="button" type="submit" :disabled="disabled || !schemaPackage">
        Antwort prüfen und vorbereiten
      </button>
    </form>
    <p v-if="working" role="status">Antwortaktion läuft …</p>
    <p v-if="error" role="alert">{{ error }}</p>
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
        Reply-ID:
        <code>{{ outcome.replyId }}</code>
      </p>
      <p>
        Vorgang:
        <code>{{ outcome.caseId }}</code>
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
