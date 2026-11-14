<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import ScenarioPreparation from './ScenarioPreparation.vue';
import type { Scenario, Assignment, TestCase } from './types.ts';
import type { Session } from '../../contracts.d.ts';
const definition = defineModel<Scenario>({ required: true });
const assignment = defineModel<Assignment>('assignment', { required: true });
const variant = defineModel<string>('variant', { required: true });
const autosave = defineModel<boolean>('autosave', { required: true });
defineProps<{
  session: Session | null;
  disabled: boolean;
  activeSeries: boolean;
  recoveryState: string;
}>();
const emit = defineEmits<{
  context: [value: object];
  busy: [value: boolean];
  start: [];
  save: [];
  export: [];
  series: [];
}>();
const stages = [
  {
    id: 'connection',
    name: 'Verbindung',
    hint: 'Legen Sie fest, welche Gegenstelle Sie testen und welche Profile Sie verwenden.',
  },
  {
    id: 'data',
    name: 'Testdaten',
    hint: 'Die Vorlage ist ausgefüllt. Passen Sie die Einreichung und bei Bedarf die Antwort an.',
  },
  {
    id: 'review',
    name: 'Prüfen und starten',
    hint: 'Prüfen Sie Ihre Auswahl. Der Test führt Sie anschließend durch jeden Schritt.',
  },
];
const page = ref('connection'),
  previous = ref('data'),
  heading = ref<HTMLElement>();
watch(
  () => definition.value,
  () => {
    page.value = 'connection';
  },
);
watch(page, async () => {
  await nextTick();
  heading.value?.focus({ preventScroll: true });
  heading.value?.closest('.scenario-setup')?.scrollIntoView({ block: 'start' });
});
function replyCount(item: TestCase) {
  return (item.reply ? 1 : 0) + (definition.value.followups || []).filter((f) => f.caseId === item.id).length;
}
function options() {
  previous.value = page.value;
  page.value = 'options';
}
</script>
<template>
  <section class="scenario-setup" aria-label="Test vorbereiten">
    <nav class="scenario-tabs scenario-setup-steps" aria-label="Vorbereitungsschritte">
      <button
        v-for="(stage, index) in stages"
        :key="stage.id"
        class="button secondary"
        :aria-current="page === stage.id ? 'step' : undefined"
        :disabled="disabled"
        @click="page = stage.id"
      >
        <span class="scenario-step-number" aria-hidden="true">{{ index + 1 }}</span>
        {{ stage.name }}
      </button>
    </nav>
    <div>
      <h3 ref="heading" tabindex="-1">
        {{ page === 'options' ? 'Weitere Testeinstellungen' : stages.find((s) => s.id === page)?.name }}
      </h3>
      <p class="small-note">
        {{
          page === 'options'
            ? 'Diese Einstellungen sind optional. Die Vorlage enthält bereits passende Prüfungen.'
            : stages.find((s) => s.id === page)?.hint
        }}
      </p>
    </div>
    <ScenarioPreparation
      v-show="page !== 'review'"
      v-model="definition"
      v-model:assignment="assignment"
      :page="page"
      :session="session"
      :disabled="disabled"
      @context="emit('context', $event)"
      @busy="emit('busy', $event)"
    />
    <template v-if="page === 'review'">
      <dl class="scenario-summary">
        <div>
          <dt>Test</dt>
          <dd>{{ definition.name }}</dd>
        </div>
        <div>
          <dt>Gegenstelle</dt>
          <dd>
            {{
              definition.mode === 'sender'
                ? 'Fachverfahren'
                : definition.mode === 'receiver'
                  ? 'Onlinedienst'
                  : 'Beide Seiten'
            }}
            · API {{ assignment.apiVersion }}
          </dd>
        </div>
        <div>
          <dt>Empfangs-Destination</dt>
          <dd>{{ assignment.receiverDestination || 'Wird beim Senden oder Empfangen ausgewählt' }}</dd>
        </div>
      </dl>
      <ul class="scenario-summary-cases">
        <li v-for="item in definition.pack.cases" :key="item.id">
          <strong>{{ item.name }}</strong>
          <span>
            {{ item.request.processMessage ? 'Prozessnachricht' : 'Einreichung' }} ·
            {{ item.request.mimeType === 'application/json' ? 'JSON' : 'XML' }} ·
            {{ item.request.attachments.length }}
            {{ item.request.attachments.length === 1 ? 'Anlage' : 'Anlagen' }}
          </span>
          <span>
            {{
              item.receipt === 'accept'
                ? 'Annahme prüfen'
                : item.receipt === 'reject'
                  ? 'Ablehnung prüfen'
                  : 'Ohne Empfangsbestätigung'
            }}
            ·
            {{
              item.reply
                ? `${replyCount(item)} fachliche ${replyCount(item) === 1 ? 'Antwort' : 'Antworten'}`
                : 'Ohne fachliche Antwort'
            }}
          </span>
        </li>
      </ul>
      <label v-if="definition.variants.length > 1">
        Datensatz für den nächsten Durchlauf
        <select v-model="variant" :disabled="disabled">
          <option v-for="v in definition.variants" :key="v.id" :value="v.id">{{ v.name }}</option>
        </select>
      </label>
      <label class="checkbox-label">
        <input v-model="autosave" type="checkbox" :disabled="disabled" />
        Vorbereitung automatisch geschützt speichern
      </label>
      <p class="small-note">
        Jeden Versand und jede Empfangsbestätigung bestätigen Sie selbst. Test starten sendet noch keine
        Nachricht.
      </p>
    </template>
    <div v-if="page === 'data' || page === 'review'" class="client-actions">
      <button class="button secondary" :disabled="disabled" @click="options">
        Weitere Testeinstellungen
      </button>
    </div>
    <div class="scenario-toolbar">
      <p v-if="page === 'review' && !session" class="small-note">
        Zum Starten ein Profil verbinden. Vorbereiten und Speichern funktionieren auch ohne Verbindung.
      </p>
      <div class="client-actions">
        <button v-if="page === 'options'" class="button" :disabled="disabled" @click="page = previous">
          Zurück zur Vorbereitung
        </button>
        <template v-else>
          <button
            v-if="page !== 'connection'"
            class="button secondary"
            :disabled="disabled"
            @click="page = page === 'data' ? 'connection' : 'data'"
          >
            Zurück
          </button>
          <button
            v-if="page !== 'review'"
            class="button"
            :disabled="disabled"
            @click="page = page === 'connection' ? 'data' : 'review'"
          >
            {{ page === 'connection' ? 'Weiter zu Testdaten' : 'Weiter zur Übersicht' }}
          </button>
          <button v-else class="button" :disabled="disabled || !session" @click="emit('start')">
            Test starten
          </button>
        </template>
      </div>
      <p class="small-note" role="status">
        {{
          !autosave
            ? 'Vorbereitung nur für diese Sitzung.'
            : recoveryState === 'saved'
              ? 'Vorbereitung automatisch gesichert.'
              : recoveryState === 'saving'
                ? 'Vorbereitung wird gesichert …'
                : 'Änderungen werden automatisch gesichert.'
        }}
      </p>
    </div>
    <details v-if="page === 'review'" class="scenario-reuse">
      <summary>Test wiederverwenden oder exportieren</summary>
      <div class="client-actions">
        <button class="button secondary" :disabled="disabled" @click="emit('save')">Test speichern</button>
        <button class="button secondary" :disabled="disabled" @click="emit('export')">
          Testdatei exportieren
        </button>
        <button v-if="!activeSeries" class="button secondary" :disabled="disabled" @click="emit('series')">
          Als Testserie planen
        </button>
      </div>
      <p class="small-note">
        Gespeicherte Tests bleiben nach einem Neustart verfügbar. Exportierte Dateien sind unverschlüsselt.
      </p>
    </details>
  </section>
</template>
