<script setup>
import { inject, ref, shallowRef, computed, watch, nextTick } from 'vue';
import { invoke } from './native.js';
import { caseStorageNotice } from './cases.js';
const storageWarning = ref('');
import { processWorkspaceKey } from './process-context.js';
const processWorkspace = inject(processWorkspaceKey, null);
import { caseWorkspaceKey } from './case-context.js';
const caseWorkspace = inject(caseWorkspaceKey, null);
import SchemaSourceConsent from './SchemaSourceConsent.vue';
import { useSchemaSourceAccess, withSchemaSourceAccess } from './schema-source-access.js';
import DraftDataPreview from './DraftDataPreview.vue';
import FileDropInput from './FileDropInput.vue';
import SenderDestination from './SenderDestination.vue';
import CopyValue from './CopyValue.vue';
import ServiceLabel from './ServiceLabel.vue';
import { serviceLabel } from './service-label.js';
import DocumentationLink from './DocumentationLink.vue';
import { prepareSend, executeSend, cancelSend, sendState } from './sending.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
import { loadSendDestination, loadSendSchema } from './sender-options.js';
import ExampleDraftDialog from './ExampleDraftDialog.vue';
import {
  packFromDraft,
  serializeTestPack,
  testCaseFiles,
  validateTestPack,
  testPackError,
} from './test-packs.js';
import { downloadLocal } from './local-download.js';
import { validateSendData } from './send-data-validation.js';

const props = defineProps({
  session: Object,
  busy: Boolean,
  processDraft: Object,
  testDraft: Object,
  defaultSource: String,
  visible: { type: Boolean, default: true },
});
const emit = defineEmits(['busy', 'activity', 'fatal', 'event-log', 'cases']);
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
let invalidTarget;
function revealInvalid(event) {
  event.preventDefault();
  if (invalidTarget) return;
  invalidTarget = event.target;
  event.target.closest('details')?.setAttribute('open', '');
  sendStep.value = Number(event.target.closest('fieldset')?.dataset.sendStep || 0);
  const label = event.target.labels?.[0]?.innerText.split('\n')[0].trim();
  stepNotice.value = label
    ? event.target.validity.valueMissing
      ? `Bitte füllen Sie das Feld „${label}“ aus.`
      : `Bitte prüfen Sie das Feld „${label}“.`
    : 'Bitte vervollständigen Sie die markierten Pflichtfelder in diesem Abschnitt.';
  nextTick(() => {
    invalidTarget?.focus();
    invalidTarget = null;
  });
}
async function selectStep(index) {
  if (disabled.value) return;
  if (index > sendStep.value) {
    for (let step = 0; step < index; step++) {
      const controls = sendForm.value?.querySelectorAll(
        `[data-send-step="${step}"] input, [data-send-step="${step}"] select, [data-send-step="${step}"] textarea`,
      );
      const invalid = [...(controls || [])].find(
        (control) => control.willValidate && !control.validity.valid,
      );
      if (invalid) {
        invalid.reportValidity();
        return;
      }
      if (step === 0 && !recipient.value) {
        sendStep.value = 0;
        stepNotice.value = 'Laden Sie zuerst die Leistungen der Empfänger-Destination.';
        await nextTick();
        recipientButton.value?.focus();
        return;
      }
    }
  }
  sendStep.value = index;
  stepNotice.value = '';
  await nextTick();
  sendForm.value?.querySelector(`[data-send-step="${index}"] legend`)?.focus();
}

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
async function loadLabels() {
  if (disabled.value || !schema.value) return;
  const active = { ...props.session },
    key = schemaContext.value,
    destination = target.value.trim().toLowerCase();
  const selection = {
    serviceIdentifier: service.value,
    schemaUri: schema.value,
    processModelId: addressing.value === 'process' ? modelId.value : '',
    messageId: addressing.value === 'process' ? messageId.value : '',
  };
  await act('Schema-Beschriftungen laden', async () => {
    const document = await withSchemaSourceAccess(
      () =>
        loadSendSchema(invoke, active, destination, {
          ...selection,
          allowExternalSchemas: allowExternalSchemas.value,
        }),
      () => schemaAccess.value.request(actionOpener),
      () => schemaContext.value === key,
    );
    if (schemaContext.value === key) schemaDocument.value = document;
  });
}
async function createExample() {
  if (disabled.value || !schema.value) return;
  exampleNotice.value = '';
  const active = { ...props.session },
    destination = target.value.trim().toLowerCase(),
    uri = schema.value,
    format = mime.value,
    key = schemaContext.value;
  await act('Fiktive Fachdaten erzeugen', async () => {
    const document = await withSchemaSourceAccess(
      () =>
        loadSendSchema(invoke, active, destination, {
          serviceIdentifier: service.value,
          schemaUri: uri,
          processModelId: addressing.value === 'process' ? modelId.value : '',
          messageId: addressing.value === 'process' ? messageId.value : '',
          allowExternalSchemas: allowExternalSchemas.value,
        }),
      () => schemaAccess.value.request(actionOpener),
      () => schemaContext.value === key,
    );
    if (schemaContext.value !== key) return;
    const example = await exampleDialog.value.choose({
      source: document,
      mimeType: format,
      uri,
      replacing: Boolean(dataFile.value || dataText.value.trim()),
    });
    if (example === null || schemaContext.value !== key) return;
    schemaDocument.value = document;
    dataFile.value = null;
    dataText.value = example;
    exampleNotice.value =
      'Fiktive Beispieldaten wurden aus dem gewählten Schema erzeugt. Bitte fachliche Angaben, Codelisten und Anlagenverweise prüfen. Der Entwurf ist noch kein Nachweis einer erfolgreichen Schemaprüfung.';
  });
  await nextTick();
  if (schemaContext.value === key) exampleButton.value?.focus();
}

const locked = computed(
  () => outcome.value?.status === 'uncertain' || outcome.value?.error === 'content_cleanup_failed',
);
const disabled = computed(
  () => props.busy || working.value || !props.session || locked.value || Boolean(prepared.value),
);
let confirmedSession;
const messages = {
  invalid_submission:
    'Bitte Adressierung, Fachdaten, Schema und Anlagen prüfen. Höchstens 32 MiB je Datei und 64 MiB insgesamt.',
  data_format_invalid:
    'Die Fachdaten passen nicht zum ausgewählten Format. Für ein XML-Schema wird wohlgeformtes XML benötigt, für ein JSON-Schema gültiges JSON. Nach einer fehlgeschlagenen Beispielerzeugung bleibt der bisherige Inhalt erhalten.',
  invalid_input: 'Bitte die Destination ID und Case ID sowie die übrigen Eingaben prüfen.',
  data_schema_invalid:
    'Die Fachdaten entsprechen nicht dem ausgewählten Schema. Bitte Pflichtfelder, Datentypen, Auswahlwerte und bei XML die gewählte Fachnachricht prüfen.',
  test_certificate_required:
    'Der Empfängerschlüssel benötigt ein gültiges selbstsigniertes TEST-Zertifikat. Es wurde nichts angekündigt.',
  resource_denied: 'Die TEST-Zugangsdaten erlauben diese Aktion oder diese Absender-Destination nicht.',
  resource_unavailable: 'Die TEST-Aktion konnte nicht vollständig abgeschlossen werden.',
  invalid_resource: 'Die TEST-Antwort ist unvollständig oder widersprüchlich.',
  send_locked: 'Dieser Versandversuch kann nicht erneut ausgeführt werden. Bitte seinen Status prüfen.',
  confirmation_expired: 'Die Bestätigung ist abgelaufen. Bitte den Versand erneut vorbereiten.',
  schema_consent_required:
    'Erlauben Sie den Abruf öffentlicher Schemaquellen oder hinterlegen Sie ein lokales Schema.',
  schema_unavailable:
    'Das Schema ist nicht verfügbar oder die Quelle hat eine Fehlerantwort statt eines Schemas geliefert. Ihre bisherigen Fachdaten bleiben erhalten.',
  schema_tls_error: 'Die TLS-Verbindung zur Schemaquelle ist fehlgeschlagen. Das Schema wurde nicht geladen.',
  schema_network_error:
    'Die Schemaquelle konnte nicht erreicht oder vollständig gelesen werden (DNS, Verbindung oder Zeitlimit).',
  schema_http_error:
    'Das Schema ist nicht verfügbar. Die Quelle hat den Abruf mit einem HTTP-Fehler abgewiesen. Ihre bisherigen Fachdaten bleiben erhalten.',
  schema_archive_invalid:
    'Das SDK konnte das XRepository-Archiv nicht als verwendbares Schema-Paket auflösen.',
  example_unavailable:
    'Für dieses Schema konnte kein vollständiger Beispielentwurf erzeugt werden. Bitte Fachdaten manuell einfügen. Die bisherigen Fachdaten bleiben erhalten.',
  content_cleanup_failed:
    'Lokale Inhalte konnten nicht vollständig verworfen werden. Bitte die Sitzung abmelden.',
};
const explain = (cause) => {
  const code = typeof cause === 'string' ? cause : cause?.message;
  if (
    [
      'test_pack_invalid',
      'test_pack_limit',
      'test_data_invalid',
      'test_schema_invalid',
      'test_reply_mismatch',
    ].includes(code)
  )
    return testPackError({ message: code });
  if (code === 'test_offer_mismatch')
    return 'Das aktuelle Empfängerangebot passt nicht zum Testfall. Bitte Destination, Leistung, Prozess und Schema prüfen. Ihr Entwurf wurde nicht ersetzt.';
  return Object.hasOwn(messages, code) ? messages[code] : errorMessage(cause);
};
const diagnosticLabels = {
  source_access: 'Absenderberechtigung',
  recipient_key: 'Empfängerschlüssel',
  limits: 'Übertragungsgrenzen',
  destination: 'Destination laden',
  credentials: 'Zugriff prüfen',
  announce: 'Einreichung ankündigen',
  attachment: 'Anlage übertragen',
  finalize: 'Einreichung abschließen',
  sdk: 'SDK-Verarbeitung',
};

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
let actionOpener;
async function act(action, operation) {
  if (working.value || props.busy) return;
  actionOpener = document.activeElement;
  working.value = true;
  emit('busy', true);
  error.value = '';
  const started = performance.now(),
    active = props.session ? { ...props.session } : confirmedSession;
  let status = 'Erfolgreich';
  try {
    await operation();
    if (outcome.value?.status === 'uncertain') status = 'Ausgang ungewiss';
    else if (outcome.value?.status === 'failed') status = 'Fehlgeschlagen';
  } catch (cause) {
    const cancelled = (typeof cause === 'string' ? cause : cause?.message) === 'content_cancelled';
    status = cancelled ? 'Abgebrochen' : 'Fehlgeschlagen';
    if (!cancelled) error.value = explain(cause);
    if (resetsSessions(cause)) emit('fatal');
  } finally {
    working.value = false;
    emit('busy', false);
    progress.value = '';
    emit('activity', {
      api: active?.apiVersion,
      role: active?.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action,
      status,
      started,
    });
  }
}
async function prepare() {
  if (disabled.value) return;
  await act('Versand lokal vorbereiten', async () => {
    if (!recipient.value || !schema.value || (addressing.value !== 'process' && !selectedService.value))
      throw new Error('invalid_submission');
    confirmedSession = { ...props.session };
    if (!skipSchemaValidation.value && !dataValidation.value) await checkDataNow();
    const draft = currentDraft();
    prepared.value = await prepareSend(
      invoke,
      confirmedSession,
      draft,
      dataFile.value || new Blob([dataText.value]),
      attachments.value,
      {
        onProgress: (item) => {
          progress.value = `${(item.receivedBytes / 1024).toFixed(0)} / ${(item.totalBytes / 1024).toFixed(0)} KiB lokal übertragen`;
        },
      },
    );
    outcome.value = null;
    confirmedSchemaValidation.value = !skipSchemaValidation.value && Boolean(dataValidation.value);
  });
  if (prepared.value) {
    await nextTick();
    dialog.value.showModal();
  }
}
async function checkDataNow() {
  const active = { ...props.session },
    key = schemaContext.value,
    file = dataFile.value,
    text = dataText.value;
  const result = await withSchemaSourceAccess(
    () =>
      validateSendData(
        invoke,
        active,
        target.value.trim().toLowerCase(),
        {
          serviceIdentifier: service.value,
          schemaUri: schema.value,
          processModelId: addressing.value === 'process' ? modelId.value : '',
          messageId: addressing.value === 'process' ? messageId.value : '',
          allowExternalSchemas: allowExternalSchemas.value,
          mimeType: mime.value,
        },
        file || new Blob([text]),
        localValidationSchemas.value,
      ),
    () => schemaAccess.value.request(actionOpener),
    () => schemaContext.value === key,
  );
  if (
    active.sessionId !== props.session?.sessionId ||
    key !== schemaContext.value ||
    file !== dataFile.value ||
    text !== dataText.value
  )
    throw new Error('session_missing');
  dataValidation.value = result;
}
async function checkData() {
  if (disabled.value || !schema.value) return;
  await act('Fachdaten gegen Schema prüfen', checkDataNow);
}
async function addValidationSchemas(files) {
  if (disabled.value) return;
  await act('Lokale Versandschemata auswählen', async () => {
    const rows = [];
    if (files.length + localValidationSchemas.value.length > 32) throw new Error('content_limit');
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) throw new Error('content_limit');
      let uri = schema.value;
      if (/\.json$/i.test(file.name) || file.type.includes('json')) {
        try {
          const definition = JSON.parse(await file.text());
          if (typeof definition.$id === 'string') uri = definition.$id;
        } catch {
          throw new Error('schema_unavailable');
        }
      }
      rows.push({ id: crypto.randomUUID(), uri, file });
    }
    localValidationSchemas.value = [...localValidationSchemas.value, ...rows];
  });
}
function currentDraft() {
  return {
    destinationId: target.value.trim().toLowerCase(),
    fromDestinationId: props.session.apiVersion === 'v3' ? source.value.trim().toLowerCase() : null,
    serviceIdentifier: service.value.trim(),
    serviceName: serviceName.value.trim(),
    region: region.value.trim() || null,
    schemaUri: schema.value.trim(),
    mimeType: mime.value,
    caseId: caseId.value.trim().toLowerCase() || null,
    processMessage:
      props.session.apiVersion === 'v3' && addressing.value === 'process'
        ? { processModelId: modelId.value.trim(), messageId: messageId.value.trim() }
        : null,
    replyOffer: offerReplies.value
      ? {
          schemaUri: replySchema.value.trim(),
          mimeType: replyMime.value,
          processMessages: props.session.apiVersion === 'v3' ? offeredProcessMessages.value : [],
        }
      : null,
  };
}
async function saveTestCase() {
  if (disabled.value || !recipient.value || !sendForm.value.reportValidity()) return;
  await act('Testfall lokal speichern', async () => {
    const pack = await packFromDraft(
      currentDraft(),
      dataFile.value || new Blob([dataText.value]),
      attachments.value,
      localValidationSchemas.value,
    );
    downloadLocal(serializeTestPack(pack), 'testfall.fctest.json');
    stepNotice.value =
      'Testfall lokal gespeichert. Er enthält Fachdaten und Anlagen, keine Verbindung und keine bisherige Case ID.';
  });
}
async function importTestCase() {
  if (disabled.value || !pendingTest.value) return;
  const item = structuredClone(pendingTest.value),
    active = { ...props.session },
    destination = target.value.trim().toLowerCase();
  if (item.request.processMessage && active.apiVersion !== 'v3') {
    error.value = 'Dieser Prozesstest benötigt API v3. Bitte die API-Version wechseln und erneut verbinden.';
    return;
  }
  await act('Testfall lokal übernehmen', async () => {
    validateTestPack({ format: 'fbforge-connect-testpack', version: 1, name: item.name, cases: [item] });
    const available = await loadSendDestination(invoke, active, destination);
    if (
      active.sessionId !== props.session?.sessionId ||
      pendingTest.value?.id !== item.id ||
      target.value.trim().toLowerCase() !== destination
    )
      return;
    const request = item.request,
      process = request.processMessage;
    const selected = process
      ? available.processes.findIndex(
          (entry) => entry.processModelId === process.processModelId && entry.messageId === process.messageId,
        )
      : -1;
    const offered = process
      ? available.processes[selected]
      : available.services.find((entry) => entry.identifier === request.serviceIdentifier);
    const choice =
      offered?.schemas.findIndex(
        (entry) => entry.schemaUri === request.schemaUri && entry.mimeType === request.mimeType,
      ) ?? -1;
    const serviceOffer = available.services.find((entry) => entry.identifier === request.serviceIdentifier);
    if (
      choice < 0 ||
      (request.replyOffer &&
        !serviceOffer?.replySchemas.some(
          (entry) =>
            entry.schemaUri === request.replyOffer.schemaUri &&
            entry.mimeType === request.replyOffer.mimeType,
        ))
    )
      throw new Error('test_offer_mismatch');
    const files = testCaseFiles(item);
    recipient.value = available;
    service.value = request.serviceIdentifier;
    addressing.value = process ? 'process' : 'service';
    if (process) processChoice.value = selected;
    await nextTick();
    schemaChoice.value = choice;
    selectSchema();
    serviceName.value = request.serviceName;
    region.value = request.region || '';
    caseId.value = '';
    dataFile.value = null;
    dataText.value = request.data;
    localValidationSchemas.value = item.schemas.map((entry) => ({
      id: crypto.randomUUID(),
      uri: entry.uri,
      file: new File([entry.content], entry.mimeType === 'application/xml' ? 'schema.xsd' : 'schema.json', {
        type: entry.mimeType,
      }),
    }));
    attachments.value = files.map((file) => ({ ...file, id: crypto.randomUUID() }));
    offerReplies.value = Boolean(request.replyOffer);
    if (request.replyOffer) {
      replySchema.value = request.replyOffer.schemaUri;
      replyMime.value = request.replyOffer.mimeType;
      offeredProcessMessages.value = structuredClone(request.replyOffer.processMessages);
    }
    sendStep.value = 0;
    outcome.value = null;
    pendingTest.value = null;
    packDialog.value.close();
    stepNotice.value =
      'Testfall als neuer Entwurf übernommen. Empfängerangebot wurde geprüft, die Case ID wurde geleert. Prüfen Sie die Adressierung und bereiten Sie den Versand anschließend vor.';
  });
  if (!pendingTest.value) {
    await nextTick();
    sendForm.value?.querySelector('[data-send-step="0"] legend')?.focus();
  }
}
async function dismiss() {
  if (!prepared.value || working.value) return;
  await act('Versandvorbereitung verwerfen', async () => {
    await cancelSend(invoke, confirmedSession, prepared.value.attempt.attemptId);
    prepared.value = null;
    dialog.value.close();
  });
  await nextTick();
  if (!disabled.value && props.visible) prepareButton.value?.focus();
}
async function send() {
  if (!prepared.value || working.value) return;
  await act('Einreichung an TEST senden', async () => {
    const result = await executeSend(invoke, confirmedSession, prepared.value.attempt);
    outcome.value = result;
    if (result.submissionId && result.caseId)
      caseWorkspace?.remember(confirmedSession, {
        ...result,
        destinationId: prepared.value.summary.destinationId,
      });
    history.value = [
      {
        ...result,
        api: confirmedSession.apiVersion,
        sessionId: confirmedSession.sessionId,
        destinationId: prepared.value.summary.destinationId,
      },
      ...history.value,
    ].slice(0, 20);
    prepared.value = null;
    dialog.value.close();
    if (resetsSessions(result.error)) emit('fatal');
    if (result.status === 'sent') {
      const warning = await caseStorageNotice(invoke, confirmedSession);
      if (props.session?.sessionId === confirmedSession.sessionId) storageWarning.value = warning;
    }
  });
}
function nextTest() {
  if (
    disabled.value ||
    outcome.value?.status !== 'sent' ||
    confirmedSession?.sessionId !== props.session?.sessionId
  )
    return;
  if (!keepData.value) {
    dataText.value = '';
    dataFile.value = null;
  }
  if (!keepAttachments.value) attachments.value = [];
  draftRevision.value++;
  caseId.value = '';
  prepared.value = null;
  outcome.value = null;
  confirmedSession = null;
  recipient.value = null;
  service.value = '';
  schema.value = '';
  schemaDocument.value = null;
  offerReplies.value = false;
  offeredProcessMessages.value = [];
  modelId.value = '';
  messageId.value = '';
  addressing.value = 'service';
  storageWarning.value = '';
  error.value = '';
  progress.value = '';
  sendStep.value = 0;
  stepNotice.value =
    'Neuer Test vorbereitet. Laden Sie die aktuellen Empfängerleistungen. Es wurde nichts versendet.';
  nextDialog.value.close();
  nextTick(() => recipientButton.value?.focus());
}
async function refreshState() {
  await act('Versandstatus lokal prüfen', async () => {
    outcome.value = await sendState(invoke, confirmedSession);
  });
}
</script>

<template>
  <section class="tool-section" aria-labelledby="send-title">
    <ExampleDraftDialog ref="exampleDialog" :context-key="schemaContext" />
    <h2 id="send-title">Neue Einreichung</h2>
    <p>In drei Schritten zum Testversand. Sie prüfen die Angaben vor dem Senden.</p>
    <div v-if="pendingTest" class="tool-section">
      <h3>Testfall bereit: {{ pendingTest.name }}</h3>
      <p>
        Wählen Sie zuerst eine Empfänger-Destination. Beim Übernehmen werden deren Angebot geprüft und
        Fachdaten, Anlagen und Antwortangebot im Entwurf ersetzt. Die Case ID wird geleert.
      </p>
      <div class="client-actions">
        <button
          type="button"
          class="button secondary"
          :disabled="disabled || !target.trim()"
          @click="packDialog.showModal()"
        >
          Testfall übernehmen
        </button>
        <button type="button" class="button secondary" :disabled="disabled" @click="pendingTest = null">
          Testfall verwerfen
        </button>
      </div>
    </div>
    <div
      v-if="processDraft && processDraft.sessionId === session?.sessionId && session?.apiVersion === 'v3'"
      class="tool-section"
    >
      <p>
        BPMN-Auswahl:
        <strong>{{ processDraft.processModelId }} · {{ processDraft.messageId }}</strong>
      </p>
      <button type="button" class="button secondary" :disabled="disabled" @click="applyProcessDraft">
        Prozessauswahl übernehmen und Empfänger erneut prüfen
      </button>
    </div>
    <form
      v-if="session"
      :key="draftRevision"
      ref="sendForm"
      class="send-form"
      @submit.prevent="prepare"
      @invalid.capture="revealInvalid"
    >
      <div class="send-sections" role="group" aria-label="Versandabschnitte">
        <button
          v-for="(title, index) in sendSections"
          :key="title"
          type="button"
          :aria-pressed="sendStep === index"
          :aria-current="sendStep === index ? 'step' : undefined"
          :disabled="disabled"
          @click="selectStep(index)"
        >
          <span aria-hidden="true">{{ index + 1 }}</span>
          {{ title }}
        </button>
      </div>
      <p v-if="stepNotice" role="alert" class="step-notice">{{ stepNotice }}</p>
      <fieldset v-show="sendStep === 0" data-send-step="0" :disabled="disabled">
        <legend tabindex="-1">Adressierung</legend>
        <div class="client-fields send-address-fields">
          <label for="send-target">
            <span id="send-target-label">Empfänger-Destination</span>
            <input
              id="send-target"
              aria-labelledby="send-target-label"
              type="text"
              v-model="target"
              required
              maxlength="36"
              placeholder="Destination ID"
            />
            <button
              ref="recipientButton"
              class="button secondary"
              type="button"
              :disabled="!target.trim()"
              @click="loadRecipient"
            >
              Leistungen laden
            </button>
          </label>
          <label
            v-if="recipient && (recipient.services.length || addressing !== 'process')"
            for="send-service"
          >
            Verwaltungsleistung
            <select id="send-service" v-model="service" required :disabled="!recipient?.services.length">
              <option value="" disabled>Bitte zuerst Empfängerleistungen laden</option>
              <option
                v-for="item in recipient?.services || []"
                :key="item.identifier"
                :value="item.identifier"
              >
                {{ serviceLabel(item.identifier, item.name).option }}
              </option>
            </select>
            <small v-if="service">
              {{
                serviceLabel(service, selectedService?.name).hasName
                  ? `LeiKa / Leistungskennung: ${serviceLabel(service).code}`
                  : 'Keine Leistungsbezeichnung vom Empfänger hinterlegt. Sie können sie unter „Weitere Adressierungsoptionen“ ergänzen.'
              }}
            </small>
          </label>
          <label v-else-if="recipient" for="send-service">
            Leistung des Vorgangs
            <input
              id="send-service"
              v-model="service"
              :disabled="!recipient"
              type="text"
              required
              maxlength="1024"
              placeholder="Leistungs-URN des Vorgangs"
            />
            <small>Diese Prozess-Destination bietet keine eigenen Verwaltungsleistungen an.</small>
          </label>
          <label v-if="session?.apiVersion === 'v3' && addressing === 'process'" for="send-process">
            Prozessnachricht
            <select id="send-process" v-model="processChoice" :disabled="!recipient?.processes.length">
              <option v-for="(item, index) in recipient?.processes || []" :key="index" :value="index">
                {{ item.messageId }} · {{ item.processModelId }}
              </option>
            </select>
          </label>
          <SenderDestination
            v-if="session?.apiVersion === 'v3'"
            v-model="source"
            :session="session"
            :busy="disabled"
            :visible="visible && sendStep === 0"
            @activity="emit('activity', $event)"
            @fatal="emit('fatal', $event)"
          />
        </div>
        <p v-if="!recipient" class="small-note">
          Geben Sie die Empfänger-Destination ein und laden Sie deren Leistungen.
        </p>
        <details class="address-options" :open="addressing === 'process'">
          <summary>Weitere Adressierungsoptionen</summary>
          <div class="client-fields">
            <label v-if="session?.apiVersion === 'v3'" for="send-address">
              Adressierungsart
              <select id="send-address" v-model="addressing">
                <option value="service">Verwaltungsleistung</option>
                <option value="process">Prozessnachricht</option>
              </select>
            </label>

            <label for="send-case">
              Case ID (optional)
              <input
                id="send-case"
                type="text"
                v-model="caseId"
                maxlength="36"
                placeholder="Leer lassen für einen neuen Vorgang"
              />
            </label>
            <label for="send-service-name">
              Bezeichnung der Leistung
              <input
                id="send-service-name"
                :disabled="!recipient"
                type="text"
                v-model="serviceName"
                required
                maxlength="256"
              />
            </label>
            <label for="send-region">
              Region / ARS
              <input id="send-region" type="text" v-model="region" maxlength="128" />
            </label>
          </div>
        </details>
        <p v-if="session?.apiVersion === 'v2'">
          API v2 bestimmt den Absender über die Zugangsdaten. Prozessadressierung steht mit API v3 zur
          Verfügung.
        </p>
      </fieldset>
      <fieldset v-show="sendStep === 1" data-send-step="1" :disabled="disabled">
        <legend tabindex="-1">Fachdaten</legend>
        <SchemaSourceConsent
          ref="schemaAccess"
          id="send-schema-sources"
          v-model="allowExternalSchemas"
          :disabled="disabled"
          :context-key="schemaContext"
        />

        <div class="client-actions">
          <button
            ref="exampleButton"
            class="button secondary"
            type="button"
            :disabled="!schema"
            @click="createExample"
          >
            Fiktive Beispieldaten erzeugen
          </button>
        </div>
        <p v-if="exampleNotice" class="small-note" role="status">{{ exampleNotice }}</p>
        <DraftDataPreview
          :schema-document="schemaDocument"
          :schema-uri="schema"
          :text="dataText"
          :file="dataFile"
          :mime-type="mime"
          :context-key="schemaContext"
          :disabled="disabled"
          @request-schema="!schemaDocument && loadLabels()"
        >
          <label v-if="!dataFile" for="send-data">
            Inhalt
            <textarea id="send-data" v-model="dataText" rows="8" required spellcheck="false"></textarea>
          </label>
          <p v-else>
            {{ dataFile.name }} · {{ (dataFile.size / 1024).toFixed(1) }} KiB
            <button class="button secondary" type="button" @click="dataFile = null">
              Eingabefeld verwenden
            </button>
          </p>
        </DraftDataPreview>
        <FileDropInput
          id="send-data-file"
          label="Fachdaten aus Datei (optional)"
          accept=".json,.xml,application/json,application/xml,text/xml"
          :disabled="disabled"
          @files="(files) => (dataFile = files[0] || null)"
        >
          Ohne Datei wird der Inhalt aus dem Eingabefeld verwendet.
        </FileDropInput>
        <div class="send-schema-validation">
          <h3>Fachdaten prüfen</h3>
          <p>
            JSON wird gegen das ausgewählte JSON-Schema geprüft, XML gegen die aufgelösten XSDs. Vor dem
            Versand läuft diese Prüfung automatisch.
          </p>
          <button class="button secondary" type="button" :disabled="disabled || !schema" @click="checkData">
            Fachdaten gegen Schema prüfen
          </button>
          <p v-if="dataValidation" class="status-badge ok" role="status">Fachdaten entsprechen dem Schema.</p>
          <p v-else class="small-note">
            Noch kein aktuelles Prüfergebnis. Änderungen an Inhalt, Schema oder Empfänger machen die Prüfung
            erneut erforderlich.
          </p>
        </div>
        <details class="data-schema-options">
          <summary>Schema und technische Optionen</summary>
          <div class="client-fields">
            <label for="send-schema">
              Fachdaten-Schema
              <select v-if="schemaOptions.length > 1" id="send-schema" v-model="schemaChoice">
                <option v-for="(item, index) in schemaOptions" :key="index" :value="index">
                  {{ item.mimeType === 'application/json' ? 'JSON' : 'XML' }} · {{ item.schemaUri }}
                </option>
              </select>
              <output v-else id="send-schema">
                {{
                  schema
                    ? `${mime === 'application/json' ? 'JSON' : 'XML'} · ${schema}`
                    : 'Keine unterstützten Fachdaten-Schemata ausgewählt.'
                }}
              </output>
              <small>Wird aus der gewählten Leistung beziehungsweise Prozessnachricht übernommen.</small>
            </label>
          </div>
          <button class="button secondary" type="button" :disabled="disabled || !schema" @click="loadLabels">
            Schema-Beschriftungen laden
          </button>
          <FileDropInput
            id="send-validation-schemas"
            label="Lokale Prüfschemata hinzufügen"
            accept=".json,.xsd,application/json,application/xml,text/xml"
            multiple
            :disabled="disabled"
            @files="addValidationSchemas"
          />
          <div v-for="item in localValidationSchemas" :key="item.id" class="client-fields">
            <label :for="`send-local-schema-${item.id}`">
              Schema-URI für {{ item.file.name }}
              <input
                :id="`send-local-schema-${item.id}`"
                v-model="item.uri"
                type="text"
                maxlength="4096"
                :disabled="disabled"
              />
            </label>
            <button
              class="button secondary"
              type="button"
              :disabled="disabled"
              @click="localValidationSchemas = localValidationSchemas.filter((entry) => entry.id !== item.id)"
            >
              Prüfschema entfernen
            </button>
          </div>
          <p class="small-note">
            Bei JSON wird die $id übernommen. Die Kennung muss zum gewählten Schema passen. Für XSD-Imports
            können Sie weitere Dateien und deren Schema-URIs hinterlegen. Maximal 2 MiB pro Datei.
          </p>
          <label class="checkbox-label">
            <input v-model="skipSchemaValidation" type="checkbox" :disabled="disabled" />
            Für einen bewussten Negativtest ohne Fachdaten-Schemaprüfung senden
          </label>
          <p v-if="skipSchemaValidation" class="small-note">
            Die Fachdaten werden vor dem Versand nicht gegen das Schema geprüft. Das SDK prüft weiterhin das
            Format und das Empfängerangebot.
          </p>
        </details>
      </fieldset>
      <fieldset v-show="sendStep === 2" data-send-step="2" :disabled="disabled">
        <legend tabindex="-1">Antwortkanal</legend>
        <label class="checkbox-label">
          <input v-model="offerReplies" type="checkbox" :disabled="!replyOptions.length" />
          Antworten über FIT-Connect anbieten
        </label>
        <p v-if="!replyOptions.length" class="small-note">
          Für die gewählte Leistung ist kein unterstütztes Antwortschema hinterlegt.
        </p>
        <div v-if="offerReplies && session?.apiVersion === 'v3'">
          <h4>Angebotene Prozessantworten (optional)</h4>
          <p>
            Nur ausdrücklich angebotene Nachrichten dürfen als Prozess-Reply zurückkommen. Im Prozessbereich
            zuerst die gewünschte Antwort auswählen. Für mehrere Nachrichten nacheinander übernehmen. Dafür
            wird Metadatenversion 3 benötigt.
          </p>
          <button
            class="button secondary"
            type="button"
            :disabled="!processWorkspace?.selection.value || offeredProcessMessages.length >= 16"
            @click="addReplyMessage"
          >
            BPMN-Auswahl als erlaubte Antwort hinzufügen
          </button>
          <ul>
            <li
              v-for="(item, index) in offeredProcessMessages"
              :key="`${item.processModelId}/${item.messageId}`"
            >
              {{ item.processModelId }} · {{ item.messageId }}
              <button
                type="button"
                class="button secondary"
                @click="offeredProcessMessages = offeredProcessMessages.filter((_, i) => i !== index)"
              >
                Antwortnachricht {{ index + 1 }} entfernen
              </button>
            </li>
          </ul>
        </div>
        <div v-if="offerReplies" class="client-fields">
          <label for="send-reply-schema">
            Antwortschema
            <select id="send-reply-schema" v-model="replySchema" required>
              <option v-for="item in replyOptions" :key="item.schemaUri" :value="item.schemaUri">
                {{ item.schemaUri }}
              </option>
            </select>
          </label>
          <label for="send-reply-mime">
            Antwortformat
            <select id="send-reply-mime" v-model="replyMime">
              <option value="application/json">JSON</option>
              <option value="application/xml">XML</option>
            </select>
          </label>
        </div>
        <p v-if="offerReplies" class="small-note">
          Das SDK erzeugt einen eigenen Antwortschlüssel. Bei aktiviertem Profil wird er vor dem Versand
          geschützt gesichert und kann nach einem Neustart wiederhergestellt werden. Ohne Profil gilt er nur
          für diese Sitzung. Die Leistung muss den Antwortkanal unterstützen.
        </p>
      </fieldset>
      <fieldset v-show="sendStep === 2" data-send-step="2" :disabled="disabled">
        <legend>Anlagen</legend>
        <FileDropInput
          id="send-attachments"
          label="Anlagen hinzufügen"
          multiple
          :disabled="disabled"
          @files="addFiles"
        />
        <div v-for="item in attachments" :key="item.id" class="client-fields">
          <div>
            <strong>{{ item.file.name }}</strong>
            <p>{{ (item.file.size / 1024).toFixed(1) }} KiB · {{ item.mimeType }}</p>
          </div>
          <label :for="`description-${item.id}`">
            Beschreibung
            <input :id="`description-${item.id}`" type="text" v-model="item.description" maxlength="1000" />
          </label>
          <button
            class="button secondary"
            type="button"
            @click="attachments = attachments.filter((row) => row.id !== item.id)"
          >
            Anlage entfernen
          </button>
        </div>
        <p v-if="!attachments.length">Keine zusätzlichen Anlagen ausgewählt.</p>
        <p>
          Höchstens 32 MiB je Datei, 64 MiB insgesamt und 39 zusätzliche Anlagen. Die Grenzen der Destination
          werden zusätzlich vom SDK geprüft.
        </p>
      </fieldset>
      <div class="client-actions send-step-actions">
        <button
          v-if="sendStep > 0"
          class="button secondary"
          type="button"
          :disabled="disabled"
          @click="selectStep(sendStep - 1)"
        >
          Zurück
        </button>
        <span>Abschnitt {{ sendStep + 1 }} von {{ sendSections.length }}</span>
        <button
          v-if="sendStep < 2"
          class="button"
          type="button"
          :disabled="disabled"
          @click="selectStep(sendStep + 1)"
        >
          Weiter: {{ sendSections[sendStep + 1] }}
        </button>
        <button v-else ref="prepareButton" class="button" type="submit" :disabled="disabled">
          Versand vorbereiten
        </button>
      </div>
      <details v-if="sendStep === 2" class="data-schema-options">
        <summary>Testfall wiederverwenden</summary>
        <p>
          Speichern Sie den Entwurf mit seinen Anlagen als unverschlüsseltes Testpaket. Nutzen Sie dafür
          fiktive Daten. Verbindung, private Schlüssel und bisherige Nachrichtenkennungen werden nicht
          übernommen.
        </p>
        <button
          class="button secondary"
          type="button"
          :disabled="disabled || !recipient"
          @click="saveTestCase"
        >
          Als Testfall speichern
        </button>
      </details>
    </form>
    <p v-if="progress" role="status">{{ progress }}</p>
    <p v-if="storageWarning" role="status">{{ storageWarning }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <DocumentationLink v-if="error" topic="problems">Hilfe zum Versandproblem</DocumentationLink>
    <div v-if="outcome" role="status">
      <p>
        <span class="status-badge" :class="outcome.status === 'sent' ? 'ok' : 'error'">
          {{
            outcome.status === 'sent'
              ? 'An TEST übergeben'
              : outcome.status === 'uncertain'
                ? 'Versandausgang ungewiss'
                : 'Versand fehlgeschlagen'
          }}
        </span>
      </p>
      <p v-if="outcome.status === 'uncertain'">
        Bitte nicht erneut senden. Prüfen Sie zunächst die Einreichungen und das Event Log. Ein Teil der
        Übertragung kann bereits abgeschlossen sein.
      </p>
      <p v-if="outcome.error">{{ explain(outcome.error) }}</p>
      <details v-if="outcome.diagnostics?.length" :open="outcome.status !== 'sent'">
        <summary>Technische Versanddiagnose</summary>
        <p class="small-note">
          Nur für diese Sitzung. Ohne Zugangsdaten, Schlüssel und Einreichungsinhalte. HTTP – bedeutet: kein
          Status verfügbar oder lokaler Schritt.
        </p>
        <div class="client-table support-table">
          <table class="submission-result-table">
            <thead>
              <tr>
                <th scope="col">Schritt</th>
                <th scope="col">Methode</th>
                <th scope="col">HTTP</th>
                <th scope="col">Ergebnis / Problemtyp</th>
                <th scope="col">Dauer</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, index) in outcome.diagnostics" :key="index">
                <td>{{ diagnosticLabels[entry.step] }}</td>
                <td>{{ entry.method }}</td>
                <td>{{ entry.httpStatus ?? '–' }}</td>
                <td>
                  {{ entry.code === 'ok' ? 'Erfolgreich' : entry.code }}
                  <br v-if="entry.problemType" />
                  <code v-if="entry.problemType">{{ entry.problemType }}</code>
                </td>
                <td>{{ entry.durationMs }} ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <p v-if="outcome.submissionId">
        Submission ID:
        <CopyValue :value="outcome.submissionId" label="Submission ID" />
        <br />
        Case ID:
        <CopyValue :value="outcome.caseId" label="Case ID" />
      </p>
      <button
        v-if="session && confirmedSession?.sessionId === session.sessionId"
        class="button secondary"
        type="button"
        :disabled="busy"
        @click="refreshState"
      >
        Lokalen Versandstatus laden
      </button>
    </div>
    <div v-if="outcome?.status === 'sent'" class="client-actions next-actions">
      <button
        type="button"
        class="button"
        :disabled="disabled"
        @click="
          keepData = true;
          keepAttachments = false;
          nextDialog.showModal();
        "
      >
        Nächsten Test vorbereiten
      </button>
      <button type="button" class="button secondary" :disabled="busy || working" @click="emit('cases')">
        Vorgänge öffnen
      </button>
    </div>
    <details v-if="history.length">
      <summary>Letzte Versandversuche ({{ history.length }})</summary>
      <ul class="send-history-list">
        <li v-for="item in history" :key="item.attemptId">
          <span>
            {{ item.api }} ·
            {{
              { sent: 'An TEST übergeben', failed: 'Fehlgeschlagen', uncertain: 'Ausgang ungewiss' }[
                item.status
              ] || item.status
            }}
            <br />
            <code>{{ item.submissionId || item.destinationId }}</code>
          </span>
          <button
            v-if="item.submissionId && item.caseId"
            class="button secondary"
            type="button"
            :disabled="busy || working"
            @click="
              emit('event-log', {
                apiVersion: item.api,
                sessionId: item.sessionId,
                destinationId: item.destinationId,
                caseId: item.caseId,
                submissionId: item.submissionId,
              })
            "
          >
            Event Log prüfen
          </button>
        </li>
      </ul>
    </details>
    <dialog
      ref="packDialog"
      class="tool-dialog"
      aria-labelledby="import-test-title"
      @cancel.prevent="!working && packDialog.close()"
    >
      <template v-if="pendingTest">
        <h2 id="import-test-title">Testfall als neuen Entwurf übernehmen?</h2>
        <p>{{ pendingTest.name }} · {{ pendingTest.request.attachments.length }} Anlagen</p>
        <p>
          Ihre bisherigen Fachdaten, Anlagen und das Antwortangebot werden ersetzt. Die Empfänger- und
          Absender-Destination bleiben erhalten. Es wird nichts versendet.
        </p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="client-actions">
          <button
            type="button"
            class="button secondary"
            :disabled="working"
            autofocus
            @click="packDialog.close()"
          >
            Abbrechen
          </button>
          <button type="button" class="button" :disabled="disabled" @click="importTestCase">
            Entwurf ersetzen
          </button>
        </div>
      </template>
    </dialog>
    <dialog ref="nextDialog" class="tool-dialog" aria-labelledby="next-test-title">
      <h2 id="next-test-title">Nächsten Test vorbereiten?</h2>
      <p>
        Der bisherige Versand bleibt unter „Vorgänge“ verfügbar. Wählen Sie, welche Inhalte Sie für einen
        neuen Entwurf übernehmen möchten.
      </p>
      <label class="checkbox-label">
        <input v-model="keepData" type="checkbox" />
        Fachdaten übernehmen
      </label>
      <label class="checkbox-label">
        <input v-model="keepAttachments" type="checkbox" />
        Anlagen übernehmen ({{ attachments.length }})
      </label>
      <p>
        Die Case ID wird geleert. Empfängerleistungen und Schema müssen erneut geladen werden. Es wird erst
        nach Ihrer erneuten Bestätigung gesendet.
      </p>
      <div class="client-actions">
        <button type="button" class="button secondary" autofocus @click="nextDialog.close()">
          Abbrechen
        </button>
        <button
          type="button"
          class="button"
          :disabled="disabled || outcome?.status !== 'sent'"
          @click="nextTest"
        >
          Neuen Entwurf beginnen
        </button>
      </div>
    </dialog>
    <dialog
      ref="dialog"
      class="tool-dialog receipt-dialog"
      aria-labelledby="send-confirm-title"
      @cancel.prevent="dismiss"
    >
      <template v-if="prepared">
        <h2 id="send-confirm-title">Einreichung an TEST senden?</h2>
        <dl class="receipt-dialog-context">
          <dt>API</dt>
          <dd>{{ confirmedSession.apiVersion }}</dd>
          <dt>Empfänger</dt>
          <dd>
            <code>{{ prepared.summary.destinationId }}</code>
          </dd>
          <template v-if="prepared.summary.fromDestinationId">
            <dt>Absender</dt>
            <dd>
              <code>{{ prepared.summary.fromDestinationId }}</code>
            </dd>
          </template>
          <dt>Leistung</dt>
          <dd>
            <ServiceLabel
              :name="prepared.summary.serviceName"
              :identifier="prepared.summary.serviceIdentifier"
            />
          </dd>
          <dt>Vorgang</dt>
          <dd>{{ prepared.summary.caseId || 'Neuer Vorgang' }}</dd>
          <dt>Schema</dt>
          <dd>{{ prepared.summary.schemaUri }}</dd>
          <dt>Fachdaten</dt>
          <dd>{{ prepared.summary.mimeType }} · {{ prepared.summary.dataBytes }} Bytes</dd>
          <dt>Fachdatenprüfung</dt>
          <dd>
            {{ confirmedSchemaValidation ? 'Schema erfüllt' : 'Nicht durchgeführt – bewusster Negativtest' }}
          </dd>
          <dt>Antwortangebot</dt>
          <dd>{{ prepared.summary.replyOffer ? 'Angeboten' : 'Nicht angeboten' }}</dd>
          <dt>Anlagen</dt>
          <dd>{{ prepared.summary.attachments.length }}</dd>
        </dl>
        <ul v-if="prepared.summary.replyOffer?.processMessages?.length">
          <li
            v-for="item in prepared.summary.replyOffer.processMessages"
            :key="`${item.processModelId}/${item.messageId}`"
          >
            Erlaubte Prozessantwort: {{ item.processModelId }} · {{ item.messageId }}
          </li>
        </ul>
        <p v-if="prepared.summary.processMessage">
          Prozess: {{ prepared.summary.processMessage.processModelId }} · Nachricht:
          {{ prepared.summary.processMessage.messageId }}
        </p>
        <p v-if="prepared.summary.replyOffer">
          Antwortkanal: {{ prepared.summary.replyOffer.schemaUri }} ·
          {{ prepared.summary.replyOffer.mimeType }}. Mit einem gespeicherten Profil wird der private
          Antwortschlüssel vor dem Versand geschützt gesichert. Ohne gespeichertes Profil gilt er nur für
          diese Sitzung.
        </p>
        <ul v-if="prepared.summary.attachments.length">
          <li v-for="(item, index) in prepared.summary.attachments" :key="index">
            {{ item.fileName }} · {{ item.bytes }} Bytes
            <span v-if="item.description">· {{ item.description }}</span>
          </li>
        </ul>
        <p>
          Die Bestätigung gilt 60 Sekunden. Dieser Schritt überträgt die Einreichung an die
          FIT-Connect-Testumgebung.
        </p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="client-actions">
          <button class="button secondary" type="button" :disabled="working" autofocus @click="dismiss">
            Abbrechen
          </button>
          <button class="button" type="button" :disabled="working" @click="send">
            {{ working ? 'Wird an TEST übertragen …' : 'Jetzt an TEST senden' }}
          </button>
        </div>
      </template>
    </dialog>
  </section>
</template>
