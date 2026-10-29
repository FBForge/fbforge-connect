<script setup>
import { cancelledProductionAction } from './environments.js';

import { useEnvironment } from './environments.js';
const environment = useEnvironment();
import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from './native.js';
import { loadedKeys } from './resources.js';
import { prepareReceipt, executeReceipt, cancelReceipt, receiptState } from './receipts.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
import ReceiptDownloadChoice from './ReceiptDownloadChoice.vue';
import { downloadMessage, exportSource } from './message-export.js';

const props = defineProps({
  session: Object,
  detail: Object,
  proof: Object,
  busy: Boolean,
  keyRevision: Number,
  guided: Boolean,
});
const emit = defineEmits(['busy', 'activity', 'fatal', 'outcome', 'invalidate']);
const started = ref(false);
const saveBeforeAccept = ref(false);
const intent = ref('accept'),
  reason = ref('technical-error'),
  description = ref(''),
  attachment = ref('');
const keys = ref([]),
  selectedKey = ref(''),
  prepared = ref(null),
  outcome = ref(null),
  error = ref(''),
  working = ref(false);
const dialog = ref(null),
  resultHeading = ref(null),
  prepareButton = ref(null);
const owner = shallowRef(null),
  outcomeOwner = ref('');
let revision = 0,
  alive = true;
const context = computed(
  () =>
    `${props.session?.apiVersion}/${props.session?.sessionId}/${props.detail?.submissionId}/${props.keyRevision}`,
);
const locked = computed(
  () =>
    outcomeOwner.value === props.session?.sessionId &&
    (outcome.value?.status === 'uncertain' ||
      (outcome.value?.status === 'confirmed' && outcome.value.submissionId === props.detail?.submissionId)),
);
const disabled = computed(
  () =>
    props.busy || working.value || !props.session || !props.detail || locked.value || Boolean(prepared.value),
);
const reasons = {
  'technical-error': 'Technischer Fehler',
  'metadata-encryption-issue': 'Metadaten nicht entschlüsselbar',
  'data-encryption-issue': 'Fachdaten nicht entschlüsselbar',
  'attachment-encryption-issue': 'Anlage nicht entschlüsselbar',
  'data-schema-violation': 'Fachdaten entsprechen nicht dem Schema',
};
const messages = {
  key_missing: 'Bitte oben unter Destination-Schlüssel einen privaten Schlüssel zum Signieren laden.',
  signing_selection_required:
    'Mehrere Signaturschlüssel sind geladen. Bitte den gewünschten Schlüssel auswählen.',
  key_rejected:
    'Bitte einen passenden geladenen Signaturschlüssel auswählen. Er muss weiterhin in der gewählten Umgebung registriert sein.',
  invalid_input: 'Bitte Aktion, Ablehnungsgrund und gegebenenfalls die betroffene Anlage prüfen.',
  invalid_resource: 'Einreichung oder Prüfnachweis haben sich geändert. Bitte erneut abrufen und prüfen.',
  verification_failed:
    'Für die Annahme fehlt ein aktueller vollständiger Inhaltsnachweis. Bitte erneut entschlüsseln und prüfen.',
  confirmation_expired: 'Die Bestätigungsfrist ist abgelaufen. Bitte die Aktion erneut vorbereiten.',
  send_locked: 'Diese Aktion kann nicht erneut gesendet werden. Bitte den bekannten Vorgang prüfen.',
  resource_denied: 'Die Zugangsdaten berechtigen nicht zu dieser Empfangsaktion.',
  resource_missing: 'Die Einreichung ist nicht mehr abrufbar. Bitte den Vorgang prüfen.',
  resource_unavailable:
    'Die Aktion konnte nicht abgeschlossen werden. Bei einem ungewissen Ausgang nicht erneut senden.',
};
const warning = (stage) =>
  ({
    MALWARE_ATTACHMENT_BLOCKED:
      'Anlagen wurden vom Virenscan gesperrt. Eine Annahme meldet diese Anlagen als Problem an FIT-Connect.',
    MALWARE_SCAN_NOT_CONFIGURED: 'Kein Malwarescan durchgeführt.',
    XML_SCHEMA_NOT_CHECKED: 'Keine XSD-Prüfung durchgeführt.',
    DATA_SCHEMA_INVALID:
      'Die Fachdaten weichen vom Schema ab. Eine Annahme erfordert Ihre ausdrückliche Bestätigung.',
  })[stage] || `SDK-Prüfhinweis: ${stage}`;
const explain = (cause) =>
  messages[typeof cause === 'string' ? cause : cause?.message] || errorMessage(cause);

async function cancelKnown(value, active) {
  if (!value || !active) return;
  try {
    await cancelReceipt(invoke, active, value.attempt.attemptId);
  } catch (cause) {
    if (alive && resetsSessions(cause)) emit('fatal', cause);
  }
}
function reset() {
  revision++;
  const previous = prepared.value,
    active = owner.value;
  prepared.value = null;
  dialog.value?.close();
  error.value = '';
  keys.value = [];
  selectedKey.value = '';
  started.value = false;
  saveBeforeAccept.value = false;
  intent.value = 'accept';
  reason.value = 'technical-error';
  description.value = '';
  attachment.value = '';
  if (!working.value) void cancelKnown(previous, active);
}
watch(context, reset, { flush: 'sync' });
watch(
  () => props.proof?.proofId,
  () => {
    revision++;
    if (!working.value && prepared.value) {
      const previous = prepared.value;
      prepared.value = null;
      dialog.value?.close();
      void cancelKnown(previous, owner.value);
    }
  },
  { flush: 'sync' },
);
onBeforeUnmount(() => {
  alive = false;
  reset();
});

async function run(name, operation) {
  if (working.value || props.busy || !props.session) return;
  const active = { ...props.session },
    stamp = revision,
    started = performance.now();
  const current = () => alive && stamp === revision;
  working.value = true;
  error.value = '';
  emit('busy', true);
  let status = 'Erfolgreich';
  try {
    status = (await operation(active, current)) || status;
  } catch (cause) {
    status = cancelledProductionAction(cause) ? 'Abgebrochen' : 'Fehlgeschlagen';
    if (current() && !cancelledProductionAction(cause)) {
      error.value = explain(cause);
      if (
        !['engine_busy', 'signing_selection_required', 'export_failed', 'export_expired'].includes(
          typeof cause === 'string' ? cause : cause?.message,
        )
      )
        emit('invalidate');
    }
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    working.value = false;
    emit('busy', false);
    emit('activity', {
      api: active.apiVersion,
      role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action: name,
      status,
      started,
    });
  }
}
async function prepare() {
  if (
    disabled.value ||
    (intent.value === 'accept' && !props.proof) ||
    (intent.value === 'reject' && !Object.hasOwn(reasons, reason.value))
  )
    return;
  const detail = props.detail,
    proof = props.proof;
  const draft = {
    destinationId: detail.destinationId,
    submissionId: detail.submissionId,
    caseId: detail.caseId,
    action: intent.value,
    signingKid: selectedKey.value || null,
    reason: intent.value === 'reject' ? reason.value : null,
    description: intent.value === 'reject' ? description.value || null : null,
    attachmentId:
      intent.value === 'reject' && reason.value === 'attachment-encryption-issue'
        ? attachment.value || null
        : null,
  };
  await run('Empfangsaktion lokal signieren und prüfen', async (active, current) => {
    const existing = await receiptState(invoke, active);
    if (!current()) return 'Abgebrochen';
    if (
      existing.status === 'uncertain' ||
      (existing.status === 'confirmed' && existing.submissionId === detail.submissionId)
    ) {
      outcome.value = { ...existing, apiVersion: active.apiVersion };
      outcomeOwner.value = active.sessionId;
      emit('outcome', { ...existing, apiVersion: active.apiVersion, sessionId: active.sessionId });
      emit('invalidate');
      return existing.status === 'uncertain' ? 'Ausgang ungewiss' : 'Erfolgreich';
    }
    if (existing.status === 'prepared') await cancelReceipt(invoke, active, existing.attemptId);
    const loaded = (await loadedKeys(invoke, active)).keys.filter(
      (key) => key.destinationId === detail.destinationId && key.purpose === 'sign',
    );
    if (!current()) return 'Abgebrochen';
    keys.value = loaded;
    if (!loaded.length) throw new Error('key_missing');
    if (!draft.signingKid && loaded.length === 1) draft.signingKid = loaded[0].kid;
    if (!draft.signingKid && loaded.length > 1) throw new Error('signing_selection_required');
    if (!loaded.some((key) => key.kid === draft.signingKid)) throw new Error('key_rejected');
    const result = await prepareReceipt(invoke, active, draft, draft.action === 'accept' ? proof : null);
    if (!current()) {
      await cancelKnown(result, active);
      return 'Abgebrochen';
    }
    owner.value = active;
    prepared.value = result;
    if (result.warnings.includes('MALWARE_ATTACHMENT_BLOCKED')) saveBeforeAccept.value = false;
    outcome.value = null;
  });
  await nextTick();
  if (alive && prepared.value) dialog.value?.showModal();
}
async function begin(action) {
  if (disabled.value || !['accept', 'reject'].includes(action)) return;
  const key = context.value;
  intent.value = action;
  started.value = true;
  if (action === 'reject') reason.value = '';
  else await prepare();
  await nextTick();
  if (context.value === key && !prepared.value)
    document.getElementById(action === 'reject' ? 'receipt-reason' : 'receipt-key')?.focus();
}
defineExpose({ begin });
async function dismiss() {
  if (!prepared.value || working.value) return;
  const value = prepared.value;
  await run('Empfangsaktion verwerfen', async () => {
    try {
      await cancelReceipt(invoke, owner.value, value.attempt.attemptId);
    } finally {
      prepared.value = null;
      dialog.value?.close();
    }
  });
  await nextTick();
  if (alive && !prepareButton.value?.disabled) prepareButton.value?.focus();
}
async function confirm() {
  if (!prepared.value || working.value || props.busy) return;
  const value = prepared.value,
    active = owner.value;
  await run(
    value.attempt.action === 'accept' ? 'Einreichung annehmen' : 'Einreichung ablehnen',
    async (_, current) => {
      if (value.attempt.action === 'accept' && saveBeforeAccept.value) {
        if (!props.proof || !current()) return 'Abgebrochen';
        const saved = await downloadMessage(invoke, active, exportSource(props.proof), current);
        if (!saved || !current()) return 'Abgebrochen';
      }
      const result = await executeReceipt(invoke, active, value.attempt);
      prepared.value = null;
      dialog.value?.close();
      emit('outcome', { ...result, apiVersion: active.apiVersion, sessionId: active.sessionId });
      if (current()) {
        outcome.value = { ...result, apiVersion: active.apiVersion };
        outcomeOwner.value = active.sessionId;
        emit('invalidate');
        await nextTick();
        resultHeading.value?.focus();
      }
      if (resetsSessions(result.error)) emit('fatal', result.error);
      return result.status === 'confirmed'
        ? 'Erfolgreich'
        : result.status === 'uncertain'
          ? 'Ausgang ungewiss'
          : 'Fehlgeschlagen';
    },
  );
}
</script>

<template>
  <section
    v-show="!guided || started || outcome || error || !proof"
    class="tool-section"
    aria-labelledby="receipt-title"
    :aria-busy="working"
  >
    <p class="workspace-eyebrow">FIT-Connect {{ environment }}</p>
    <h2 id="receipt-title">Empfang abschließen</h2>
    <p>
      Die Aktion wird mit einem geladenen privaten Schlüssel lokal signiert. Erst Ihre Bestätigung überträgt
      sie an FIT-Connect.
    </p>
    <button
      v-if="guided && !started && !proof && !locked"
      class="button secondary"
      type="button"
      :disabled="disabled"
      @click="begin('reject')"
    >
      Ohne Entschlüsselung ablehnen
    </button>
    <form v-if="!locked && (!guided || started)" @submit.prevent="prepare">
      <div class="client-fields">
        <label v-if="!guided" for="receipt-action">
          Aktion
          <select id="receipt-action" v-model="intent" :disabled="disabled">
            <option value="accept">Einreichung annehmen</option>
            <option value="reject">Einreichung ablehnen</option>
          </select>
        </label>
        <label v-if="keys.length > 1" for="receipt-key">
          Geladener Signaturschlüssel
          <select id="receipt-key" v-model="selectedKey" :disabled="disabled">
            <option value="">Bitte auswählen</option>
            <option v-for="key in keys" :key="key.kid" :value="key.kid">{{ key.kid }}</option>
          </select>
        </label>
      </div>
      <template v-if="intent === 'reject'">
        <div class="client-fields">
          <label for="receipt-reason">
            Ablehnungsgrund
            <select id="receipt-reason" v-model="reason" :disabled="disabled" required>
              <option value="" disabled>Bitte Ablehnungsgrund auswählen</option>
              <option v-for="(label, code) in reasons" :key="code" :value="code">{{ label }}</option>
            </select>
          </label>
          <label v-if="reason === 'attachment-encryption-issue'" for="receipt-attachment">
            Betroffene Transportanlage
            <select id="receipt-attachment" v-model="attachment" :disabled="disabled" required>
              <option value="">Bitte auswählen</option>
              <option v-for="id in detail.attachments" :key="id" :value="id">{{ id }}</option>
            </select>
          </label>
        </div>
        <label for="receipt-description">
          Erläuterung (optional)
          <textarea
            id="receipt-description"
            v-model="description"
            maxlength="2048"
            rows="3"
            :disabled="disabled"
          ></textarea>
        </label>
      </template>
      <p v-if="intent === 'accept' && !proof" class="small-note">
        Für eine Annahme zuerst die Inhalte entschlüsseln und prüfen. Eine Ablehnung ist auch ohne
        Entschlüsselung möglich.
      </p>
      <p class="small-note">
        Der Signaturschlüssel wird aus den oben geladenen Destination-Schlüsseln gewählt. Ein einzelner
        passender Schlüssel wird automatisch verwendet.
      </p>
      <div class="client-actions">
        <button
          ref="prepareButton"
          class="button"
          type="submit"
          :disabled="disabled || (intent === 'accept' && !proof)"
        >
          {{
            guided
              ? intent === 'accept'
                ? 'Annahme prüfen'
                : 'Ablehnung prüfen'
              : 'Lokal signieren und prüfen'
          }}
        </button>
      </div>
    </form>
    <p v-if="working" role="status">Empfangsaktion wird verarbeitet …</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="outcome" aria-live="polite">
      <h3 ref="resultHeading" tabindex="-1">Letzte Empfangsaktion</h3>
      <p>
        <span class="status-badge" :class="outcome.status === 'confirmed' ? 'ok' : 'error'">
          {{
            outcome.status === 'confirmed'
              ? outcome.action === 'accept'
                ? 'Annahme von FIT-Connect bestätigt'
                : 'Ablehnung von FIT-Connect bestätigt'
              : outcome.status === 'uncertain'
                ? 'Ausgang ungewiss – nicht erneut senden'
                : 'Aktion nicht abgeschlossen'
          }}
        </span>
      </p>
      <p v-if="outcome.status === 'uncertain'">
        Die Antwort fehlt oder war nicht eindeutig. Die Aktion kann bereits erfolgt sein. Der erneute Versand
        bleibt gesperrt. Prüfen Sie den Vorgang über die bekannten Kennungen.
      </p>
      <p v-if="outcome.status === 'failed'">{{ explain(outcome.error) }}</p>
      <dl class="receipt-dialog-context">
        <dt>API</dt>
        <dd>{{ outcome.apiVersion }}</dd>
        <dt>Einreichung</dt>
        <dd>
          <code>{{ outcome.submissionId }}</code>
        </dd>
        <dt>Vorgang</dt>
        <dd>
          <code>{{ outcome.caseId }}</code>
        </dd>
      </dl>
    </div>
    <dialog
      v-if="prepared"
      ref="dialog"
      class="tool-dialog receipt-dialog"
      aria-labelledby="receipt-confirm-title"
      @cancel.prevent="dismiss"
    >
      <p v-if="error" role="alert">{{ error }}</p>
      <h2 id="receipt-confirm-title">
        {{ prepared.attempt.action === 'accept' ? 'Einreichung annehmen?' : 'Einreichung ablehnen?' }}
      </h2>
      <dl class="receipt-dialog-context">
        <dt>Umgebung / API</dt>
        <dd>{{ environment }} / {{ owner.apiVersion }}</dd>
        <dt>Einreichung</dt>
        <dd>
          <code>{{ prepared.attempt.submissionId }}</code>
        </dd>
        <dt>Vorgang</dt>
        <dd>
          <code>{{ prepared.attempt.caseId }}</code>
        </dd>
        <dt>Signaturschlüssel</dt>
        <dd>
          <code>{{ prepared.attempt.signingKid }}</code>
        </dd>
        <template v-if="prepared.reason">
          <dt>Ablehnungsgrund</dt>
          <dd>{{ reasons[prepared.reason] }}</dd>
        </template>
        <template v-if="prepared.description">
          <dt>Erläuterung</dt>
          <dd class="receipt-description">{{ prepared.description }}</dd>
        </template>
        <template v-if="prepared.attachmentId">
          <dt>Transportanlage</dt>
          <dd>
            <code>{{ prepared.attachmentId }}</code>
          </dd>
        </template>
      </dl>
      <ul v-if="prepared.warnings.length">
        <li v-for="stage in prepared.warnings" :key="stage">{{ warning(stage) }}</li>
      </ul>
      <ReceiptDownloadChoice
        v-if="
          prepared.attempt.action === 'accept' && !prepared.warnings.includes('MALWARE_ATTACHMENT_BLOCKED')
        "
        v-model="saveBeforeAccept"
        :disabled="working"
      />
      <p>
        Prüfen Sie die Angaben und verbleibenden Prüfhinweise für Ihren Integrationstest. Die signierte Aktion
        wird einmalig gesendet. Die Freigabe gilt höchstens 60 Sekunden.
      </p>
      <div class="client-actions">
        <button class="button secondary" type="button" autofocus :disabled="working" @click="dismiss">
          Abbrechen
        </button>
        <button class="button" type="button" :disabled="working" @click="confirm">
          {{
            prepared.attempt.action === 'accept'
              ? prepared.warnings.includes('MALWARE_ATTACHMENT_BLOCKED')
                ? 'Mit Anlagenproblemen annehmen'
                : saveBeforeAccept
                  ? 'Speichern und annehmen'
                  : 'Jetzt annehmen'
              : 'Jetzt ablehnen'
          }}
        </button>
      </div>
    </dialog>
  </section>
</template>
