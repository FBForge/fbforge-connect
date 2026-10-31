<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import FileDropInput from '../FileDropInput.vue';
import SavedTestFlows from './SavedTestFlows.vue';
import { invoke } from '../native.js';
import { useEnvironment } from '../environments.js';
const environment = useEnvironment();
import { downloadLocal } from '../local-download.js';
import { parseTestPack, TEST_PACK_BYTES } from '../test-packs.js';
import { listTestLibrary, readTestLibrary } from '../test-library.js';
import { listCases, caseParts, readCaseFile } from '../cases.js';
import {
  flowSteps,
  flowStepHints,
  flowFromPack,
  validateTestFlow,
  eligibleFlowRecord,
  compareTestContent,
} from './test-flows.js';
const props = defineProps({ session: Object, busy: Boolean });
const emit = defineEmits(['send', 'busy']);
const flow = shallowRef(null),
  run = ref(null),
  entries = ref([]),
  choice = ref(''),
  records = ref([]),
  recordId = ref(''),
  pending = ref(false),
  error = ref(''),
  notice = ref('');
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
  if (testCase.value && !props.busy && !pending.value) emit('send', structuredClone(testCase.value));
}
async function verify() {
  const selected = candidates.value.find((item) => item.recordId === recordId.value),
    activeStep = step.value,
    expected = testCase.value,
    activeRun = run.value;
  if (!selected || !activeStep || !activeRun) return;
  return act(async (current) => {
    const session = { ...props.session };
    if (session.environment !== activeRun.environment) throw new Error();
    const parts = await caseParts(invoke, session, selected.recordId);
    const data = parts.find((part) => part.kind === 'data');
    if (!data || data.totalBytes > 512 * 1024) throw new Error();
    let bytes;
    try {
      bytes = await readCaseFile(invoke, session, selected.recordId, data);
      const reply = ['reply', 'check_reply'].includes(activeStep.type),
        message = reply ? expected.reply : expected.request;
      const matches =
        message &&
        data.mimeType === message.mimeType &&
        compareTestContent(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
          message.data,
          message.mimeType,
        );
      if (!current() || run.value !== activeRun) return;
      if (!matches) {
        error.value = 'Die Fachdaten entsprechen nicht dem erwarteten Testfall. Der Schritt bleibt offen.';
        return;
      }
      if (parts.filter((part) => part.kind === 'attachment').length !== message.attachments.length) {
        error.value = 'Die Anzahl der Anlagen stimmt nicht mit dem Testfall überein.';
        return;
      }
      if (
        activeStep.type === 'receipt' &&
        selected.status !== (expected.receipt === 'accept' ? 'accepted' : 'rejected')
      ) {
        error.value = 'Der Empfang wurde nicht wie im Testfall erwartet bestätigt.';
        return;
      }
      // Compare attachment bytes too, including names and types; no arbitrary equality checkbox.
      for (const expectedAttachment of message.attachments) {
        const part = parts.find(
          (p) =>
            p.kind === 'attachment' &&
            p.fileName === expectedAttachment.fileName &&
            p.mimeType === expectedAttachment.mimeType,
        );
        if (!part) throw new Error();
        let actual;
        try {
          actual = await readCaseFile(invoke, session, selected.recordId, part);
          const wanted = atob(expectedAttachment.base64);
          if (actual.length !== wanted.length || actual.some((b, i) => b !== wanted.charCodeAt(i)))
            throw new Error();
        } finally {
          actual?.fill(0);
        }
      }
      if (!current() || run.value !== activeRun) return;
      activeRun.bindings[activeStep.caseId] = {
        caseId: selected.caseId,
        submissionId: selected.submissionId || activeRun.bindings[activeStep.caseId]?.submissionId,
        ...(selected.replyId ? { replyId: selected.replyId } : {}),
      };
      activeRun.results.push({
        step: activeStep.type,
        testCaseId: activeStep.caseId,
        recordId: selected.recordId,
        caseId: selected.caseId,
        submissionId: selected.submissionId,
        replyId: selected.replyId,
        checkedAt: new Date().toISOString(),
        status: 'passed',
      });
      records.value = [];
      recordId.value = '';
      notice.value = 'Schritt anhand der lokalen Nachricht und erwarteter Inhalte erfolgreich geprüft.';
    } finally {
      bytes?.fill(0);
    }
  });
}
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
          <p>
            Sie können passende Profile in derselben Umgebung verbinden. Angeboten werden nur Nachrichten
            dieses Durchlaufs mit übereinstimmenden Kennungen.
          </p>
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
    <Teleport to="body">
      <dialog
        ref="restartDialog"
        class="tool-dialog flow-restart-dialog"
        aria-labelledby="flow-restart-title"
        @cancel.prevent="closeRestart()"
      >
        <h2 id="flow-restart-title">
          {{ replacementFlow ? 'Anderen Ablauf öffnen?' : 'Durchlauf neu starten?' }}
        </h2>
        <p>
          Bisherige Prüfergebnisse werden zurückgesetzt. Exportieren Sie das Durchlaufergebnis vorher, wenn
          Sie es behalten möchten.
        </p>
        <div class="client-actions">
          <button class="button secondary" type="button" autofocus @click="closeRestart()">Abbrechen</button>
          <button
            class="button secondary"
            type="button"
            @click="
              downloadLocal(JSON.stringify({ ...run, bindings: undefined }, null, 2), 'testergebnis.json')
            "
          >
            Durchlaufergebnis exportieren
          </button>
          <button class="button" type="button" @click="closeRestart(true)">
            {{
              replacementFlow
                ? 'Ergebnisse zurücksetzen und Ablauf öffnen'
                : 'Ergebnisse zurücksetzen und neu starten'
            }}
          </button>
        </div>
      </dialog>
    </Teleport>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.flow-restart-dialog {
  max-width: 36rem;
}
</style>
