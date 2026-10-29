<script setup>
import { ref, shallowRef, computed, watch } from 'vue';
import FileDropInput from '../FileDropInput.vue';
import { invoke } from '../native.js';
import { useEnvironment } from '../environments.js';
const environment = useEnvironment();
import { downloadLocal } from '../local-download.js';
import { parseTestPack, TEST_PACK_BYTES } from '../test-packs.js';
import { listTestLibrary, readTestLibrary } from '../test-library.js';
import { listCases, caseParts, readCaseFile } from '../cases.js';
import {
  flowSteps,
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
let generation = 0;
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
  flow.value = value;
  run.value = null;
  records.value = [];
  recordId.value = '';
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
  notice.value =
    'Neuer Durchlauf gestartet. Bestehende Ergebnisse wurden zurückgesetzt. Schreibaktionen werden weiterhin einzeln bestätigt.';
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
      Ein Testfall bleibt ein Baustein. Ein Ablauf führt durch Senden, Eingang, Inhaltsvergleich und
      gegebenenfalls Antwort. FBForge Connect prüft die Ergebnisse anhand der entschlüsselten lokalen
      Nachrichten. Senden, Antworten und Empfangsbestätigungen bleiben Ihre einzeln bestätigten Aktionen.
    </p>
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
        <select v-model="choice" :disabled="busy || pending">
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
    <template v-if="flow">
      <h3>{{ flow.name }}</h3>
      <p>{{ flow.steps.length }} Schritte · {{ flow.pack.cases.length }} Testfälle</p>
      <p class="small-note">
        Exportierte Abläufe enthalten das unverschlüsselte Testpaket mit Fachdaten und Anlagen. Verwenden Sie
        fiktive Testdaten. Der Export enthält keine Zugangsdaten oder privaten Schlüssel.
      </p>
      <div class="client-actions">
        <button
          class="button secondary"
          type="button"
          :disabled="busy || pending"
          @click="downloadLocal(JSON.stringify(flow, null, 2), 'ablauf.fcflow.json')"
        >
          Ablauf exportieren
        </button>
        <button class="button" type="button" :disabled="busy || pending || !session" @click="start">
          {{ run ? 'Neuen Durchlauf starten' : 'Durchlauf starten' }}
        </button>
      </div>
      <p v-if="!session">Zum Durchführen bitte ein Profil verbinden.</p>
      <template v-if="run">
        <p>Umgebung: {{ run.environment }} · Beginn: {{ new Date(run.startedAt).toLocaleString('de-DE') }}</p>
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
        <section v-if="step">
          <h3>{{ flowSteps[step.type] }}: {{ testCase.name }}</h3>
          <p>
            Führen Sie die Aktion im entsprechenden Arbeitsbereich aus und kehren Sie hier zur Prüfung zurück.
            Sie können dazu passende Profile in derselben Umgebung verbinden. Nur Nachrichten dieses
            Durchlaufs mit übereinstimmenden Kennungen werden angeboten.
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
          <label v-if="candidates.length">
            Nachricht für diesen Schritt
            <select aria-label="Nachricht für diesen Schritt" v-model="recordId" :disabled="busy || pending">
              <option value="">Bitte wählen</option>
              <option v-for="record in candidates" :key="record.recordId" :value="record.recordId">
                {{ record.title }} · {{ record.submissionId || record.replyId }} · {{ record.status }}
              </option>
            </select>
          </label>
          <p v-else>
            Keine passende lokale Nachricht geladen. Entschlüsseln und prüfen Sie den Eingang beziehungsweise
            die Antwort zuerst im Empfang.
          </p>
          <button class="button" type="button" :disabled="busy || pending || !recordId" @click="verify">
            Schritt anhand der Inhalte prüfen
          </button>
        </section>
        <p v-else role="status">Alle Schritte dieses Testablaufs sind geprüft.</p>
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
      </template>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
