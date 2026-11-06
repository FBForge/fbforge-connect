<script setup lang="ts">
import { watch, computed, ref } from 'vue';
import FileDropInput from '../../FileDropInput.vue';
import TestDifferences from '../TestDifferences.vue';
import ScenarioPreparation from './ScenarioPreparation.vue';
import ScenarioRunPanel from './ScenarioRunPanel.vue';
import ScenarioResults from './ScenarioResults.vue';
import { useScenarioWorkspace } from './useScenarioWorkspace.ts';
import { canReference } from './runs.ts';
import { processDialog } from './templates.ts';
import examplePack from '../../examples/integration.fctest.json';
import type { Session } from '../../contracts.d.ts';
import type { Pack } from './types.ts';
const props = defineProps<{
  session: Session | null;
  busy: boolean;
  source?: { pack: Pack; requestId: string } | null;
}>();
const emit = defineEmits<{
  send: [value: object];
  context: [value: object];
  activity: [value: object | null];
}>();
const controller = useScenarioWorkspace(props, {
  send: (value) => emit('send', value),
  context: (value) => emit('context', value),
  activity: (value) => emit('activity', value),
});
const {
  definition,
  run,
  tab,
  saved,
  history,
  legacy,
  choice,
  runChoice,
  legacyChoice,
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
} = controller;
const disabled = computed(() => pending.value || props.busy);
const deleteDialog = ref<HTMLDialogElement>(),
  deleteKind = ref('test');
function confirmDelete(kind: string) {
  deleteKind.value = kind;
  deleteDialog.value?.showModal();
}
async function remove() {
  deleteDialog.value?.close();
  if (deleteKind.value === 'new') {
    await controller.reset();
    return;
  }
  await (deleteKind.value === 'test' ? controller.remove() : controller.deleteRun());
}
watch(
  () => props.source?.requestId,
  () => {
    if (props.source)
      void controller.act(async () => {
        if (props.source) await controller.open(props.source.pack);
      });
  },
  { immediate: true },
);
</script>
<template>
  <section class="tool-section scenario-workspace" aria-labelledby="scenario-title">
    <div class="tool-section-heading">
      <div>
        <h2 id="scenario-title">Integration testen</h2>
        <p>Eine Gegenstelle prüfen, Ergebnisse festhalten und denselben Test wiederholen.</p>
      </div>
    </div>
    <p v-if="error" role="alert" class="scenario-notice error">{{ error }}</p>
    <p v-if="notice" role="status" class="small-note">{{ notice }}</p>
    <template v-if="!definition">
      <h3>Mit welchem Test möchten Sie beginnen?</h3>
      <div class="scenario-starters">
        <button
          class="button secondary"
          :disabled="disabled"
          @click="controller.act(async () => controller.open(processDialog(examplePack as Pack)))"
        >
          Nachforderung und Nachreichung
        </button>
        <button
          class="button secondary"
          :disabled="disabled"
          @click="controller.example(examplePack as Pack, 'accept')"
        >
          Einreichung mit Annahme
        </button>
        <button
          class="button secondary"
          :disabled="disabled"
          @click="controller.example(examplePack as Pack, 'reject')"
        >
          Erwartete Ablehnung
        </button>
        <button
          class="button secondary"
          :disabled="disabled"
          @click="controller.example(examplePack as Pack, 'reply')"
        >
          Einreichung mit Antwort
        </button>
      </div>
      <p class="small-note">
        Die Vorlagen enthalten fiktive Daten. Die angebotene Leistung und Schemata richten Sie passend zu
        Ihrer Gegenstelle ein.
      </p>
    </template>
    <details :open="!definition">
      <summary>Gespeicherten Test öffnen oder Datei importieren</summary>
      <button v-if="definition" class="button secondary" :disabled="disabled" @click="confirmDelete('new')">
        Anderen Test vorbereiten
      </button>
      <template v-if="saved.length">
        <label>
          Gespeicherter Integrationstest
          <select v-model="choice" :disabled="disabled">
            <option value="">Test auswählen</option>
            <option v-for="s in saved" :key="s.id" :value="s.id">
              {{ s.name }} · {{ s.caseCount }} Testfälle
            </option>
          </select>
        </label>
        <div class="client-actions">
          <button class="button secondary" :disabled="disabled || !choice" @click="controller.load">
            Test öffnen
          </button>
          <button class="button secondary" :disabled="disabled || !choice" @click="confirmDelete('test')">
            Test löschen
          </button>
        </div>
      </template>
      <FileDropInput
        id="scenario-import"
        label="Testdefinition, Testablauf oder Testpaket importieren"
        accept=".json,application/json"
        :disabled="disabled"
        @files="controller.importFiles"
      />
      <button class="button secondary" :disabled="disabled" @click="controller.loadLegacy">
        Vorhandene 0.3.0-Sammlung laden
      </button>
      <template v-if="legacy.length">
        <label>
          Bisheriger Test oder Ablauf
          <select v-model="legacyChoice" :disabled="disabled">
            <option value="">Auswählen</option>
            <option v-for="s in legacy" :key="s.kind + s.id" :value="s.kind + ':' + s.id">
              {{ s.name }} · {{ s.kind === 'flow' ? 'Ablauf' : 'Testpaket' }}
            </option>
          </select>
        </label>
        <button class="button secondary" :disabled="disabled || !legacyChoice" @click="controller.openLegacy">
          Für geführten Test übernehmen
        </button>
      </template>
    </details>
    <template v-if="definition">
      <nav class="scenario-tabs" aria-label="Integrationstest bearbeiten">
        <button
          v-for="t in [
            { id: 'prepare', name: 'Vorbereitung' },
            { id: 'run', name: 'Durchführung' },
            { id: 'results', name: 'Ergebnisse' },
          ]"
          :key="t.id"
          class="button secondary"
          :aria-pressed="tab === t.id"
          :disabled="t.id !== 'prepare' && !run"
          @click="tab = t.id"
        >
          {{ t.name }}
        </button>
      </nav>
      <template v-if="tab === 'prepare'">
        <div class="scenario-toolbar client-actions">
          <button class="button" :disabled="disabled || !session" @click="controller.start">
            Neuen Testdurchlauf starten
          </button>
          <button class="button secondary" :disabled="disabled" @click="controller.save">
            Test speichern
          </button>
          <button class="button secondary" :disabled="disabled" @click="controller.exportDefinition">
            Testdefinition exportieren
          </button>
        </div>
        <label v-if="definition.variants.length > 1">
          Datensatz für den nächsten Durchlauf
          <select v-model="variant" :disabled="disabled">
            <option v-for="v in definition.variants" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
        </label>
        <ScenarioPreparation
          :session="session"
          v-model="definition"
          v-model:assignment="assignment"
          :disabled="disabled"
          @context="emit('context', $event)"
        />
        <p v-if="!session" class="small-note">
          Zum Durchführen verbinden Sie ein Profil. Vorbereiten und Speichern funktionieren auch ohne
          Verbindung.
        </p>
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
    </template>
    <details v-if="history.length">
      <summary>Gespeicherte Durchläufe und Referenzen ({{ history.length }}/32)</summary>
      <label>
        Durchlauf auswählen
        <select v-model="runChoice" :disabled="disabled">
          <option value="">Durchlauf auswählen</option>
          <option v-for="r in history" :key="r.id" :value="r.id">
            {{ r.reference ? 'Referenz · ' : '' }}{{ r.name }} · {{ r.environment }} · {{ r.apiVersion }} ·
            {{ new Date(r.startedAt).toLocaleString('de-DE') }} · {{ r.cursor }}/{{ r.total }} Schritte
          </option>
        </select>
      </label>
      <div class="client-actions">
        <button class="button secondary" :disabled="disabled || !runChoice" @click="controller.restore">
          Durchlauf öffnen
        </button>
        <button
          class="button secondary"
          :disabled="disabled || !runChoice || !run"
          @click="controller.compare"
        >
          Mit aktuellem Durchlauf vergleichen
        </button>
        <button class="button secondary" :disabled="disabled || !runChoice" @click="confirmDelete('run')">
          Durchlauf löschen
        </button>
      </div>
    </details>
    <p class="small-note">
      Tests und Fortschritt werden lokal für Ihr Windows-Benutzerkonto geschützt gespeichert. Exportierte
      Definitionen enthalten Testdaten und Anlagen. Verwenden Sie fiktive Daten.
    </p>
    <Teleport to="body">
      <dialog
        ref="deleteDialog"
        class="tool-dialog"
        aria-labelledby="scenario-delete-title"
        @cancel.prevent="deleteDialog?.close()"
      >
        <h2 id="scenario-delete-title">
          {{
            deleteKind === 'new'
              ? 'Anderen Test vorbereiten?'
              : deleteKind === 'test'
                ? 'Gespeicherten Test löschen?'
                : 'Gespeicherten Durchlauf löschen?'
          }}
        </h2>
        <p v-if="deleteKind === 'new'">
          Ungespeicherte Änderungen an der Testvorbereitung werden verworfen. Gespeicherte Tests und bisher
          gesicherte Durchläufe bleiben erhalten.
        </p>
        <p v-else>
          Der ausgewählte Eintrag wird aus der lokalen Sammlung entfernt. Als Referenz geschützte Durchläufe
          bleiben erhalten.
        </p>
        <div class="client-actions">
          <button class="button secondary" autofocus @click="deleteDialog?.close()">Abbrechen</button>
          <button class="button" @click="remove">
            {{ deleteKind === 'new' ? 'Zur Testauswahl' : 'Eintrag löschen' }}
          </button>
        </div>
      </dialog>
    </Teleport>
  </section>
</template>
<style src="./scenarios.css" />
