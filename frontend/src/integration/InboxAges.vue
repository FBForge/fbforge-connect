<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { invoke } from '../native.js';
import { loadSubmission } from '../submissions.js';
import { readSubmissionTimeline, collectionAge } from './server-timeline.js';
const props = defineProps({ session: Object, items: Array, busy: Boolean, destinationId: String });
const emit = defineEmits(['busy', 'rows']);
const dates = ref({}),
  pending = ref(false),
  error = ref(''),
  filter = ref('all'),
  oldest = ref(false);
let generation = 0;
function reset() {
  generation++;
  dates.value = {};
  filter.value = 'all';
  oldest.value = false;
  error.value = '';
}
watch(() => `${props.session?.sessionId}/${props.destinationId}`, reset);
onBeforeUnmount(reset);
const rows = computed(() => {
  const values = (props.items || []).map((item) => ({
    ...item,
    collection: collectionAge(dates.value[item.submissionId]),
  }));
  const filtered = values.filter(
    (item) =>
      filter.value === 'all' ||
      (filter.value === 'unknown' ? !item.collection : item.collection?.ageDays >= Number(filter.value)),
  );
  return oldest.value
    ? filtered.sort((a, b) => (b.collection?.ageDays ?? -1) - (a.collection?.ageDays ?? -1))
    : filtered;
});
watch(rows, (value) => emit('rows', value), { immediate: true });
async function load() {
  if (pending.value || props.busy || !props.session) return;
  const stamp = generation,
    session = { ...props.session },
    items = [...props.items];
  pending.value = true;
  error.value = '';
  emit('busy', true);
  let unknown = 0;
  try {
    for (const item of items) {
      if (stamp !== generation) break;
      try {
        const target = item.caseId
          ? item
          : await loadSubmission(invoke, session, props.destinationId, item.submissionId);
        if (stamp !== generation) break;
        const result = await readSubmissionTimeline(invoke, session, target, () => stamp === generation);
        if (stamp === generation) dates.value = { ...dates.value, [item.submissionId]: result.submittedAt };
        if (!result.submittedAt) unknown++;
      } catch {
        unknown++;
      }
    }
    if (stamp === generation && unknown)
      error.value = `${unknown} Zeitpunkt(e) nicht feststellbar. Fehlende Berechtigungen, nicht lesbare oder zu große Event Logs werden nicht als neue Einreichungen gewertet.`;
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <section aria-label="Alter und Abholfristen">
    <div class="client-actions">
      <button
        class="button secondary"
        type="button"
        :disabled="busy || pending || !items?.length"
        @click="load"
      >
        {{ pending ? 'Zeitpunkte werden geprüft …' : 'Alter aus Event Logs laden' }}
      </button>
      <label>
        Alter auf dieser Seite
        <select aria-label="Alter auf dieser Seite" v-model="filter" :disabled="pending">
          <option value="all">Alle</option>
          <option value="3">Mindestens 3 Tage</option>
          <option value="9">Mindestens 9 Tage</option>
          <option value="unknown">Zeitpunkt unbekannt</option>
        </select>
      </label>
      <label class="checkbox-label">
        <input v-model="oldest" type="checkbox" :disabled="pending" />
        Älteste zuerst (diese Seite)
      </label>
    </div>
    <p class="small-note">
      Technische Abholfrist: grundsätzlich 14 Tage ab Bereitstellung; danach nicht mehr abrufbar, endgültige
      Löschung nach 21 Tagen. Das sind keine fachlichen Bearbeitungsfristen. Sortierung und Filter gelten für
      die geladene Seite.
    </p>
    <p v-if="error" role="status">{{ error }}</p>
    <p v-if="!rows.length && items?.length" role="status">Keine Einreichungen für diesen Filter.</p>
  </section>
</template>
