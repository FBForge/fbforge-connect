<script setup lang="ts">
import { invoke } from '../../native.ts';
import { readTest } from './collection.ts';
import { watch, computed, ref, nextTick } from 'vue';
import { usePreparationRecovery } from './usePreparationRecovery.ts';
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
const editorBusy = ref(false);
const recovery = usePreparationRecovery(controller, editorBusy);
const disabled = computed(() => pending.value || props.busy || editorBusy.value);
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
function closeTest() {
  if (disabled.value || !definition.value) return;
  ask('close', async () => {
    await controller.close(recovery.clear);
    if (!error.value) showOverview();
  });
}
defineExpose({ closeTest });
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
function copy(entry: TestEntry) {
  changeTest(() =>
    controller.act(async () => {
      const value = await readTest(invoke, entry);
      value.id = crypto.randomUUID();
      value.name = `${value.name.slice(0, 150)} – Kopie`;
      await controller.open(value);
    }),
  );
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
  if (!error.value) {
    dirty.value = false;
    await recovery.clear();
    await collection.refresh();
  }
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
watch(
  () => run.value?.id,
  (value, previous) => {
    if (value && value !== previous)
      void recovery.clear().catch((cause) => {
        error.value = storage.scenarioError(cause);
      });
  },
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
    <section v-if="recovery.found.value" class="scenario-notice" aria-label="Gesicherte Vorbereitung">
      <strong>Eine nicht abgeschlossene Vorbereitung ist vorhanden</strong>
      <p>
        {{ recovery.found.value.definition.name }} ·
        {{ new Date(recovery.found.value.savedAt).toLocaleString('de-DE') }}
      </p>
      <div class="client-actions">
        <button
          class="button"
          :disabled="disabled"
          @click="
            recovery.restore();
            nextTick(() => (dirty = true));
          "
        >
          Vorbereitung wiederherstellen
        </button>
        <button class="button secondary" :disabled="disabled" @click="ask('recovery', recovery.discard)">
          Vorbereitung verwerfen
        </button>
      </div>
    </section>
    <p v-if="recovery.error.value" role="alert">
      {{ recovery.error.value }}
      <button class="button secondary" @click="recovery.retry">Erneut lesen</button>
      <button class="button secondary" :disabled="disabled" @click="ask('recovery', recovery.discard)">
        Gesicherte Vorbereitung verwerfen
      </button>
    </p>
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
        @copy="copy"
        @import="importFiles"
        @resume="reveal"
        @close="closeTest"
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
          <button class="button secondary" :disabled="disabled" @click="closeTest">Test schließen</button>
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
          @busy="editorBusy = $event"
        />
        <label v-if="definition.variants.length > 1">
          Datensatz für den nächsten Durchlauf
          <select v-model="variant" :disabled="disabled">
            <option v-for="v in definition.variants" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
        </label>
        <label class="checkbox-label">
          <input v-model="recovery.enabled.value" type="checkbox" :disabled="disabled" />
          Vorbereitung automatisch geschützt speichern
        </label>
        <p class="small-note" role="status">
          {{
            !recovery.enabled.value
              ? 'Änderungen bleiben nur in dieser Sitzung.'
              : recovery.state.value === 'saved'
                ? 'Vorbereitung für Ihr Windows-Benutzerkonto gesichert.'
                : recovery.state.value === 'saving'
                  ? 'Vorbereitung wird gesichert …'
                  : 'Ungespeicherte Änderungen werden nach kurzer Pause gesichert.'
          }}
        </p>
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
        @advance="controller.checkAndContinue"
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
            dialogKind === 'close'
              ? 'Test schließen?'
              : dialogKind === 'recovery'
                ? 'Gesicherte Vorbereitung verwerfen?'
                : dialogKind === 'replace'
                  ? 'Anderen Test öffnen?'
                  : dialogKind === 'test'
                    ? 'Gespeicherten Test löschen?'
                    : 'Gespeicherten Durchlauf löschen?'
          }}
        </h2>
        <p id="scenario-dialog-description">
          {{
            dialogKind === 'close'
              ? 'Das Warten wird beendet. Vorbereitung und bisherige Nachweise werden gespeichert. Sie können den Durchlauf später über die Übersicht fortsetzen. Bereits gesendete Nachrichten bleiben bestehen.'
              : dialogKind === 'recovery'
                ? 'Die automatisch gesicherte Vorbereitung wird dauerhaft entfernt. Gespeicherte Tests und Durchläufe bleiben erhalten.'
                : dialogKind === 'replace'
                  ? 'Ungespeicherte Änderungen an der Vorbereitung werden ersetzt. Gespeicherte Tests und bisherige Durchläufe bleiben erhalten.'
                  : dialogKind === 'test'
                    ? 'Der Test und seine ursprüngliche Vorlage werden aus der lokalen Sammlung entfernt. Bisherige Durchläufe und exportierte Dateien bleiben erhalten.'
                    : 'Der ausgewählte Durchlauf wird aus der lokalen Sammlung entfernt. Geschützte Referenzen bleiben erhalten.'
          }}
        </p>
        <div class="client-actions">
          <button class="button secondary" autofocus @click="closeDialog()">Abbrechen</button>
          <button class="button" @click="closeDialog(true)">
            {{
              dialogKind === 'close'
                ? 'Speichern und schließen'
                : dialogKind === 'replace'
                  ? 'Test wechseln'
                  : dialogKind === 'recovery'
                    ? 'Vorbereitung verwerfen'
                    : 'Eintrag löschen'
            }}
          </button>
        </div>
      </dialog>
    </Teleport>
  </section>
</template>
<style src="./scenarios.css" />
