import { snapshotSendDraft } from './draft-snapshot.ts';
import { useSendSteps } from './useSendSteps.js';
import { inject, ref, shallowRef, computed, watch, nextTick } from 'vue';
import { processWorkspaceKey } from '../process-context.js';
import { caseWorkspaceKey } from '../case-context.js';
import { useSchemaSourceAccess } from '../schema-source-access.js';
import { loadSendDestination } from '../sender-options.js';
import { invoke } from '../native.js';
import { useSendSchema } from './useSendSchema.js';
import { useSendTestCases } from './useSendTestCases.js';
import { useSendAttempt } from './useSendAttempt.js';
import { useSendActivity } from './useSendActivity.ts';
import { explain, diagnosticLabels } from './messages.js';

// Owns the editable send draft and its reactive invalidation rules.
export function useSubmissionSender(props, emit) {
  const storageWarning = ref('');
  const processWorkspace = inject(processWorkspaceKey, null);
  const caseWorkspace = inject(caseWorkspaceKey, null);
  const target = ref(''),
    source = ref(''),
    service = ref(''),
    serviceName = ref('Testantrag'),
    region = ref('DE000000000000');
  watch(
    [() => props.session?.sessionId, () => props.defaultSource],
    () => {
      if (!source.value && props.session?.apiVersion === 'v3' && props.defaultSource)
        source.value = props.defaultSource;
    },
    { immediate: true, flush: 'post' },
  );
  const schema = ref(''),
    mime = ref('application/json'),
    caseId = ref(''),
    addressing = ref('service'),
    modelId = ref(''),
    messageId = ref('');
  const offeredProcessMessages = ref([]);
  const offerReplies = ref(false),
    replySchema = ref(''),
    replyMime = ref('application/json');
  const dataText = ref('{\n  "vorname": "Erika",\n  "nachname": "Musterfrau"\n}');
  const dataFile = shallowRef(null),
    attachments = ref([]),
    prepared = ref(null),
    outcome = ref(null),
    working = ref(false),
    error = ref('');
  const nextDialog = ref(null),
    keepData = ref(true),
    keepAttachments = ref(false),
    draftRevision = ref(0);
  const dialog = ref(null),
    progress = ref(''),
    history = ref([]);
  const packDialog = ref(null),
    pendingTest = shallowRef(null);
  const localValidationSchemas = ref([]),
    dataValidation = shallowRef(null),
    skipSchemaValidation = ref(false),
    confirmedSchemaValidation = ref(false);
  watch(
    () => props.testDraft?.requestId,
    () => {
      if (props.testDraft)
        pendingTest.value = structuredClone({
          id: props.testDraft.id,
          name: props.testDraft.name,
          request: props.testDraft.request,
          reply: props.testDraft.reply,
          receipt: props.testDraft.receipt,
          schemas: props.testDraft.schemas,
        });
    },
  );
  const sendStep = ref(0),
    stepNotice = ref(''),
    sendForm = ref(null),
    recipientButton = ref(null),
    prepareButton = ref(null);
  const sendSections = ['Adressierung', 'Fachdaten', 'Anlagen & Antwortkanal'];

  const allowExternalSchemas = useSchemaSourceAccess(() => props.session);
  const schemaAccess = ref(null);
  watch(
    () => props.session?.sessionId,
    () => {
      localValidationSchemas.value = [];
      skipSchemaValidation.value = false;
    },
  );
  const schemaDocument = shallowRef(null);
  const exampleDialog = ref(null),
    exampleButton = ref(null);
  const schemaContext = computed(() =>
    JSON.stringify([
      props.session?.sessionId,
      props.session?.apiVersion,
      target.value.trim().toLowerCase(),
      service.value,
      addressing.value,
      modelId.value,
      messageId.value,
      schema.value,
      mime.value,
    ]),
  );
  watch(
    schemaContext,
    () => {
      schemaDocument.value = null;
    },
    { flush: 'sync' },
  );
  watch(
    [schemaContext, dataText, dataFile, localValidationSchemas, skipSchemaValidation],
    () => {
      dataValidation.value = null;
    },
    { deep: true, flush: 'sync' },
  );
  const recipient = ref(null),
    schemaChoice = ref(0),
    processChoice = ref(0),
    exampleNotice = ref('');
  const selectedService = computed(() =>
    recipient.value?.services.find((item) => item.identifier === service.value),
  );
  const selectedProcess = computed(() => recipient.value?.processes[processChoice.value]);
  const schemaOptions = computed(() =>
    addressing.value === 'process'
      ? selectedProcess.value?.schemas || []
      : selectedService.value?.schemas || [],
  );
  const replyOptions = computed(() => selectedService.value?.replySchemas || []);
  watch([target, () => props.session?.sessionId], () => {
    recipient.value = null;
    service.value = '';
    schema.value = '';
    exampleNotice.value = '';
  });
  watch(selectedService, (value) => {
    serviceName.value = value?.name || '';
    region.value = value?.regions[0] || 'DE000000000000';
    offerReplies.value = false;
    offeredProcessMessages.value = [];
    replySchema.value = value?.replySchemas[0]?.schemaUri || '';
    replyMime.value = value?.replySchemas[0]?.mimeType || 'application/json';
  });
  watch(selectedProcess, (value) => {
    modelId.value = value?.processModelId || '';
    messageId.value = value?.messageId || '';
  });
  watch(schemaOptions, () => {
    schemaChoice.value = 0;
    selectSchema();
  });
  watch(schemaChoice, selectSchema);
  function selectSchema() {
    const value = schemaOptions.value[schemaChoice.value];
    schema.value = value?.schemaUri || '';
    mime.value = value?.mimeType || 'application/json';
    exampleNotice.value = '';
  }
  async function loadRecipient() {
    if (disabled.value) return;
    const active = { ...props.session },
      destination = target.value.trim().toLowerCase();
    recipient.value = null;
    await act('Empfängerleistungen laden', async () => {
      const value = await loadSendDestination(invoke, active, destination);
      if (active.sessionId !== props.session?.sessionId || destination !== target.value.trim().toLowerCase())
        return;
      recipient.value = value;
      service.value = value.services[0]?.identifier || '';
      processChoice.value = 0;
    });
  }
  function addReplyMessage() {
    const selected = processWorkspace?.selection.value;
    if (!selected) return;
    if (
      selected.schemaUri &&
      (selected.schemaUri !== replySchema.value || selected.mimeType !== replyMime.value)
    ) {
      error.value = 'Das Schema der BPMN-Antwortnachricht passt nicht zum gewählten Antwortschema.';
      return;
    }
    const row = { processModelId: selected.processModelId, messageId: selected.messageId };
    if (
      offeredProcessMessages.value.length < 16 &&
      !offeredProcessMessages.value.some(
        (item) => item.processModelId === row.processModelId && item.messageId === row.messageId,
      )
    )
      offeredProcessMessages.value = [...offeredProcessMessages.value, row];
  }
  async function applyProcessDraft() {
    const draft = props.processDraft;
    if (disabled.value || props.session?.apiVersion !== 'v3' || draft?.sessionId !== props.session.sessionId)
      return;
    target.value = draft.destinationId;
    await nextTick();
    await loadRecipient();
    if (
      props.processDraft?.requestId !== draft.requestId ||
      props.session?.sessionId !== draft.sessionId ||
      !recipient.value
    )
      return;
    const index = recipient.value.processes.findIndex(
      (row) => row.processModelId === draft.processModelId && row.messageId === draft.messageId,
    );
    if (index < 0) {
      error.value =
        'Der Empfänger bietet die gewählte Prozessnachricht nicht mehr an. Bitte im Prozessbereich erneut suchen.';
      return;
    }
    addressing.value = 'process';
    processChoice.value = index;
    await nextTick();
    if (draft.schemaUri) {
      const choice = schemaOptions.value.findIndex(
        (row) => row.schemaUri === draft.schemaUri && row.mimeType === draft.mimeType,
      );
      if (choice < 0) {
        error.value =
          'Das zugeordnete Schema ist beim Empfänger nicht mehr angeboten. Bitte die Auswahl prüfen.';
        return;
      }
      schemaChoice.value = choice;
      selectSchema();
    }
    region.value = draft.region;
    sendStep.value = 0;
    stepNotice.value =
      'BPMN-Auswahl und aktuelles Empfängerangebot übernommen. Bitte eigenen Absender, Vorgang beziehungsweise Leistung und Fachdaten vervollständigen. Es wurde nichts versendet.';
  }
  const locked = computed(
    () => outcome.value?.status === 'uncertain' || outcome.value?.error === 'content_cleanup_failed',
  );
  const disabled = computed(
    () => props.busy || working.value || !props.session || locked.value || Boolean(prepared.value),
  );
  const confirmedSession = ref(null);
  watch(
    () => props.session?.sessionId,
    (next, previous) => {
      if (next === previous) return;
      prepared.value = null;
      dialog.value?.close();
      nextDialog.value?.close();
      source.value = '';
      if (props.session?.apiVersion !== 'v3') addressing.value = 'service';
      if (next) {
        outcome.value = null;
        storageWarning.value = '';
        error.value = '';
      }
    },
  );
  function addFiles(files) {
    if (disabled.value) return;
    for (const file of files)
      attachments.value.push({
        id: crypto.randomUUID(),
        file,
        description: '',
        mimeType: file.type || 'application/octet-stream',
      });
  }
  const actionOpener = ref(null);
  function currentDraft() {
    return snapshotSendDraft(props.session, draft);
  }
  const draft = {
    target,
    source,
    service,
    serviceName,
    region,
    schema,
    mime,
    caseId,
    addressing,
    modelId,
    messageId,
    offeredProcessMessages,
    offerReplies,
    replySchema,
    replyMime,
    dataText,
    dataFile,
    attachments,
    localValidationSchemas,
    schemaChoice,
    processChoice,
    recipient,
  };
  const view = {
    sendStep,
    stepNotice,
    sendForm,
    recipientButton,
    prepareButton,
    dialog,
    nextDialog,
    keepData,
    keepAttachments,
    draftRevision,
    packDialog,
    pendingTest,
    schemaAccess,
    exampleDialog,
    exampleButton,
  };
  const state = {
    storageWarning,
    prepared,
    outcome,
    working,
    error,
    progress,
    history,
    confirmedSession,
    actionOpener,
    dataValidation,
    skipSchemaValidation,
    confirmedSchemaValidation,
  };
  const selection = {
    schemaContext,
    selectedService,
    selectedProcess,
    schemaOptions,
    replyOptions,
    schemaDocument,
    exampleNotice,
    allowExternalSchemas,
    disabled,
  };
  const { revealInvalid, selectStep } = useSendSteps({
    disabled,
    sendStep,
    sendForm,
    stepNotice,
    recipient,
    recipientButton,
  });
  const schemaActions = useSendSchema({ props, act, draft, view, state, selection });
  const testCasesActions = useSendTestCases({
    act,
    currentDraft,
    props,
    selectSchema,
    draft,
    view,
    state,
    selection,
  });
  const attemptActions = useSendAttempt({
    act,
    props,
    checkDataNow,
    currentDraft,
    caseWorkspace,
    emit,
    draft,
    view,
    state,
    selection,
  });
  const activityActions = useSendActivity({ props, emit, explain, state });
  function loadLabels(...args) {
    return schemaActions.loadLabels(...args);
  }
  function createExample(...args) {
    return schemaActions.createExample(...args);
  }
  function checkDataNow(...args) {
    return schemaActions.checkDataNow(...args);
  }
  function checkData(...args) {
    return schemaActions.checkData(...args);
  }
  function addValidationSchemas(...args) {
    return schemaActions.addValidationSchemas(...args);
  }
  function saveTestCase(...args) {
    return testCasesActions.saveTestCase(...args);
  }
  function importTestCase(...args) {
    return testCasesActions.importTestCase(...args);
  }
  function prepare(...args) {
    return attemptActions.prepare(...args);
  }
  function dismiss(...args) {
    return attemptActions.dismiss(...args);
  }
  function send(...args) {
    return attemptActions.send(...args);
  }
  function nextTest(...args) {
    return attemptActions.nextTest(...args);
  }
  function refreshState(...args) {
    return attemptActions.refreshState(...args);
  }
  function act(...args) {
    return activityActions.act(...args);
  }
  return {
    storageWarning,
    target,
    attachments,
    outcome,
    working,
    error,
    nextDialog,
    keepData,
    keepAttachments,
    draftRevision,
    progress,
    history,
    packDialog,
    pendingTest,
    sendStep,
    stepNotice,
    sendForm,
    prepareButton,
    sendSections,
    revealInvalid,
    selectStep,
    exampleDialog,
    schemaContext,
    recipient,
    applyProcessDraft,
    disabled,
    confirmedSession,
    explain,
    diagnosticLabels,
    prepare,
    saveTestCase,
    importTestCase,
    nextTest,
    refreshState,
    source,
    service,
    serviceName,
    region,
    caseId,
    addressing,
    recipientButton,
    processChoice,
    selectedService,
    loadRecipient,
    schema,
    mime,
    dataText,
    dataFile,
    localValidationSchemas,
    dataValidation,
    skipSchemaValidation,
    allowExternalSchemas,
    schemaAccess,
    schemaDocument,
    exampleButton,
    schemaChoice,
    exampleNotice,
    schemaOptions,
    loadLabels,
    createExample,
    checkData,
    addValidationSchemas,
    processWorkspace,
    offeredProcessMessages,
    offerReplies,
    replySchema,
    replyMime,
    replyOptions,
    addReplyMessage,
    addFiles,
    prepared,
    dialog,
    confirmedSchemaValidation,
    dismiss,
    send,
  };
}
