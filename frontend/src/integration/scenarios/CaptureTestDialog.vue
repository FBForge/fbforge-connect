<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from '../../native.ts';
import { loadSendDestination } from '../../sender-options.ts';
import { packFromCase } from './capture.ts';
import { scenarioError } from './storage.ts';
import type { CaseRecord, Pack } from './types.ts';
import type { Session, RecipientOptions } from '../../contracts.d.ts';
const props = defineProps<{
  session: Session | null;
  record: CaseRecord | null;
  records: CaseRecord[];
  disabled: boolean;
}>();
const emit = defineEmits<{ created: [pack: Pack] }>();
const dialog = ref<HTMLDialogElement>(),
  pending = ref(false),
  error = ref(''),
  name = ref(''),
  service = ref(''),
  schema = ref(''),
  replySchema = ref(''),
  replyId = ref('');
const offer = ref<RecipientOptions | null>(null),
  serviceIndex = ref(0);
let generation = 0,
  opener: Element | null;
const requests = computed(() =>
  props.records.filter(
    (r) =>
      r.caseId === props.record?.caseId &&
      r.kind === 'submission' &&
      r.available !== false &&
      ['sent', 'verified', 'accepted', 'rejected', 'confirmed'].includes(r.status) &&
      !r.warnings.includes('MALWARE_ATTACHMENT_BLOCKED'),
  ),
);
const requestId = ref('');
const request = computed(() => requests.value.find((r) => r.recordId === requestId.value));
const replies = computed(() =>
  props.records.filter(
    (r) =>
      r.caseId === request.value?.caseId &&
      r.kind === 'reply' &&
      r.available !== false &&
      ['sent', 'verified', 'accepted', 'rejected', 'confirmed'].includes(r.status) &&
      !r.warnings.includes('MALWARE_ATTACHMENT_BLOCKED'),
  ),
);
const selectedService = computed(() => offer.value?.services[serviceIndex.value]);
watch(selectedService, (v) => {
  if (v) {
    service.value = v.identifier;
    schema.value = v.schemas[0]?.schemaUri || '';
    replySchema.value = v.replySchemas[0]?.schemaUri || '';
  }
});
function close() {
  generation++;
  dialog.value?.close();
  if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
}
function show() {
  if (props.disabled || !props.record) return;
  opener = document.activeElement;
  requestId.value = requests.value[0]?.recordId || '';
  name.value = (props.record.title || 'Eigener Integrationstest').slice(0, 160);
  replyId.value = '';
  service.value = schema.value = replySchema.value = error.value = '';
  offer.value = null;
  dialog.value?.showModal();
}
async function loadOffer() {
  if (!props.session || !request.value?.destinationId || pending.value) return;
  const stamp = generation;
  pending.value = true;
  try {
    const value = await loadSendDestination(invoke, props.session, request.value.destinationId);
    if (stamp === generation) {
      offer.value = value;
      serviceIndex.value = 0;
    }
  } catch {
    if (stamp === generation)
      error.value =
        'Empfängerangebot konnte nicht geladen werden. Tragen Sie Leistung und Schema aus Ihrer Testvereinbarung ein.';
  } finally {
    pending.value = false;
  }
}
async function create() {
  if (!props.session || !request.value || pending.value) return;
  const stamp = generation;
  pending.value = true;
  error.value = '';
  try {
    const pack = await packFromCase(
      invoke,
      props.session,
      request.value,
      replies.value.find((r) => r.recordId === replyId.value) || null,
      {
        name: name.value,
        serviceIdentifier: service.value,
        schemaUri: schema.value,
        replySchemaUri: replySchema.value,
        receipt:
          request.value.status === 'accepted'
            ? 'accept'
            : request.value.status === 'rejected'
              ? 'reject'
              : 'none',
      },
      () => stamp === generation,
    );
    if (stamp !== generation) return;
    close();
    emit('created', pack);
    await nextTick();
  } catch (cause) {
    error.value =
      cause instanceof Error && cause.message === 'scenario_capture_unavailable'
        ? 'Diese Kopie ist nicht freigegeben oder enthält gesperrte Anlagen. Wählen Sie eine vollständig verfügbare Nachricht.'
        : cause instanceof Error && cause.message === 'test_pack_limit'
          ? 'Der Vorgang überschreitet die Testpaketgrenzen. Maximal 512 KiB Fachdaten, 4 MiB je Anlage und 5 MiB für Fachdaten und Anlagen.'
          : scenarioError(cause);
  } finally {
    pending.value = false;
  }
}
watch(() => props.session?.sessionId, close);
onBeforeUnmount(close);
defineExpose({ show });
</script>
<template>
  <button v-if="requests.length" class="button secondary" :disabled="disabled" @click="show">
    Als Test wiederverwenden
  </button>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="tool-dialog scenario-capture"
      aria-labelledby="capture-test-title"
      @cancel.prevent="close"
    >
      <h2 id="capture-test-title">Test aus Vorgang erstellen</h2>
      <p>
        Fachdaten und Anlagen werden als neuer Test übernommen. Prüfen Sie die Inhalte auf personenbezogene
        Angaben. Der Test wird zunächst zur Bearbeitung geöffnet.
      </p>
      <form @submit.prevent="create">
        <label>
          Testname
          <input v-model="name" required maxlength="160" :disabled="pending" />
        </label>
        <label>
          Einreichung
          <select v-model="requestId" :disabled="pending">
            <option v-for="r in requests" :key="r.recordId" :value="r.recordId">
              {{ r.title }} · {{ r.direction === 'sent' ? 'Gesendet' : 'Empfangen' }}
            </option>
          </select>
        </label>
        <label>
          Erwartete Antwort
          <select v-model="replyId" :disabled="pending">
            <option value="">Keine Antwort übernehmen</option>
            <option v-for="r in replies" :key="r.recordId" :value="r.recordId">
              {{ r.title }} · {{ r.replyId }}
            </option>
          </select>
        </label>
        <p class="small-note">
          Ältere Vorgangskopien enthalten nicht alle Adressierungs- und Schemaangaben. Laden Sie das
          Empfängerangebot oder ergänzen Sie die vereinbarten Kennungen.
        </p>
        <button
          class="button secondary"
          type="button"
          :disabled="pending || !request?.destinationId"
          @click="loadOffer"
        >
          Empfängerangebot laden
        </button>
        <label v-if="offer?.services.length">
          Leistung auswählen
          <select v-model="serviceIndex" :disabled="pending">
            <option v-for="(s, index) in offer.services" :key="s.identifier" :value="index">
              {{ s.name || s.identifier }}
            </option>
          </select>
        </label>
        <label>
          Leistungskennung
          <input v-model="service" required maxlength="4096" :disabled="pending" />
        </label>
        <label>
          Fachdaten-Schema
          <input
            v-model="schema"
            required
            maxlength="4096"
            :disabled="pending"
            list="capture-schema-options"
          />
        </label>
        <datalist id="capture-schema-options">
          <option v-for="s in selectedService?.schemas || []" :key="s.schemaUri" :value="s.schemaUri" />
        </datalist>
        <label v-if="replyId">
          Antwortschema
          <input v-model="replySchema" required maxlength="4096" :disabled="pending" />
        </label>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="pending" role="status">Verfügbare Testinhalte werden zusammengestellt …</p>
        <div class="client-actions">
          <button class="button secondary" type="button" @click="close">Abbrechen</button>
          <button class="button" :disabled="pending">Test zur Bearbeitung öffnen</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>
<style scoped>
.scenario-capture {
  max-width: 44rem;
}
.scenario-capture form {
  display: grid;
  gap: 16px;
}
.scenario-capture label {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.scenario-capture :is(input, select) {
  width: 100%;
  min-width: 0;
}
</style>
