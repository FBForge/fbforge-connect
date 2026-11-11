<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue';
import { expectedMessage } from './messages.ts';
import CopyValue from '../../CopyValue.vue';
import type { Run, Step, CaseRecord } from './types.ts';
const props = defineProps<{
  run: Run;
  step: Step | undefined;
  total: number;
  candidates: CaseRecord[];
  selected: string;
  pending: boolean;
  waiting: { active: boolean; remaining: number; lastChecked: number | null; message: string };
}>();
const manualDetails = ref<HTMLDetailsElement>();
watch(
  () => props.candidates.length,
  async (count) => {
    if (count > 1) {
      await nextTick();
      if (manualDetails.value) manualDetails.value.open = true;
    }
  },
);
const navigationLabel = computed(
  () =>
    ({
      send: 'Versandentwurf öffnen',
      receive: 'Einreichung im Empfang öffnen',
      compare: 'Inhalte im Empfang öffnen',
      receipt: 'Empfang bestätigen',
      reply: 'Antwort im Empfang verfassen',
      check_reply: 'Antwort im Empfang öffnen',
    })[props.step?.type || 'send'],
);
const heading = ref<HTMLElement>();
async function focusStep() {
  await nextTick();
  heading.value?.focus({ preventScroll: true });
}
watch(() => props.step?.id, focusStep);
onMounted(focusStep);
const emit = defineEmits<{
  navigate: [];
  draft: [];
  refresh: [];
  advance: [];
  verify: [];
  manual: [];
  wait: [];
  stop: [];
  select: [id: string];
}>();
const item = computed(() => props.run.pack.cases.find((c) => c.id === props.step?.caseId));
const expected = computed(() => (props.step ? expectedMessage(props.run, props.step) : null));
const latest = computed(() => [...props.run.attempts].reverse().find((a) => a.stepId === props.step?.id));
const instructions = computed(() =>
  props.step?.external
    ? props.step.type === 'receipt'
      ? 'Die Gegenstelle nimmt die Einreichung an oder lehnt sie ab. Connect prüft die Bestätigung im Event Log.'
      : 'Die Gegenstelle öffnet und prüft die Antwort. Sie können deren Rückmeldung als manuelle Bestätigung festhalten.'
    : {
        send: 'Öffnen Sie den Versandentwurf und bestätigen Sie den Versand. Laden Sie anschließend den lokalen Nachweis.',
        receive: 'Öffnen und prüfen Sie die passende Einreichung im Empfang.',
        compare: 'Vergleichen Sie die freigegebenen Inhalte mit Ihren Erwartungen.',
        receipt:
          'Nehmen Sie die Einreichung an oder lehnen Sie sie ab. Prüfen Sie anschließend den Nachweis.',
        reply:
          'Verfassen und senden Sie die Antwort im Empfang. Die Annahme der Einreichung schließt den Antwortkanal nicht.',
        check_reply: 'Öffnen und prüfen Sie die Antwort im Empfang des sendenden Profils.',
      }[props.step?.type || 'send'],
);
function select(event: Event) {
  if (event.target instanceof HTMLSelectElement) emit('select', event.target.value);
}
</script>
<template>
  <section class="scenario-section" aria-labelledby="scenario-step-title">
    <p class="small-note">
      {{ run.environment }} · API {{ run.assignment.apiVersion }} · Schritt
      {{ Math.min(run.cursor + 1, total) }} von {{ total }}
    </p>
    <progress :value="run.cursor" :max="total" aria-label="Bearbeitete Testschritte" />
    <template v-if="step">
      <h3 id="scenario-step-title" ref="heading" tabindex="-1">{{ step.title }}</h3>
      <p>
        <strong>{{ item?.name }}</strong>
        ·
        {{
          step.external
            ? 'Externe Gegenstelle'
            : step.side === 'sender'
              ? 'Senderprofil in Connect'
              : 'Empfängerprofil in Connect'
        }}
      </p>
      <p>{{ instructions }}</p>
      <div class="client-actions">
        <button
          v-if="!step.external"
          class="button"
          :disabled="pending"
          @click="step.type === 'send' ? emit('draft') : emit('navigate')"
        >
          {{ navigationLabel }}
        </button>
        <button
          v-if="step.type === 'receipt' || !step.external"
          class="button secondary"
          :disabled="pending"
          @click="emit('advance')"
        >
          Prüfen und weiter
        </button>
      </div>
      <details ref="manualDetails">
        <summary>Nachweis gezielt auswählen</summary>
        <button class="button secondary" :disabled="pending" @click="emit('refresh')">
          Nachweise aktualisieren
        </button>
        <label v-if="candidates.length && step.type !== 'receipt'">
          Nachricht für diesen Testschritt
          <select :value="selected" :disabled="pending" @change="select">
            <option value="">Nachricht auswählen</option>
            <option v-for="record in candidates" :key="record.recordId" :value="record.recordId">
              {{ record.title }} · {{ record.submissionId || record.replyId }}
            </option>
          </select>
        </label>
        <button
          v-if="step.type === 'receipt' || !step.external"
          class="button secondary"
          :disabled="pending || (step.type !== 'receipt' && !selected)"
          @click="emit('verify')"
        >
          {{ step.type === 'receipt' ? 'Empfangsbestätigung nachweisen' : 'Ausgewählte Nachricht prüfen' }}
        </button>
      </details>
      <div class="client-actions">
        <button
          v-if="
            !waiting.active &&
            ['receive', 'check_reply', 'receipt'].includes(step.type) &&
            !(step.external && step.type === 'check_reply')
          "
          class="button secondary"
          :disabled="pending"
          @click="emit('wait')"
        >
          Auf Nachweis warten
        </button>
        <button v-if="waiting.active" class="button secondary" @click="emit('stop')">Warten beenden</button>
        <button
          v-if="step.external && step.type === 'check_reply'"
          class="button secondary"
          :disabled="pending"
          @click="emit('manual')"
        >
          Rückmeldung als manuell bestätigt festhalten
        </button>
      </div>
      <p v-if="step.external && step.type === 'check_reply'" class="small-note">
        Eine manuelle Bestätigung ist kein automatischer Inhaltsnachweis. Ein solcher Durchlauf kann nicht als
        vollständig geprüfte Referenz festgelegt werden.
      </p>
      <div v-if="waiting.message" class="scenario-notice" role="status">
        <strong>{{ waiting.message }}</strong>
        <p v-if="waiting.active">
          Maximal fünf Minuten · verbleibend {{ Math.ceil(waiting.remaining / 60000) }} Minuten.
          {{
            waiting.lastChecked
              ? 'Letzte erfolgreiche Abfrage: ' + new Date(waiting.lastChecked).toLocaleTimeString('de-DE')
              : 'Erste Abfrage wird vorbereitet.'
          }}
        </p>
      </div>
      <p v-if="latest" :class="['scenario-check', latest.status]" role="status">
        {{
          latest.status === 'failed'
            ? 'Abweichung'
            : latest.status === 'blocked'
              ? 'Nachweis fehlt'
              : 'Prüfstand'
        }}: {{ latest.detail }}
      </p>
      <details v-if="expected">
        <summary>Erwartete Fachdaten und Anlagen</summary>
        <pre>{{ expected.data }}</pre>
        <CopyValue :value="expected.data" label="Erwarteten Inhalt" :show-value="false" />
        <ul>
          <li v-for="a in expected.attachments" :key="a.fileName">{{ a.fileName }} · {{ a.mimeType }}</li>
        </ul>
      </details>
    </template>
    <p v-else id="scenario-step-title" role="status">
      Alle Schritte sind bearbeitet. Die Ergebnisse unterscheiden automatische Nachweise und manuelle
      Bestätigungen.
    </p>
  </section>
</template>
