<script setup>
import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from './native.js';
import {
  prepareReplyReceipt,
  executeReplyReceipt,
  cancelReplyReceipt,
  replyReceiptState,
} from './reply-receipts.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';

const props = defineProps({ session: Object, detail: Object, proof: Object, parts: Array, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'invalidate', 'outcome', 'event-log']);
const intent = ref('accept'),
  reason = ref('technical-error'),
  description = ref(''),
  attachment = ref('');
const prepared = shallowRef(null),
  owner = shallowRef(null),
  outcome = shallowRef(null);
const error = ref(''),
  working = ref(false),
  dialog = ref(null),
  prepareButton = ref(null),
  resultHeading = ref(null);
const reasons = {
  'technical-error': 'Technischer Fehler',
  'metadata-encryption-issue': 'Metadaten nicht entschlüsselbar',
  'data-encryption-issue': 'Fachdaten nicht entschlüsselbar',
  'data-schema-violation': 'Fachdaten entsprechen nicht dem Schema',
  'attachment-encryption-issue': 'Anlage nicht entschlüsselbar',
};
const attachments = computed(() => props.parts?.filter((part) => part.kind === 'attachment') || []);
const context = computed(
  () =>
    `${props.session?.apiVersion}/${props.session?.sessionId}/${props.detail?.caseId}/${props.detail?.replyId}/${props.proof?.proofId}`,
);
const locked = computed(
  () =>
    Boolean(outcome.value && props.session) &&
    outcome.value.sessionId === props.session.sessionId &&
    (outcome.value.status === 'uncertain' ||
      (outcome.value.status === 'confirmed' && outcome.value.replyId === props.detail?.replyId)),
);
const disabled = computed(
  () =>
    props.busy || working.value || !props.session || !props.detail || locked.value || Boolean(prepared.value),
);
let revision = 0,
  alive = true;
const explain = (cause) =>
  ({
    verification_failed:
      'Für die Annahme fehlt ein aktueller Inhaltsnachweis oder die Bestätigung konnte nicht geprüft werden. Bitte Inhalte und Event Log prüfen.',
    send_locked:
      'Diese Aktion ist bereits abgeschlossen oder ihr Ausgang ist ungewiss. Bitte den Event Log prüfen.',
    confirmation_expired: 'Die Bestätigungsfrist ist abgelaufen. Bitte die Aktion erneut vorbereiten.',
    invalid_resource: 'Antwort oder Prüfnachweis haben sich geändert. Bitte erneut prüfen.',
    invalid_input: 'Bitte Aktion und Ablehnungsgrund prüfen.',
  })[typeof cause === 'string' ? cause : cause?.message] || errorMessage(cause);
async function cancelKnown(value, active) {
  if (!value || !active) return;
  try {
    await cancelReplyReceipt(invoke, active, value.attempt.attemptId);
  } catch (cause) {
    if (alive && resetsSessions(cause)) emit('fatal', cause);
  }
}
function reset() {
  revision++;
  const value = prepared.value,
    active = owner.value;
  prepared.value = null;
  dialog.value?.close();
  error.value = '';
  intent.value = 'accept';
  reason.value = 'technical-error';
  description.value = '';
  attachment.value = '';
  if (!working.value) void cancelKnown(value, active);
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
  error.value = '';
  emit('busy', true);
  let status = 'Erfolgreich';
  try {
    status = (await operation(active, current)) || status;
  } catch (cause) {
    status = 'Fehlgeschlagen';
    if (current()) error.value = explain(cause);
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
async function prepare() {
  if (disabled.value || (intent.value === 'accept' && !props.proof)) return;
  const draft = {
    caseId: props.detail.caseId,
    replyId: props.detail.replyId,
    action: intent.value,
    reason: intent.value === 'reject' ? reason.value : null,
    description: intent.value === 'reject' ? description.value || null : null,
    attachmentId:
      intent.value === 'reject' && reason.value === 'attachment-encryption-issue'
        ? attachment.value || null
        : null,
  };
  const proof = draft.action === 'accept' ? props.proof : null;
  await run('Antwortquittierung vorbereiten', async (active, current) => {
    const existing = await replyReceiptState(invoke, active);
    if (!current()) return 'Abgebrochen';
    if (
      existing.status === 'uncertain' ||
      (existing.status === 'confirmed' && existing.replyId === draft.replyId)
    ) {
      outcome.value = { ...existing, ...active };
      return existing.status === 'uncertain' ? 'Ausgang ungewiss' : 'Erfolgreich';
    }
    if (existing.status === 'prepared') await cancelReplyReceipt(invoke, active, existing.attemptId);
    const value = await prepareReplyReceipt(invoke, active, draft, proof);
    if (!current()) {
      await cancelKnown(value, active);
      return 'Abgebrochen';
    }
    owner.value = active;
    prepared.value = value;
  });
  await nextTick();
  if (alive && prepared.value) dialog.value?.showModal();
}
async function dismiss() {
  if (!prepared.value || working.value) return;
  const value = prepared.value,
    active = owner.value;
  await run('Antwortquittierung verwerfen', async () => {
    try {
      await cancelReplyReceipt(invoke, active, value.attempt.attemptId);
    } finally {
      prepared.value = null;
      dialog.value?.close();
    }
  });
  await nextTick();
  if (alive) prepareButton.value?.focus();
}
async function confirm() {
  if (!prepared.value || props.busy || working.value) return;
  const value = prepared.value,
    active = owner.value;
  await run(
    value.attempt.action === 'accept' ? 'Antwort annehmen' : 'Antwort ablehnen',
    async (_, current) => {
      const result = await executeReplyReceipt(invoke, active, value.attempt);
      prepared.value = null;
      dialog.value?.close();
      const published = { ...result, apiVersion: active.apiVersion, sessionId: active.sessionId };
      emit('outcome', published);
      if (resetsSessions(result.error)) emit('fatal', result.error);
      if (current()) {
        outcome.value = published;
        if (result.status === 'confirmed' || result.status === 'uncertain') emit('invalidate');
        await nextTick();
        if (alive) resultHeading.value?.focus();
      }
      return result.status === 'confirmed'
        ? 'Erfolgreich'
        : result.status === 'uncertain'
          ? 'Ausgang ungewiss'
          : 'Fehlgeschlagen';
    },
  );
}
function openEvents() {
  if (outcome.value)
    emit('event-log', {
      apiVersion: outcome.value.apiVersion,
      sessionId: outcome.value.sessionId,
      caseId: outcome.value.caseId,
      replyId: outcome.value.replyId,
    });
}
</script>

<template>
  <section class="tool-section" aria-labelledby="reply-receipt-title" :aria-busy="working">
    <h2 id="reply-receipt-title">Antwortempfang abschließen</h2>
    <p>
      Mit einer Annahme bestätigst du den Empfang dieser Antwort. Das ist keine fachliche Antwort an den
      Absender. Erst die Bestätigung im nächsten Schritt überträgt die Aktion an TEST.
    </p>
    <form v-if="!locked" @submit.prevent="prepare">
      <div class="client-fields">
        <label for="reply-receipt-action">
          Aktion
          <select id="reply-receipt-action" v-model="intent" :disabled="disabled">
            <option value="accept">Antwort annehmen</option>
            <option value="reject">Antwort ablehnen</option>
          </select>
        </label>
        <label v-if="intent === 'reject'" for="reply-receipt-reason">
          Ablehnungsgrund
          <select id="reply-receipt-reason" v-model="reason" :disabled="disabled">
            <option
              v-for="(label, code) in reasons"
              :key="code"
              :value="code"
              :disabled="code === 'attachment-encryption-issue' && !attachments.length"
            >
              {{ label }}
            </option>
          </select>
        </label>
      </div>
      <template v-if="intent === 'reject'">
        <label v-if="reason === 'attachment-encryption-issue'" for="reply-receipt-attachment">
          Betroffene Anlage
          <select id="reply-receipt-attachment" v-model="attachment" required :disabled="disabled">
            <option value="">Bitte auswählen</option>
            <option v-for="part in attachments" :key="part.attachmentId" :value="part.attachmentId">
              {{ part.fileName }}
            </option>
          </select>
        </label>
        <label for="reply-receipt-description">
          Erläuterung (optional)
          <textarea
            id="reply-receipt-description"
            v-model="description"
            maxlength="2048"
            rows="3"
            :disabled="disabled"
          ></textarea>
        </label>
      </template>
      <p v-if="intent === 'accept' && !proof" class="small-note">
        Zuerst oben die Inhalte entschlüsseln und prüfen. Eine Ablehnung ist auch möglich, wenn die
        Entschlüsselung fehlschlägt.
      </p>
      <div class="client-actions">
        <button
          ref="prepareButton"
          class="button"
          type="submit"
          :disabled="disabled || (intent === 'accept' && !proof)"
        >
          Aktion vorbereiten
        </button>
      </div>
    </form>
    <p v-if="working" role="status">Empfangsaktion wird verarbeitet …</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="outcome && outcome.sessionId === session?.sessionId" aria-live="polite">
      <h3 ref="resultHeading" tabindex="-1">Ergebnis der Antwortquittierung</h3>
      <p>
        {{
          outcome.status === 'confirmed'
            ? outcome.action === 'accept'
              ? 'TEST hat die Annahme bestätigt.'
              : 'TEST hat die Ablehnung bestätigt.'
            : outcome.status === 'uncertain'
              ? 'Ausgang ungewiss. Bitte nicht erneut senden; die Aktion kann bereits erfolgt sein.'
              : explain(outcome.error)
        }}
      </p>
      <p>
        Antwort:
        <code>{{ outcome.replyId }}</code>
      </p>
      <button class="button secondary" type="button" :disabled="busy || working" @click="openEvents">
        Event Log der Antwort prüfen
      </button>
    </div>
    <dialog
      v-if="prepared"
      ref="dialog"
      class="tool-dialog receipt-dialog"
      aria-labelledby="reply-receipt-confirm-title"
      @cancel.prevent="dismiss"
    >
      <h2 id="reply-receipt-confirm-title">
        {{ prepared.attempt.action === 'accept' ? 'Antwort in TEST annehmen?' : 'Antwort in TEST ablehnen?' }}
      </h2>
      <dl class="receipt-dialog-context">
        <dt>Umgebung / API</dt>
        <dd>TEST / {{ owner.apiVersion }}</dd>
        <dt>Antwort</dt>
        <dd>
          <code>{{ prepared.attempt.replyId }}</code>
        </dd>
        <dt>Vorgang</dt>
        <dd>
          <code>{{ prepared.attempt.caseId }}</code>
        </dd>
        <template v-if="prepared.reason">
          <dt>Grund</dt>
          <dd>{{ reasons[prepared.reason] }}</dd>
        </template>
        <template v-if="prepared.description">
          <dt>Erläuterung</dt>
          <dd>{{ prepared.description }}</dd>
        </template>
        <template v-if="prepared.attachmentId">
          <dt>Anlage</dt>
          <dd>
            <code>{{ prepared.attachmentId }}</code>
          </dd>
        </template>
      </dl>
      <p v-if="prepared.warnings.length">
        Die technischen Prüfhinweise bleiben bestehen. Bitte auch den Inhalt fachlich prüfen.
      </p>
      <p>Die Aktion wird einmalig gesendet. Die Freigabe gilt höchstens 60 Sekunden.</p>
      <div class="client-actions">
        <button class="button secondary" type="button" autofocus :disabled="working" @click="dismiss">
          Abbrechen
        </button>
        <button class="button" type="button" :disabled="working" @click="confirm">
          {{ prepared.attempt.action === 'accept' ? 'Jetzt annehmen' : 'Jetzt ablehnen' }}
        </button>
      </div>
    </dialog>
  </section>
</template>
