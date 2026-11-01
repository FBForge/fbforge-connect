<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import FileDropInput from '../FileDropInput.vue';
import SavedTestFlows from './SavedTestFlows.vue';
import SavedRunControls from './SavedRunControls.vue';
import TestDifferences from './TestDifferences.vue';
import FlowRestartDialog from './FlowRestartDialog.vue';
import TestFlowContext from './TestFlowContext.vue';
import { useSavedTestRuns } from './useSavedTestRuns.js';
import { useFlowVerification } from './useFlowVerification.js';
import { invoke } from '../native.js';
import { useEnvironment } from '../environments.js';
const environment = useEnvironment();
import { downloadLocal } from '../local-download.js';
import { parseTestPack, TEST_PACK_BYTES } from '../test-packs.js';
import { listTestLibrary, readTestLibrary } from '../test-library.js';
import { listCases } from '../cases.js';
import {
  flowSteps,
  flowStepHints,
  flowFromPack,
  validateTestFlow,
  eligibleFlowRecord,
} from './test-flows.js';
const props = defineProps({ session: Object, busy: Boolean });
const emit = defineEmits(['send', 'busy', 'context']);
const persistence = useSavedTestRuns();
const context = ref({
  senderProfileId: '',
  receiverProfileId: '',
  apiVersion: props.session?.apiVersion || 'v3',
  sourceDestination: '',
  receiverDestination: '',
});
const differences = ref([]);
async function restoreRun() {
  return act(async () => {
    const document = await persistence.read();
    if (document.run.environment !== environment.value) throw new Error();
    flow.value = document.flow;
    context.value = document.context;
    run.value = document.run;
    records.value = [];
    recordId.value = '';
    notice.value =
      'Durchlauf wiederhergestellt. Bisherige Ergebnisse sind historische Prüfungen. Laden und prüfen Sie die Nachricht für den nächsten Schritt erneut. Es wird nichts automatisch gesendet.';
  });
}
const flow = shallowRef(null),
  run = ref(null),
  entries = ref([]),
  choice = ref(''),
  records = ref([]),
  recordId = ref(''),
  pending = ref(false),
  error = ref(''),
  notice = ref('');
watch(
  [() => run.value, context],
  () => {
    void persistence.save(flow.value, run.value, context.value);
  },
  { deep: true },
);

const replacementFlow = shallowRef(null);
const restartDialog = ref(null),
  restartButton = ref(null),
  stepHeading = ref(null);
let generation = 0,
  restartOpener;
watch(
  () => run.value?.results.length,
  async () => {
    await nextTick();
    stepHeading.value?.focus();
  },
);
const step = computed(() => flow.value?.steps[run.value?.results.length || 0]);
const testCase = computed(() => flow.value?.pack.cases.find((item) => item.id === step.value?.caseId));
const expectedMessage = computed(() =>
  ['reply', 'check_reply'].includes(step.value?.type) ? testCase.value?.reply : testCase.value?.request,
);
const candidates = computed(() =>
  run.value && step.value
    ? records.value.filter((record) =>
        eligibleFlowRecord(record, step.value, run.value.startedAt, run.value.bindings[step.value.caseId]),
      )
    : [],
);
watch(
  () => environment.value,
  () => {
    generation++;
    run.value = null;
    records.value = [];
    notice.value = '';
  },
);
watch(
  () => props.session?.sessionId,
  () => {
    generation++;
    records.value = [];
    recordId.value = '';
    error.value = '';
  },
);
async function act(operation) {
  if (pending.value || props.busy) return;
  const stamp = generation;
  pending.value = true;
  error.value = '';
  differences.value = [];
  notice.value = '';
  emit('busy', true);
  try {
    await operation(() => stamp === generation);
  } catch {
    if (stamp === generation)
      error.value =
        'Testablauf konnte nicht geprüft werden. Bitte Format, ausgewählte Nachricht und verfügbare entschlüsselte Daten prüfen.';
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
function show(value) {
  if (run.value?.results.length) {
    replacementFlow.value = value;
    askRestart();
  } else applyFlow(value);
}
function applyFlow(value) {
  flow.value = value;
  run.value = null;
  records.value = [];
  recordId.value = '';
  notice.value = 'Ablauf geöffnet. Starten Sie einen neuen Durchlauf.';
}
function load(files) {
  return act(async (current) => {
    if (!files[0] || files[0].size > TEST_PACK_BYTES + 65536) throw new Error();
    const source = new TextDecoder('utf-8', { fatal: true }).decode(await files[0].arrayBuffer());
    const value = JSON.parse(source);
    const result =
      value.format === 'fbforge-connect-testpack'
        ? flowFromPack(parseTestPack(source))
        : validateTestFlow(value);
    if (current()) show(result);
  });
}
function library() {
  return act(async (current) => {
    const result = await listTestLibrary(invoke);
    if (current()) entries.value = result;
  });
}
function openLibrary() {
  return act(async (current) => {
    const pack = await readTestLibrary(invoke, choice.value);
    if (current()) show(flowFromPack(pack));
  });
}
function askRestart() {
  restartOpener = document.activeElement;
  restartDialog.value.showModal();
}
function requestStart() {
  replacementFlow.value = null;
  if (run.value?.results.length) askRestart();
  else start();
}
async function closeRestart(restart = false) {
  restartDialog.value.close();
  const replacement = replacementFlow.value;
  replacementFlow.value = null;
  if (restart) {
    if (replacement) applyFlow(replacement);
    else start();
  } else {
    await nextTick();
    if (restartOpener?.isConnected) restartOpener.focus();
    else restartButton.value?.focus();
  }
}
function start() {
  if (!flow.value || !props.session || props.busy || pending.value) return;
  run.value = {
    id: crypto.randomUUID(),
    environment: props.session.environment,
    startedAt: Date.now(),
    results: [],
    bindings: {},
  };
  records.value = [];
  notice.value = 'Durchlauf gestartet. Schreibaktionen werden weiterhin einzeln bestätigt.';
}
function loadRecords() {
  return act(async (current) => {
    const value = await listCases(invoke, props.session);
    if (current()) {
      records.value = value.records;
      recordId.value = '';
    }
  });
}
function openDraft() {
  if (testCase.value && !props.busy && !pending.value)
    emit('send', {
      ...structuredClone(testCase.value),
      receiverDestination: context.value.receiverDestination,
    });
}
const verify = useFlowVerification({
  props,
  candidates,
  recordId,
  step,
  testCase,
  run,
  records,
  differences,
  error,
  notice,
  act,
});
</script>
<template>
  <section class="tool-section" aria-labelledby="test-flows-title">
    <h2 id="test-flows-title">Wiederholbare Testabläufe</h2>
    <p>
      Testfälle Schritt für Schritt durchführen und anhand lokaler Nachrichten prüfen. Senden, Antworten und
      Empfangsbestätigungen bestätigen Sie weiterhin einzeln.
    </p>
    <template v-if="flow">
      <h3>{{ flow.name }}</h3>
      <p>
        {{ flow.steps.length }} Schritte · {{ flow.pack.cases.length }}
        {{ flow.pack.cases.length === 1 ? 'Testfall' : 'Testfälle' }}
      </p>
      <div v-if="!run" class="client-actions">
        <button class="button" type="button" :disabled="busy || pending || !session" @click="requestStart">
          Durchlauf starten
        </button>
      </div>
      <p v-if="!session">Zum Durchführen bitte ein Profil verbinden.</p>
      <template v-if="run">
        <p>Umgebung: {{ run.environment }} · Beginn: {{ new Date(run.startedAt).toLocaleString('de-DE') }}</p>
        <p>
          Schritt {{ Math.min(run.results.length + 1, flow.steps.length) }} von {{ flow.steps.length }} ·
          {{ run.results.length }} erfolgreich geprüft
        </p>
        <section v-if="step">
          <h3 ref="stepHeading" tabindex="-1">{{ flowSteps[step.type] }}: {{ testCase.name }}</h3>
          <details v-if="expectedMessage">
            <summary>Erwartete Fachdaten und Anlagen</summary>
            <pre>{{ expectedMessage.data }}</pre>
            <ul>
              <li v-for="item in expectedMessage.attachments" :key="item.fileName">
                {{ item.fileName }} · {{ item.mimeType }}
              </li>
            </ul>
          </details>
          <div class="client-actions">
            <button
              v-if="context.senderProfileId || context.receiverProfileId"
              class="button secondary"
              :disabled="busy || pending"
              @click="
                emit('context', {
                  ...context,
                  side: ['send', 'check_reply'].includes(step.type) ? 'sender' : 'receiver',
                  step: step.type,
                })
              "
            >
              {{
                ['send', 'check_reply'].includes(step.type) ? 'Zum Sender wechseln' : 'Zum Empfänger wechseln'
              }}
            </button>

            <button
              v-if="step.type === 'send'"
              class="button secondary"
              type="button"
              :disabled="busy || pending"
              @click="openDraft"
            >
              Testfall als Versandentwurf öffnen
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="busy || pending || !session || session.environment !== run.environment"
              @click="loadRecords"
            >
              Lokale Ergebnisse laden
            </button>
          </div>
          <label v-if="candidates.length">
            Nachricht für diesen Schritt
            <select aria-label="Nachricht für diesen Schritt" v-model="recordId" :disabled="busy || pending">
              <option value="">Bitte wählen</option>
              <option v-for="record in candidates" :key="record.recordId" :value="record.recordId">
                {{ record.title }} · {{ record.submissionId || record.replyId }} · {{ record.status }}
              </option>
            </select>
          </label>
          <p v-else>{{ flowStepHints[step.type] }}</p>
          <div class="client-actions">
            <button class="button" type="button" :disabled="busy || pending || !recordId" @click="verify">
              Schritt anhand der Inhalte prüfen
            </button>
          </div>
        </section>
        <p v-else role="status">Alle Schritte dieses Testablaufs sind geprüft.</p>
        <div class="client-actions">
          <button
            class="button secondary"
            type="button"
            :disabled="busy || pending"
            @click="
              downloadLocal(JSON.stringify({ ...run, bindings: undefined }, null, 2), 'testergebnis.json')
            "
          >
            Durchlaufergebnis exportieren
          </button>
          <button
            ref="restartButton"
            class="button secondary"
            type="button"
            :disabled="busy || pending || !session"
            @click="requestStart"
          >
            Neuen Durchlauf starten
          </button>
        </div>
        <details>
          <summary>Ablaufplan anzeigen</summary>
          <ol>
            <li
              v-for="(item, index) in flow.steps"
              :key="index"
              :aria-current="index === run.results.length ? 'step' : undefined"
            >
              {{ flowSteps[item.type] }} · {{ item.caseId }} ·
              {{
                index < run.results.length
                  ? 'Erfolgreich'
                  : index === run.results.length
                    ? 'Aktueller Schritt'
                    : 'Ausstehend'
              }}
            </li>
          </ol>
        </details>
      </template>
    </template>
    <details :open="!run">
      <summary>
        {{ run ? 'Ablauf verwalten oder anderen Ablauf öffnen' : 'Ablauf öffnen und speichern' }}
      </summary>
      <SavedRunControls
        :persistence="persistence"
        :environment="environment"
        :busy="busy"
        :pending="pending"
        @restore="restoreRun"
        @select="persistence.selected.value = $event"
        @remove="act(() => persistence.remove())"
      />
      <TestFlowContext
        v-if="flow"
        v-model:context="context"
        :environment="environment"
        :disabled="busy || pending"
        :side="''"
        @open="emit('context', { ...$event, step: step?.type })"
      />
      <SavedTestFlows :flow="flow" :busy="busy || pending" @open="show" @busy="emit('busy', $event)" />
      <FileDropInput
        id="test-flow-file"
        label="Testpaket oder Testablauf öffnen"
        accept=".json,application/json"
        :disabled="busy || pending"
        @files="load"
      />
      <button class="button secondary" type="button" :disabled="busy || pending" @click="library">
        Gespeicherte Testpakete laden
      </button>
      <div v-if="entries.length">
        <label>
          Testpaket
          <select aria-label="Testpaket" v-model="choice" :disabled="busy || pending">
            <option value="">Bitte wählen</option>
            <option v-for="entry in entries" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
          </select>
        </label>
        <button
          class="button secondary"
          type="button"
          :disabled="busy || pending || !choice"
          @click="openLibrary"
        >
          Ablauf aus Testpaket erstellen
        </button>
      </div>
      <p v-if="flow" class="small-note">
        Exportierte Abläufe enthalten unverschlüsselte Testdaten und Anlagen. Verwenden Sie fiktive Daten.
      </p>
      <div v-if="flow" class="client-actions">
        <button
          class="button secondary"
          type="button"
          :disabled="busy || pending"
          @click="downloadLocal(JSON.stringify(flow, null, 2), 'ablauf.fcflow.json')"
        >
          Ablauf exportieren
        </button>
      </div>
    </details>
    <p v-if="persistence.status.value" class="small-note" role="status">{{ persistence.status.value }}</p>
    <p v-if="persistence.error.value" role="alert">{{ persistence.error.value }}</p>
    <TestDifferences :differences="differences" />
    <FlowRestartDialog ref="restartDialog" :replacement="replacementFlow" :run="run" @close="closeRestart" />
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.flow-restart-dialog {
  max-width: 36rem;
}
</style>
