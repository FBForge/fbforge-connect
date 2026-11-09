<script setup lang="ts">
import { watch, computed, ref, nextTick } from 'vue';
import TestDifferences from '../TestDifferences.vue';
import ScenarioLibrary from './ScenarioLibrary.vue';
import ScenarioSeries from './ScenarioSeries.vue';
import ScenarioPreparation from './ScenarioPreparation.vue';
import ScenarioRunPanel from './ScenarioRunPanel.vue';
import ScenarioResults from './ScenarioResults.vue';
import { useScenarioWorkspace } from './useScenarioWorkspace.ts';
import { useTestCollection } from './useTestCollection.ts';
import type { TestEntry } from './useTestCollection.ts';
import { canReference } from './runs.ts';
import { processDialog } from './templates.ts';
import * as storage from './storage.ts';
import examplePack from '../../examples/integration.fctest.json';
import type { Session } from '../../contracts.d.ts';
import type { Pack } from './types.ts';
const props = withDefaults(
  defineProps<{
    session: Session | null;
    busy: boolean;
    source?: { pack: Pack; requestId: string } | null;
    active?: boolean;
  }>(),
  { active: true },
);
const emit = defineEmits<{
  send: [value: object];
  context: [value: object];
  activity: [value: object | null];
  'legacy-run': [id: string];
}>();
const controller = useScenarioWorkspace(props, {
  send: (value) => emit('send', value),
  context: (value) => emit('context', value),
  activity: (value) => emit('activity', value),
});
const collection = useTestCollection(controller);
const {
  definition,
  run,
  tab,
  variant,
  recordId,
  pending,
  error,
  notice,
  differences,
  assignment,
  waitState,
  comparison,
  steps,
  step,
  available,
  includeValues,
} = controller;
const disabled = computed(() => pending.value || props.busy);
const overview = ref(true),
  dirty = ref(false),
  seriesView = ref(false),
  activeSeries = ref<{ name: string } | null>(null),
  heading = ref<HTMLElement>(),
  panel = ref<HTMLElement>();
const dialog = ref<HTMLDialogElement>(),
  dialogKind = ref('replace');
let pendingAction: (() => void | Promise<void>) | null = null;
let opener: HTMLElement | null = null;
async function reveal() {
  seriesView.value = false;
  overview.value = false;
  await nextTick();
  const stepTitle =
    tab.value === 'run' ? panel.value?.querySelector<HTMLElement>('#scenario-step-title') : null;
  (stepTitle || heading.value)?.focus();
}
function refreshCollection() {
  void Promise.all([controller.refresh(), collection.refresh()]).catch((cause) => {
    error.value = storage.scenarioError(cause);
  });
}
function showOverview() {
  seriesView.value = false;
  overview.value = true;
  refreshCollection();
  void nextTick(() => panel.value?.querySelector<HTMLElement>('#scenario-create-title')?.focus());
}
function ask(kind: string, action: () => void | Promise<void>) {
  dialogKind.value = kind;
  pendingAction = action;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.showModal();
}
function changeTest(action: () => void | Promise<void>) {
  if (definition.value && dirty.value) ask('replace', action);
  else void action();
}
async function closeDialog(confirm = false) {
  dialog.value?.close();
  const action = pendingAction;
  pendingAction = null;
  if (confirm && action) await action();
  else {
    await nextTick();
    if (opener?.isConnected) opener.focus();
  }
}
function create(kind: string) {
  changeTest(() =>
    kind === 'process'
      ? controller.act(async () => controller.open(processDialog(examplePack as Pack)))
      : controller.example(examplePack as Pack, kind as 'accept' | 'reject' | 'reply'),
  );
}
function open(entry: TestEntry) {
  changeTest(() => collection.open(entry));
}
function importFiles(files: File[]) {
  changeTest(() => controller.importFiles(files));
}
function restore(id: string) {
  controller.runChoice.value = id;
  changeTest(() => controller.restore());
}
function compare(id: string) {
  controller.runChoice.value = id;
  void controller.compare();
}
function removeRun(id: string) {
  ask('run', async () => {
    controller.runChoice.value = id;
    await controller.deleteRun();
  });
}
function changeSeries(action: () => Promise<void>, replaces: boolean) {
  if (replaces) changeTest(action);
  else void action();
}
watch(seriesView, async (focused) => {
  if (!focused) return;
  await nextTick();
  panel.value?.querySelector<HTMLElement>('#scenario-series-title')?.focus();
});
async function saveTest() {
  await controller.save();
  if (!error.value) dirty.value = false;
}
watch(
  definition,
  (value, previous) => {
    if (value !== previous) {
      dirty.value = false;
      if (value) void reveal();
    } else dirty.value = true;
  },
  { deep: true },
);
watch(comparison, (value) => {
  if (value) void reveal();
});
watch(
  () => props.active,
  (active) => {
    if (active && overview.value) refreshCollection();
  },
);
watch(
  () => props.source?.requestId,
  () => {
    if (props.source)
      changeTest(() =>
        controller.act(async () => {
          if (props.source) await controller.open(props.source.pack);
        }),
      );
  },
  { immediate: true },
);
</script>
<template>
  <section ref="panel" class="tool-section scenario-workspace" aria-label="Tests">
    <p v-if="error" role="alert" class="scenario-notice error">{{ error }}</p>
    <p v-if="notice" role="status" class="small-note">{{ notice }}</p>
    <div v-show="overview && !seriesView" class="scenario-library">
      <section v-if="activeSeries" class="scenario-current" aria-label="Aktive Testserie">
        <div>
          <span class="small-note">Testserie</span>
          <h2>{{ activeSeries.name }}</h2>
        </div>
        <button class="button secondary" @click="seriesView = true">Aktive Testserie öffnen</button>
      </section>
      <ScenarioLibrary
        :controller="controller"
        :collection="collection"
        :disabled="disabled"
        @create="create"
        @open="open"
        @import="importFiles"
        @resume="reveal"
        @restore="restore"
        @compare="compare"
        @remove="ask('test', () => collection.remove($event))"
        @remove-run="removeRun"
        @legacy-run="emit('legacy-run', $event)"
      />
    </div>
    <div v-if="definition" v-show="!overview && !seriesView" class="scenario-editor">
      <div class="tool-section-heading scenario-section-heading">
        <h2 ref="heading" tabindex="-1">{{ definition.name }}</h2>
        <div class="client-actions">
          <button v-if="activeSeries" class="button secondary" @click="seriesView = true">
            Zur Testserie
          </button>
          <button class="button secondary" :disabled="disabled" @click="showOverview">
            Zur Testübersicht
          </button>
        </div>
      </div>
      <nav class="scenario-tabs" aria-label="Testschritte">
        <button
          v-for="(t, index) in [
            { id: 'prepare', name: 'Vorbereiten' },
            { id: 'run', name: 'Durchführen' },
            { id: 'results', name: 'Ergebnisse' },
          ]"
          :key="t.id"
          class="button secondary"
          :aria-current="tab === t.id ? 'step' : undefined"
          :aria-pressed="tab === t.id"
          :disabled="t.id !== 'prepare' && !run"
          @click="tab = t.id"
        >
          <span class="scenario-step-number" aria-hidden="true">{{ index + 1 }}</span>
          {{ t.name }}
        </button>
      </nav>
      <template v-if="tab === 'prepare'">
        <ScenarioPreparation
          :session="session"
          v-model="definition"
          v-model:assignment="assignment"
          :disabled="disabled"
          @context="emit('context', $event)"
        />
        <label v-if="definition.variants.length > 1">
          Datensatz für den nächsten Durchlauf
          <select v-model="variant" :disabled="disabled">
            <option v-for="v in definition.variants" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
        </label>
        <div class="scenario-toolbar">
          <p v-if="!session" class="small-note">
            Zum Starten ein Profil verbinden. Vorbereiten und Speichern funktionieren auch ohne Verbindung.
          </p>
          <div class="client-actions">
            <button class="button" :disabled="disabled || !session" @click="controller.start">
              Test starten
            </button>
            <button class="button secondary" :disabled="disabled" @click="saveTest">Test speichern</button>
            <button class="button secondary" :disabled="disabled" @click="controller.exportDefinition">
              Testdatei exportieren
            </button>
            <button
              v-if="!activeSeries"
              class="button secondary"
              :disabled="disabled"
              @click="seriesView = true"
            >
              Als Testserie planen
            </button>
          </div>
        </div>
      </template>
      <ScenarioRunPanel
        v-if="tab === 'run' && run"
        :run="run"
        :step="step"
        :total="steps.length"
        :candidates="available"
        :selected="recordId"
        :pending="disabled"
        :waiting="waitState"
        @navigate="controller.navigate"
        @draft="controller.draft"
        @refresh="controller.loadRecords"
        @verify="controller.verify"
        @manual="controller.manual"
        @wait="controller.wait"
        @stop="controller.cancelWait()"
        @select="recordId = $event"
      />
      <TestDifferences v-if="tab === 'run'" :differences="differences" />
      <template v-if="tab === 'results' && run">
        <ScenarioResults :run="run" :comparison="comparison" />
        <label class="checkbox-label">
          <input v-model="includeValues" type="checkbox" />
          Feldwerte in den Ergebnisexport aufnehmen
        </label>
        <p v-if="includeValues" class="small-note">
          Der Export kann personenbezogene Testdaten enthalten. Prüfen Sie die Datei vor der Weitergabe.
        </p>
        <div class="client-actions">
          <button class="button secondary" :disabled="disabled" @click="controller.exportResult">
            Prüfergebnis exportieren
          </button>
          <button
            class="button secondary"
            :disabled="disabled || (!run.reference && !canReference(run))"
            @click="controller.pin"
          >
            {{ run.reference ? 'Referenz aufheben' : 'Als Referenz festlegen' }}
          </button>
        </div>
      </template>
    </div>
    <div v-show="seriesView || overview" class="scenario-series-workspace">
      <div v-if="seriesView" class="client-actions">
        <button class="button secondary" @click="showOverview">Zur Testübersicht</button>
        <button v-if="definition" class="button secondary" @click="reveal">Zum geöffneten Test</button>
      </div>
      <ScenarioSeries
        :controller="controller"
        :disabled="disabled"
        :focused="seriesView"
        @context="emit('context', $event)"
        @active="activeSeries = $event"
        @focus="seriesView = true"
        @change="changeSeries"
      />
    </div>
    <p class="small-note">
      Gespeicherte Tests und Ergebnisse bleiben nach einem Neustart verfügbar. Exportierte Dateien sind
      unverschlüsselt.
    </p>
    <Teleport to="body">
      <dialog
        ref="dialog"
        class="tool-dialog"
        aria-labelledby="scenario-dialog-title"
        aria-describedby="scenario-dialog-description"
        @cancel.prevent="closeDialog()"
      >
        <h2 id="scenario-dialog-title">
          {{
            dialogKind === 'replace'
              ? 'Anderen Test öffnen?'
              : dialogKind === 'test'
                ? 'Gespeicherten Test löschen?'
                : 'Gespeicherten Durchlauf löschen?'
          }}
        </h2>
        <p id="scenario-dialog-description">
          {{
            dialogKind === 'replace'
              ? 'Ungespeicherte Änderungen an der Vorbereitung werden ersetzt. Gespeicherte Tests und bisherige Durchläufe bleiben erhalten.'
              : 'Der ausgewählte Eintrag wird aus der lokalen Sammlung entfernt. Geschützte Referenzen bleiben erhalten.'
          }}
        </p>
        <div class="client-actions">
          <button class="button secondary" autofocus @click="closeDialog()">Abbrechen</button>
          <button class="button" @click="closeDialog(true)">
            {{ dialogKind === 'replace' ? 'Test wechseln' : 'Eintrag löschen' }}
          </button>
        </div>
      </dialog>
    </Teleport>
  </section>
</template>
<style src="./scenarios.css" />
