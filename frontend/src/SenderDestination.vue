<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { invoke } from './native.js';
import { listDestinations } from './resources.js';
import { resetsSessions } from './sessions.js';

const props = defineProps({ modelValue: String, session: Object, busy: Boolean, visible: Boolean });
const emit = defineEmits(['update:modelValue', 'activity', 'fatal']);
const rows = ref([]),
  pending = ref(false),
  attempted = ref(false),
  manual = ref(false),
  notice = ref(''),
  nextOffset = ref(0),
  total = ref(0);
const identity = computed(() =>
  props.session ? `${props.session.apiVersion}/${props.session.sessionId}` : '',
);
const disabled = computed(() => props.busy || !props.session);
const unlistedValue = computed(
  () => props.modelValue && !rows.value.some((row) => row.destinationId === props.modelValue),
);
const more = computed(() => nextOffset.value < total.value && nextOffset.value <= 10000);
let revision = 0;
watch(
  identity,
  () => {
    revision++;
    rows.value = [];
    pending.value = false;
    attempted.value = false;
    manual.value = false;
    notice.value = '';
    nextOffset.value = 0;
    total.value = 0;
  },
  { flush: 'sync' },
);
watch(
  [identity, () => props.visible, () => props.busy],
  () => {
    if (props.visible && props.session?.apiVersion === 'v3' && !attempted.value && !disabled.value) load();
  },
  { immediate: true, flush: 'post' },
);
onBeforeUnmount(() => revision++);

async function load(offset = 0) {
  if (disabled.value || pending.value) return;
  const active = { ...props.session },
    stamp = revision,
    started = performance.now();
  pending.value = true;
  attempted.value = true;
  notice.value = '';
  let status = 'Erfolgreich';
  try {
    const page = await listDestinations(invoke, active, offset);
    if (stamp !== revision) return;
    const combined = offset ? [...rows.value, ...page.destinations] : page.destinations;
    rows.value = [...new Map(combined.map((row) => [row.destinationId.toLowerCase(), row])).values()];
    nextOffset.value = page.destinations.length ? page.offset + page.destinations.length : page.totalCount;
    total.value = page.totalCount;
    if (!rows.value.length)
      notice.value = 'Für diesen Zugang wurden keine Destinations gefunden. Sie können eine ID eingeben.';
    if (
      total.value === 1 &&
      rows.value.length === 1 &&
      rows.value[0].status === 'active' &&
      !props.modelValue?.trim() &&
      !manual.value
    )
      emit('update:modelValue', rows.value[0].destinationId);
  } catch (cause) {
    status = 'Fehlgeschlagen';
    if (stamp !== revision) return;
    const code = typeof cause === 'string' ? cause : cause?.message;
    notice.value =
      code === 'resource_denied'
        ? 'Ihr Zugang darf Destinations nicht auflisten. Geben Sie die Destination ID manuell ein.'
        : 'Die Destinations konnten nicht geladen werden. Geben Sie eine ID ein oder laden Sie die Liste erneut.';
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    if (stamp === revision) pending.value = false;
    emit('activity', {
      api: active.apiVersion,
      role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action: 'Eigene Absender-Destinations laden',
      status,
      started,
    });
  }
}
function edit(value) {
  manual.value = true;
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="sender-destination">
    <label for="send-source">
      <span id="send-source-label">Absender-Destination</span>
      <select
        v-if="rows.length && !manual"
        id="send-source"
        :value="modelValue"
        :disabled="disabled"
        aria-describedby="send-source-help"
        required
        @change="emit('update:modelValue', $event.target.value)"
      >
        <option value="" disabled>Bitte Absender auswählen</option>
        <option v-if="unlistedValue" :value="modelValue">Destination ID — {{ modelValue }}</option>
        <option v-for="row in rows" :key="row.destinationId" :value="row.destinationId">
          {{ row.name || 'Ohne Bezeichnung' }} — {{ row.destinationId }}
        </option>
      </select>
      <input
        v-else
        id="send-source"
        :value="modelValue"
        :disabled="disabled"
        aria-describedby="send-source-help"
        type="text"
        required
        maxlength="36"
        placeholder="Destination ID Ihrer TEST-Zugangsdaten"
        @focus="manual = true"
        @input="edit($event.target.value)"
      />
    </label>
    <div class="sender-destination-actions">
      <button
        v-if="rows.length"
        class="button secondary"
        type="button"
        :disabled="disabled"
        @click="manual = !manual"
      >
        {{ manual ? 'Aus Liste wählen' : 'ID eingeben' }}
      </button>
      <button
        v-if="more"
        class="button secondary"
        type="button"
        :disabled="disabled || pending"
        @click="load(nextOffset)"
      >
        Weitere Destinations laden
      </button>
      <button class="button secondary" type="button" :disabled="disabled || pending" @click="load()">
        {{ pending ? 'Destinations werden geladen …' : 'Liste aktualisieren' }}
      </button>
    </div>
    <small id="send-source-help">
      Der Absender muss zu Ihren Zugangsdaten gehören. Für Replies dort Metadatenversion 2.0.0 oder 3.0.0
      freigeben. Prozessantworten benötigen 3.0.0.
    </small>
    <small v-if="pending || notice" role="status">
      {{ pending ? 'Eigene Absender-Destinations werden geladen …' : notice }}
    </small>
  </div>
</template>

<style scoped>
.sender-destination {
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
}
.sender-destination-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
</style>
