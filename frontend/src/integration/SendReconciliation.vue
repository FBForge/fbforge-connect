<script setup>
import { ref, watch } from 'vue';
import { invoke } from '../native.js';
import { readSubmissionTimeline } from './server-timeline.js';
const props = defineProps({ session: Object, outcome: Object, busy: Boolean });
const emit = defineEmits(['busy']);
const result = ref(null),
  pending = ref(false),
  error = ref('');
let generation = 0;
watch(
  () => `${props.session?.sessionId}/${props.outcome?.attemptId}`,
  () => {
    generation++;
    result.value = null;
    error.value = '';
  },
);
async function check() {
  if (pending.value || props.busy || !props.outcome?.submissionId || !props.outcome.caseId) return;
  const stamp = generation;
  pending.value = true;
  error.value = '';
  emit('busy', true);
  try {
    const value = await readSubmissionTimeline(
      invoke,
      { ...props.session },
      props.outcome,
      () => stamp === generation,
    );
    if (stamp === generation) result.value = value;
  } catch {
    if (stamp === generation)
      error.value =
        'Serverstatus nicht feststellbar. Der Versandausgang bleibt ungewiss; daraus folgt keine sichere Erlaubnis zur Wiederholung.';
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <section v-if="outcome?.status === 'uncertain'" aria-label="Versand mit Server abgleichen">
    <p v-if="!outcome.submissionId || !outcome.caseId">
      Es liegt keine vollständige Nachrichtenkennung vor. Ein eindeutiger Serverabgleich ist deshalb nicht
      möglich. Bitte mit der Gegenstelle klären. Nicht automatisch erneut senden.
    </p>
    <button
      v-else
      class="button secondary"
      type="button"
      :disabled="busy || pending || !session"
      @click="check"
    >
      {{ pending ? 'Serverstatus wird geprüft …' : 'Versand mit Server abgleichen' }}
    </button>
    <p v-if="result" role="status">
      {{
        result.submitted
          ? 'Bereitstellung durch signiertes Serverereignis nachgewiesen. Nicht erneut senden.'
          : 'Kein eindeutiges Bereitstellungsereignis gefunden. Der Ausgang bleibt ungewiss.'
      }}
      <template v-if="result.accepted">Empfang wurde angenommen.</template>
      <template v-if="result.rejected">Empfang wurde abgelehnt.</template>
    </p>
    <p v-if="result" class="small-note">
      Nur Statusabgleich. Der lokale Versandversuch wird nicht wiederholt. Eine Inhaltsprüfung oder Annahme
      ist damit nicht nachgewiesen.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
