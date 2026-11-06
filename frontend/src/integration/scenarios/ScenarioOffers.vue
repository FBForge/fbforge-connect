<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { invoke } from '../../native.ts';
import { loadSendDestination } from '../../sender-options.ts';
import type { Session, RecipientOptions } from '../../contracts.d.ts';
import type { Assignment, TestCase } from './types.ts';
const props = defineProps<{
  session: Session | null;
  assignment: Assignment;
  item: TestCase;
  disabled: boolean;
}>();
const emit = defineEmits<{ apply: [value: Partial<TestCase>] }>();
const offer = ref<RecipientOptions | null>(null),
  index = ref(0),
  schemaIndex = ref(0),
  replyIndex = ref(0),
  pending = ref(false),
  error = ref(''),
  notice = ref('');
const process = computed(() => Boolean(props.item.request.processMessage));
watch(
  () =>
    `${props.session?.sessionId}/${props.assignment.apiVersion}/${props.assignment.receiverDestination}/${process.value}`,
  () => {
    offer.value = null;
    error.value = notice.value = '';
  },
);
const entries = computed(() => (process.value ? offer.value?.processes || [] : offer.value?.services || []));
const selected = computed(() => entries.value[index.value]);
const replies = computed(() => (process.value ? [] : offer.value?.services[index.value]?.replySchemas || []));
async function load() {
  if (!props.session || pending.value) return;
  const context = `${props.session.sessionId}/${props.assignment.receiverDestination}`;
  pending.value = true;
  error.value = notice.value = '';
  try {
    if (props.session.apiVersion !== props.assignment.apiVersion) throw Error();
    const result = await loadSendDestination(invoke, props.session, props.assignment.receiverDestination);
    if (context !== `${props.session?.sessionId}/${props.assignment.receiverDestination}`) return;
    offer.value = result;
    index.value = schemaIndex.value = replyIndex.value = 0;
  } catch {
    error.value =
      'Empfängerangebot konnte nicht geladen werden. Prüfen Sie API, Verbindung und Empfangs-Destination in der Zuordnung.';
  } finally {
    pending.value = false;
  }
}
function apply() {
  const entry = selected.value,
    schema = entry?.schemas[schemaIndex.value];
  if (!entry || !schema) return;
  if (props.item.reply && !process.value && !replies.value[replyIndex.value]) {
    error.value =
      'Dieses Leistungsangebot enthält kein passendes Antwortschema. Wählen Sie eine andere Leistung oder einen Test ohne Antwort.';
    return;
  }
  const request = { ...props.item.request, schemaUri: schema.schemaUri, mimeType: schema.mimeType };
  if ('identifier' in entry) {
    request.serviceIdentifier = entry.identifier;
    request.serviceName = entry.name || entry.identifier;
  } else {
    request.serviceIdentifier = '';
    request.processMessage = { processModelId: entry.processModelId, messageId: entry.messageId };
  }
  let reply = props.item.reply ? { ...props.item.reply } : null;
  if (reply && !process.value) {
    const choice = replies.value[replyIndex.value];
    reply = { ...reply, schemaUri: choice.schemaUri, mimeType: choice.mimeType };
    request.replyOffer = {
      schemaUri: choice.schemaUri,
      mimeType: choice.mimeType,
      processMessages: request.replyOffer?.processMessages || [],
    };
  }
  emit('apply', { request, reply });
  notice.value =
    'Angebot übernommen. Passen Sie die Fachdaten an die gewählten Schemata an. Die Schemavalidierung erfolgt vor dem Versand.';
}
</script>
<template>
  <details>
    <summary>Angebot der Gegenstelle übernehmen</summary>
    <p class="small-note">
      Übernehmen Sie Leistungs-, Prozess- und Schema-Kennungen aus der zugeordneten Empfangs-Destination.
    </p>
    <button
      class="button secondary"
      :disabled="disabled || pending || !session || !assignment.receiverDestination"
      @click="load"
    >
      Aktuelles Empfängerangebot laden
    </button>
    <p v-if="!assignment.receiverDestination" class="small-note">
      Tragen Sie zuerst unter „Sender und Empfänger zuordnen“ die Empfangs-Destination ein.
    </p>
    <template v-if="offer">
      <label>
        {{ process ? 'Prozessangebot' : 'Leistungsangebot' }}
        <select v-model="index" @change="schemaIndex = replyIndex = 0">
          <option v-for="(entry, i) in entries" :key="i" :value="i">
            {{
              'identifier' in entry
                ? entry.name || entry.identifier
                : entry.processModelId + ' · ' + entry.messageId
            }}
          </option>
        </select>
      </label>
      <label>
        Schema aus Empfängerangebot
        <select v-model="schemaIndex">
          <option v-for="(schema, i) in selected?.schemas || []" :key="schema.schemaUri" :value="i">
            {{ schema.schemaUri }} · {{ schema.mimeType }}
          </option>
        </select>
      </label>
      <label v-if="item.reply && !process">
        Antwortschema aus Empfängerangebot
        <select v-model="replyIndex">
          <option v-for="(schema, i) in replies" :key="schema.schemaUri" :value="i">
            {{ schema.schemaUri }} · {{ schema.mimeType }}
          </option>
        </select>
      </label>
      <button class="button secondary" :disabled="disabled || !selected?.schemas.length" @click="apply">
        Ausgewähltes Angebot übernehmen
      </button>
    </template>
    <p v-if="pending" role="status">Empfängerangebot wird geladen …</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </details>
</template>
