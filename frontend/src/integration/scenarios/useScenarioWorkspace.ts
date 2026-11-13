import { clone } from './model.ts';
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { invoke } from '../../native.ts';
import { listCases } from '../../cases.js';
import { useEnvironment } from '../../environments.js';
import { downloadLocal } from '../../local-download.js';
import { scenarioFrom, scenarioSteps, definitionFingerprint } from './model.ts';
import { startRun, addAttempt, canReference } from './runs.ts';
import * as storage from './storage.ts';
import { requireContext, candidates, verifyRecord, receiptEvidence, observeRemote } from './verification.ts';
import { createWaiter } from './wait.ts';
import { replyKey } from './messages.ts';
import { resultExport } from './report.ts';
import { bindReferences } from './references.ts';
import { receiptExample } from './templates.ts';
import type { Session } from '../../contracts.d.ts';
import type { Scenario, Run, Assignment, CaseRecord, Pack } from './types.ts';
import type { Difference } from './expectations.ts';

export function useScenarioWorkspace(
  props: { session: Session | null; busy: boolean },
  actions: {
    send: (value: object) => void;
    context: (value: object) => void;
    activity: (value: object | null) => void;
  },
) {
  const environment = useEnvironment();
  const definition = ref<Scenario | null>(null),
    run = ref<Run | null>(null),
    tab = ref('prepare');
  const saved = ref<storage.ScenarioSummary[]>([]),
    history = ref<storage.RunSummary[]>([]);
  const runChoice = ref(''),
    variant = ref(''),
    records = ref<CaseRecord[]>([]),
    recordId = ref('');
  const pending = ref(false),
    error = ref(''),
    notice = ref(''),
    differences = ref<Difference[]>([]);
  const assignment = ref<Assignment>({
    apiVersion: props.session?.apiVersion || 'v3',
    senderProfileId: '',
    receiverProfileId: '',
    sourceDestination: '',
    receiverDestination: '',
  });
  const waitState = ref({ active: false, remaining: 0, lastChecked: null as number | null, message: '' });
  const comparison = shallowRef<Run | null>(null);
  let generation = 0,
    alive = true,
    saveQueue = Promise.resolve();
  const steps = computed(() =>
    run.value ? scenarioSteps(run.value.definition) : definition.value ? scenarioSteps(definition.value) : [],
  );
  const step = computed(() => (run.value ? steps.value[run.value.cursor] : undefined));
  const available = computed(() =>
    run.value && step.value ? candidates(records.value, run.value, step.value) : [],
  );
  function publish() {
    actions.activity(
      run.value && (step.value || pending.value)
        ? {
            name: run.value.definition.name,
            step: step.value?.title || 'Ergebnisse sichern',
            index: Math.min(run.value.cursor + 1, steps.value.length),
            total: steps.value.length,
            waiting: waitState.value.active,
            pending: pending.value,
          }
        : null,
    );
  }
  watch([step, waitState, pending], publish, { deep: true });
  function stop(message?: string) {
    if (waitState.value.active) waiter.stop(message);
    else waitState.value = { ...waitState.value, message: '' };
  }
  const waiter = createWaiter({
    changed: (state) => {
      waitState.value = state;
    },
    check: async () => {
      if (props.busy || pending.value || !props.session || !run.value || !step.value) return false;
      const stamp = generation,
        active = { ...props.session },
        currentRun = run.value,
        currentStep = step.value;
      await requireContext(invoke, active, currentRun, currentStep);
      const local = await listCases(invoke, active);
      if (stamp !== generation || !alive) return false;
      records.value = local.records;
      if (candidates(local.records, currentRun, currentStep).length) return true;
      return observeRemote(invoke, active, currentRun, currentStep, () => stamp === generation && alive);
    },
  });
  watch(
    () => props.session?.sessionId,
    () => {
      generation++;
      stop('Verbindung gewechselt. Starten Sie das Warten bei Bedarf erneut.');
      records.value = [];
      recordId.value = '';
    },
  );
  watch(
    () => environment.value,
    () => {
      generation++;
      stop('Umgebung gewechselt. Der bisherige Durchlauf bleibt historisch gespeichert.');
      run.value = null;
      publish();
    },
  );
  async function act(operation: (current: () => boolean) => Promise<void>) {
    if (pending.value || props.busy) return;
    const stamp = generation;
    pending.value = true;
    error.value = '';
    notice.value = '';
    try {
      await operation(() => alive && stamp === generation);
    } catch (cause) {
      if (alive && stamp === generation) error.value = storage.scenarioError(cause);
    } finally {
      pending.value = false;
    }
  }
  async function refresh() {
    saved.value = await storage.listScenarios(invoke);
    history.value = await storage.listRuns(invoke);
  }
  function persist() {
    if (!run.value) return Promise.resolve();
    const document = clone(run.value) as Run;
    saveQueue = saveQueue
      .catch(() => {})
      .then(async () => {
        await storage.saveRun(invoke, document);
        if (alive) {
          notice.value = 'Durchlauf für Ihr Windows-Benutzerkonto gespeichert.';
          history.value = await storage.listRuns(invoke);
        }
      })
      .catch((cause) => {
        if (alive)
          error.value = `Fortschritt noch nicht dauerhaft gespeichert. ${storage.scenarioError(cause)}`;
      });
    return saveQueue;
  }
  async function open(input: unknown) {
    const next = scenarioFrom(input),
      stamp = generation;
    if (run.value) await storage.saveRun(invoke, clone(run.value));
    if (stamp !== generation || !alive) return;
    stop();
    definition.value = next;
    variant.value = definition.value.variants[0].id;
    run.value = null;
    tab.value = 'prepare';
    comparison.value = null;
    records.value = [];
    publish();
  }
  function cancelWait() {
    if (waitState.value.active && run.value && step.value) {
      addAttempt(run.value, {
        status: 'cancelled',
        detail: 'Warten wurde beendet. Es wurde kein Prüfergebnis bestätigt.',
        recordId: null,
      });
      void persist();
    }
    stop();
  }
  const close = (clearPreparation: () => Promise<void>) =>
    act(async (current) => {
      stop();
      const document = run.value ? clone(run.value) : null;
      if (document && step.value)
        addAttempt(document, {
          status: 'cancelled',
          detail:
            'Durchlauf beendet. Bisherige Nachweise bleiben erhalten und können später fortgesetzt werden.',
          recordId: null,
        });
      // Drain earlier writes before the final snapshot. A failed save keeps the test open.
      await saveQueue;
      if (document) await storage.saveRun(invoke, document);
      if (definition.value) await storage.saveScenario(invoke, clone(definition.value));
      await clearPreparation();
      if (!current()) return;
      generation++;
      run.value = null;
      definition.value = null;
      records.value = [];
      recordId.value = '';
      comparison.value = null;
      tab.value = 'prepare';
      publish();
      await refresh();
      notice.value =
        'Test geschlossen. Gespeicherte Tests und bisherige Durchläufe finden Sie in der Übersicht.';
    });
  function example(pack: Pack, kind: 'accept' | 'reject' | 'reply') {
    void act(async () => {
      await open(receiptExample(pack, kind));
    });
  }
  async function importFiles(files: File[]) {
    await act(async () => {
      if (!files[0] || files[0].size > 8 * 1024 * 1024) throw new Error('scenario_invalid');
      await open(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await files[0].arrayBuffer())));
    });
  }
  const save = () =>
    act(async () => {
      if (!definition.value) return;
      await storage.saveScenario(invoke, definition.value);
      await refresh();
      notice.value = 'Test dauerhaft für Ihr Windows-Benutzerkonto gespeichert.';
    });
  const launch = (source: Scenario, selectedVariant: string, context: Assignment) =>
    act(async (current) => {
      if (!props.session) return;
      if (context.apiVersion !== props.session.apiVersion) throw Error('scenario_context_changed');
      if (run.value) await storage.saveRun(invoke, clone(run.value));
      const next = await startRun(source, selectedVariant, environment.value as Run['environment'], context);
      if (!current() || !props.session) return;
      await storage.saveScenario(invoke, next.definition);
      if (!current()) return;
      definition.value = clone(next.definition);
      assignment.value = clone(next.assignment);
      variant.value = next.variantId;
      run.value = next;
      differences.value = [];
      tab.value = 'run';
      records.value = [];
      await persist();
      await refresh();
      publish();
    });
  const start = () =>
    definition.value ? launch(definition.value, variant.value, assignment.value) : Promise.resolve();
  const restore = () =>
    act(async (current) => {
      const value = await storage.readRun(invoke, runChoice.value);
      if (
        value.environment !== environment.value ||
        (await definitionFingerprint(value.definition)) !== value.fingerprint
      )
        throw new Error('scenario_context_changed');
      if (!current()) return;
      stop();
      run.value = value;
      differences.value =
        [...value.attempts]
          .reverse()
          .find((a) => a.stepId === scenarioSteps(value.definition)[value.cursor]?.id)?.differences || [];
      definition.value = clone(value.definition);
      assignment.value = clone(value.assignment);
      variant.value = value.variantId;
      tab.value = value.cursor === scenarioSteps(value.definition).length ? 'results' : 'run';
      notice.value =
        'Historischer Durchlauf geöffnet. Nächste Nachweise werden erneut geprüft. Es wird nichts automatisch gesendet.';
      publish();
    });
  const loadRecords = () =>
    act(async (current) => {
      if (!props.session || !run.value || !step.value) return;
      const active = { ...props.session };
      await requireContext(invoke, active, run.value, step.value);
      const result = await listCases(invoke, active);
      if (current()) {
        records.value = result.records;
        recordId.value = available.value.length === 1 ? available.value[0].recordId : '';
        notice.value = available.value.length
          ? 'Passende lokale Nachrichten geladen.'
          : 'Noch keine passende, freigegebene lokale Kopie. Öffnen Sie die Nachricht zunächst im Empfang.';
      }
    });
  const verify = () =>
    act(async (current) => {
      if (!props.session || !run.value || !step.value) return;
      const active = { ...props.session },
        document = run.value,
        currentStep = step.value;
      await requireContext(invoke, active, document, currentStep);
      differences.value = [];
      try {
        if (currentStep.type === 'receipt') {
          const result = await receiptEvidence(invoke, active, document, currentStep, current);
          if (!current()) return;
          addAttempt(document, {
            status: result.passed ? 'passed' : 'blocked',
            detail: result.detail,
            recordId: null,
          });
        } else {
          const record = available.value.find((r) => r.recordId === recordId.value);
          if (!record) return;
          const result = await verifyRecord(invoke, active, document, currentStep, record, current);
          if (!current()) return;
          differences.value = result.differences;
          if (result.passed && record.caseId) {
            if (result.observedData && !['reply', 'check_reply'].includes(currentStep.type))
              bindReferences(document, currentStep.caseId, result.observedData);
            const binding = document.bindings.find((b) => b.testCaseId === currentStep.caseId);
            if (binding) {
              if (record.replyId && !currentStep.followupId) binding.replyId = record.replyId;
            } else
              document.bindings.push({
                testCaseId: currentStep.caseId,
                caseId: record.caseId,
                submissionId: record.submissionId,
                replyId: record.replyId,
              });
          }
          if (result.passed && record.replyId) {
            document.replyBindings ||= [];
            const key = replyKey(currentStep),
              previous = document.replyBindings.find((b) => b.messageId === key);
            if (previous) previous.replyId = record.replyId;
            else document.replyBindings.push({ messageId: key, replyId: record.replyId });
          }
          addAttempt(document, {
            differences: result.differences,
            context: { caseId: record.caseId, submissionId: record.submissionId, replyId: record.replyId },
            status: result.passed ? 'passed' : 'failed',
            detail: result.detail,
            recordId: record.recordId,
          });
        }
        stop('Prüfung abgeschlossen');
        recordId.value = '';
        records.value = [];
        await persist();
        if (!step.value) tab.value = 'results';
        publish();
      } catch (cause) {
        if (current()) {
          addAttempt(document, { status: 'blocked', detail: storage.scenarioError(cause), recordId: null });
          await persist();
        }
        throw cause;
      }
    });
  async function checkAndContinue() {
    const runId = run.value?.id,
      stepId = step.value?.id,
      sessionId = props.session?.sessionId;
    await loadRecords();
    if (
      error.value ||
      run.value?.id !== runId ||
      step.value?.id !== stepId ||
      props.session?.sessionId !== sessionId
    )
      return;
    if (step.value?.type === 'receipt' || (available.value.length === 1 && recordId.value)) await verify();
    else if (available.value.length > 1)
      notice.value =
        'Mehrere passende Nachrichten gefunden. Wählen Sie den Nachweis für diesen Testschritt ausdrücklich aus.';
  }
  function navigate() {
    if (!run.value || !step.value) return;
    stop();
    actions.context({
      ...run.value.assignment,
      side: step.value.external ? 'sender' : step.value.side,
      step: step.value.type,
    });
  }
  function draft() {
    if (!run.value || !step.value) return;
    const item = run.value.pack.cases.find((c) => c.id === step.value!.caseId);
    if (item)
      actions.send({
        ...clone(item),
        receiverDestination: run.value.assignment.receiverDestination,
        flowContext: {
          ...run.value.assignment,
          side: 'sender',
          step: 'send',
          environment: run.value.environment,
        },
        ...(run.value.definition.sharedCase && run.value.bindings[0]
          ? { continuationCaseId: run.value.bindings[0].caseId }
          : {}),
      });
  }
  function manual() {
    if (!run.value || !step.value?.external || step.value.type === 'receipt') return;
    addAttempt(run.value, {
      status: 'manual',
      detail: 'Von der Gegenstelle manuell bestätigt. Kein automatischer Inhaltsnachweis.',
      recordId: null,
    });
    void persist();
    publish();
  }
  const pin = () =>
    act(async () => {
      if (!run.value || (!run.value.reference && !canReference(run.value))) return;
      run.value.reference = !run.value.reference;
      await persist();
    });
  const compare = () =>
    act(async () => {
      comparison.value = await storage.readRun(invoke, runChoice.value);
      tab.value = 'results';
    });
  const deleteRun = () =>
    act(async () => {
      await storage.removeRun(invoke, runChoice.value);
      runChoice.value = '';
      await refresh();
    });
  function wait() {
    if (!props.session || !run.value || !step.value || pending.value || props.busy) return;
    waiter.start();
  }
  const exportDefinition = () =>
    definition.value &&
    downloadLocal(JSON.stringify(definition.value, null, 2), 'integrationstest.fcscenario.json');
  const includeValues = ref(false);
  watch(
    () => run.value?.id,
    () => {
      includeValues.value = false;
    },
  );
  const exportResult = () =>
    run.value &&
    downloadLocal(JSON.stringify(resultExport(run.value, includeValues.value), null, 2), 'testergebnis.json');
  onMounted(() => {
    void refresh().catch((cause) => {
      error.value = storage.scenarioError(cause);
    });
  });
  onBeforeUnmount(() => {
    alive = false;
    generation++;
    stop();
    actions.activity(null);
  });
  return {
    definition,
    run,
    tab,
    saved,
    history,
    runChoice,
    variant,
    records,
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
    act,
    refresh,
    open,
    cancelWait,
    close,
    example,
    importFiles,
    save,
    start,
    restore,
    loadRecords,
    checkAndContinue,
    verify,
    navigate,
    draft,
    manual,
    pin,
    compare,
    deleteRun,
    wait,
    stop,
    launch,
    sessionId: computed(() => props.session?.sessionId || ''),
    includeValues,
    exportDefinition,
    exportResult,
  };
}
