import { inject, ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from '../native.js';
import { caseStorageNotice } from '../cases.js';
import { processWorkspaceKey } from '../process-context.js';
import { caseWorkspaceKey } from '../case-context.js';
import { useSchemaSourceAccess, withSchemaSourceAccess } from '../schema-source-access.js';
import {
  loadReplyTarget,
  loadReplySchema,
  prepareReply,
  executeReply,
  cancelReply,
  replyState,
} from '../reply-sending.js';
import { diagnosticCode } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';
import { explain, messages } from './messages.js';

// Owns reply sender state and its session-bound lifecycle.
export function useReplySender(props, emit) {
  const storageWarning = ref('');
  const processWorkspace = inject(processWorkspaceKey, null);
  const caseWorkspace = inject(caseWorkspaceKey, null);
  const expanded = ref(false);
  const allowExternalSchemas = useSchemaSourceAccess(() => props.session);
  const schemaAccess = ref(null);
  const processChoice = ref(0);
  const target = ref(null),
    choice = ref(0),
    mime = ref('application/json'),
    process = ref(false),
    model = ref(''),
    message = ref('');
  const text = ref('{\n  "status": "erhalten"\n}'),
    file = shallowRef(null),
    attachments = ref([]);
  const prepared = ref(null),
    outcome = ref(null),
    outcomeOwner = ref(''),
    working = ref(false),
    error = ref('');
  const diagnostic = ref(''),
    errorNotice = ref(null);
  const cleanupOwner = ref('');
  const schemaPackage = shallowRef(null),
    schemaFile = shallowRef(null),
    schemaNotice = ref('');
  const exampleDialog = ref(null),
    exampleButton = ref(null);
  const owner = shallowRef(null),
    dialog = ref(null),
    prepareButton = ref(null),
    resultHeading = ref(null),
    schemaOptions = ref(null);
  const context = computed(
    () => `${props.session?.apiVersion}/${props.session?.sessionId}/${props.proof?.proofId}`,
  );
  watch([processChoice, () => target.value?.processMessages], () => {
    const selected = target.value?.processMessages?.[processChoice.value];
    model.value = selected?.processModelId || '';
    message.value = selected?.messageId || '';
    if (!selected) process.value = false;
  });
  function useBpmnSelection() {
    diagnostic.value = '';
    const selection = processWorkspace?.selection.value;
    const index =
      target.value?.processMessages?.findIndex(
        (row) => row.processModelId === selection?.processModelId && row.messageId === selection?.messageId,
      ) ?? -1;
    if (index < 0) {
      error.value =
        'Diese BPMN-Nachricht wird im geprüften FIT-Connect-Rückkanal nicht als Prozessantwort angeboten.';
      return;
    }
    if (selection.schemaUri) {
      const schemaIndex = target.value.schemas.findIndex(
        (row) =>
          row.schemaUri === selection.schemaUri &&
          (row.mimeType === null || row.mimeType === selection.mimeType),
      );
      if (schemaIndex < 0) {
        error.value = 'Das BPMN-Antwortschema wird im geprüften Rückkanal nicht angeboten.';
        return;
      }
      choice.value = schemaIndex;
      mime.value = selection.mimeType;
    }
    processChoice.value = index;
    process.value = true;
    model.value = selection.processModelId;
    message.value = selection.messageId;
  }
  const selected = computed(() => target.value?.schemas[choice.value]);
  const format = computed(() => selected.value?.mimeType || mime.value);
  const schemaContext = computed(() =>
    JSON.stringify([context.value, selected.value?.schemaUri, format.value]),
  );
  watch(
    schemaContext,
    () => {
      schemaPackage.value = null;
      schemaFile.value = null;
      schemaNotice.value = '';
    },
    { flush: 'sync' },
  );
  const locked = computed(
    () =>
      cleanupOwner.value === props.session?.sessionId ||
      (outcomeOwner.value === props.session?.sessionId &&
        (outcome.value?.status === 'uncertain' || outcome.value?.error === 'content_cleanup_failed')),
  );
  const disabled = computed(
    () =>
      props.busy ||
      working.value ||
      !props.session ||
      !props.proof ||
      locked.value ||
      Boolean(prepared.value),
  );
  let revision = 0,
    alive = true;
  async function cancelKnown(value, active) {
    if (!value || !active) return;
    try {
      await cancelReply(invoke, active, value.attempt.attemptId);
    } catch (cause) {
      if (alive && resetsSessions(cause)) emit('fatal', cause);
    }
  }
  function reset() {
    expanded.value = false;
    schemaPackage.value = null;
    schemaFile.value = null;
    schemaNotice.value = '';
    revision++;
    const previous = prepared.value,
      active = owner.value;
    prepared.value = null;
    dialog.value?.close();
    target.value = null;
    choice.value = 0;
    error.value = '';
    diagnostic.value = '';
    file.value = null;
    attachments.value = [];
    text.value = '{\n  "status": "erhalten"\n}';
    process.value = false;
    model.value = '';
    message.value = '';
    if (outcome.value?.status !== 'uncertain' && outcome.value?.error !== 'content_cleanup_failed') {
      outcome.value = null;
      storageWarning.value = '';
      outcomeOwner.value = '';
    }
    if (!working.value) void cancelKnown(previous, active);
  }
  watch(context, reset, { flush: 'sync' });
  onBeforeUnmount(() => {
    alive = false;
    reset();
  });
  let actionOpener;
  async function run(action, operation) {
    if (working.value || props.busy || !props.session) return;
    const active = { ...props.session },
      stamp = revision,
      started = performance.now();
    const current = () => alive && stamp === revision;
    actionOpener = document.activeElement;
    working.value = true;
    emit('busy', true);
    error.value = '';
    diagnostic.value = '';
    let status = 'Erfolgreich';
    try {
      status = (await operation(active, current)) || status;
      if (!current()) status = 'Abgebrochen';
    } catch (cause) {
      const cancelled = (typeof cause === 'string' ? cause : cause?.message) === 'content_cancelled';
      status = cancelled ? 'Abgebrochen' : 'Fehlgeschlagen';
      if (current() && !cancelled) {
        error.value = explain(cause);
        diagnostic.value = diagnosticCode(cause);
        if ((typeof cause === 'string' ? cause : cause?.message) === 'content_cleanup_failed') {
          cleanupOwner.value = active.sessionId;
          emit('invalidate');
        }
      }
      if (resetsSessions(cause)) emit('fatal', cause);
    } finally {
      working.value = false;
      emit('busy', false);
      emit('activity', {
        api: active.apiVersion,
        role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
        action,
        status,
        started,
      });
    }
  }
  async function load() {
    if (disabled.value) return;
    const proof = { ...props.proof };
    await run('Geprüften Antwortkanal laden', async (active, current) => {
      target.value = null;
      const state = await replyState(invoke, active);
      if (!current()) return;
      if (state.status === 'uncertain' || state.error === 'content_cleanup_failed') {
        outcome.value = state;
        outcomeOwner.value = active.sessionId;
        return 'Ausgang ungewiss';
      }
      if (state.status === 'prepared') await cancelReply(invoke, active, state.attemptId);
      const result = await loadReplyTarget(invoke, active, proof);
      if (current()) {
        target.value = result;
        choice.value = 0;
      }
    });
    if (error.value) {
      await nextTick();
      errorNotice.value?.focus();
    }
  }
  async function loadSchema(example = false) {
    if (disabled.value || !selected.value) return;
    const external = !schemaFile.value;
    schemaPackage.value = null;
    schemaNotice.value = '';
    const proof = { ...props.proof },
      key = schemaContext.value,
      local = schemaFile.value;
    const selection = {
      schemaUri: selected.value.schemaUri,
      mimeType: format.value,
    };
    await run('Antwortschema laden', async (active, current) => {
      const loaded = await withSchemaSourceAccess(
        () =>
          loadReplySchema(
            invoke,
            active,
            proof,
            {
              ...selection,
              allowExternalSchemas: external && allowExternalSchemas.value,
            },
            local,
          ),
        () => schemaAccess.value.request(actionOpener),
        () => current() && schemaContext.value === key,
      );
      if (!current() || schemaContext.value !== key) return 'Abgebrochen';
      schemaPackage.value = loaded;
      schemaNotice.value = 'Schema geladen. Der Antwortinhalt wird beim Vorbereiten im nativen Kern geprüft.';
      if (example) {
        const draft = await exampleDialog.value
          .choose({
            source: loaded.document,
            mimeType: selection.mimeType,
            uri: selection.schemaUri,
            replacing: Boolean(file.value || text.value.trim()),
          })
          .catch((cause) => {
            if (current() && schemaContext.value === key && cause?.message === 'schema_unavailable') {
              schemaPackage.value = null;
              schemaNotice.value = '';
            }
            throw cause;
          });
        if (draft === null || !current() || schemaContext.value !== key) return 'Abgebrochen';
        file.value = null;
        text.value = draft;
        schemaNotice.value =
          'Fiktiver Antwortentwurf erzeugt. Vor dem Versand werden die exakten Daten gegen das Antwortschema geprüft.';
      }
    });
    if (example) {
      await nextTick();
      if (schemaContext.value === key) exampleButton.value?.focus();
    } else if (error.value) {
      await nextTick();
      if (schemaContext.value === key) errorNotice.value?.focus();
    }
  }
  function chooseSchemaFile(files) {
    if (disabled.value) return;
    schemaPackage.value = null;
    schemaNotice.value = '';
    schemaFile.value = files[0] || null;
    if (diagnostic.value === 'schema_id_mismatch') {
      diagnostic.value = '';
      error.value = '';
    }
  }
  function changeSchemaFile() {
    if (disabled.value) return;
    schemaOptions.value?.setAttribute('open', '');
    const picker = document.getElementById('reply-schema-file');
    picker?.focus();
    picker?.click();
  }
  function addFiles(files) {
    if (disabled.value) return;
    for (const item of files)
      attachments.value.push({
        id: crypto.randomUUID(),
        file: item,
        mimeType: item.type || 'application/octet-stream',
        description: '',
      });
  }
  const hasDraft = computed(
    () =>
      !locked.value &&
      !outcome.value &&
      (Boolean(file.value) || attachments.value.length > 0 || text.value !== '{\n  "status": "erhalten"\n}'),
  );
  async function begin() {
    if (disabled.value) return;
    expanded.value = true;
    const key = context.value;
    if (!target.value) await load();
    await nextTick();
    if (context.value === key)
      document.getElementById(file.value ? 'reply-data-file' : 'reply-data')?.focus();
  }
  async function prepare() {
    if (disabled.value || !selected.value) return;
    const key = schemaContext.value,
      proof = { ...props.proof },
      schema = { ...selected.value },
      mimeType = format.value,
      local = schemaFile.value,
      payload = file.value || new Blob([text.value]),
      files = attachments.value.map((item) => ({ ...item })),
      processMessage =
        props.session.apiVersion === 'v3' && process.value
          ? { processModelId: model.value.trim(), messageId: message.value.trim() }
          : null;
    await run('Antwort lokal vorbereiten', async (active, current) => {
      let packet = schemaPackage.value;
      if (!packet) {
        packet = await withSchemaSourceAccess(
          () =>
            loadReplySchema(
              invoke,
              active,
              proof,
              {
                schemaUri: schema.schemaUri,
                mimeType,
                allowExternalSchemas: !local && allowExternalSchemas.value,
              },
              local,
            ),
          () => schemaAccess.value.request(actionOpener),
          () => current() && schemaContext.value === key,
        );
        if (!current() || schemaContext.value !== key) return 'Abgebrochen';
        schemaPackage.value = packet;
      }
      if (!current() || schemaContext.value !== key) return 'Abgebrochen';
      const draft = {
        proofId: proof.proofId,
        schemaId: packet.schemaId,
        schemaUri: schema.schemaUri,
        mimeType,
        processMessage,
      };
      const result = await prepareReply(invoke, active, proof, draft, payload, files);
      if (!current() || schemaContext.value !== key) {
        await cancelKnown(result, active);
        return 'Abgebrochen';
      }
      prepared.value = result;
      owner.value = active;
      outcome.value = null;
    });
    await nextTick();
    if (alive && prepared.value) dialog.value?.showModal();
    else if (error.value && !schemaPackage.value) {
      schemaOptions.value?.setAttribute('open', '');
      if (diagnostic.value === 'schema_id_mismatch') errorNotice.value?.focus();
      else document.getElementById('reply-schema-sources')?.focus();
    }
  }
  async function dismiss() {
    if (!prepared.value || working.value) return;
    const value = prepared.value;
    await run('Antwortvorbereitung verwerfen', async () => {
      await cancelReply(invoke, owner.value, value.attempt.attemptId);
      prepared.value = null;
      dialog.value?.close();
    });
    await nextTick();
    if (!prepareButton.value?.disabled) prepareButton.value?.focus();
  }
  function openEventLog() {
    if (!outcome.value?.replyId || outcomeOwner.value !== props.session?.sessionId) return;
    emit('event-log', {
      apiVersion: props.session.apiVersion,
      sessionId: props.session.sessionId,
      caseId: outcome.value.caseId,
      replyId: outcome.value.replyId,
    });
  }
  async function send() {
    if (!prepared.value || working.value || props.busy) return;
    const value = prepared.value,
      active = owner.value;
    await run('Antwort an FIT-Connect senden', async (_, current) => {
      const result = await executeReply(invoke, active, value.attempt);
      if (result.replyId && result.caseId) caseWorkspace?.remember(active, result);
      prepared.value = null;
      dialog.value?.close();
      if (current()) {
        outcome.value = result;
        outcomeOwner.value = active.sessionId;
        await nextTick();
        resultHeading.value?.focus();
      }
      if (result.error === 'content_cleanup_failed') {
        cleanupOwner.value = active.sessionId;
        emit('invalidate');
      }
      if (resetsSessions(result.error)) emit('fatal', result.error);
      if (result.status === 'sent') {
        const warning = await caseStorageNotice(invoke, active);
        if (current()) storageWarning.value = warning;
      }
      return result.status === 'sent' && !result.error
        ? 'Erfolgreich'
        : result.status === 'uncertain'
          ? 'Ausgang ungewiss'
          : 'Fehlgeschlagen';
    });
  }
  return {
    storageWarning,
    processWorkspace,
    expanded,
    allowExternalSchemas,
    schemaAccess,
    processChoice,
    target,
    choice,
    mime,
    process,
    model,
    message,
    text,
    file,
    attachments,
    prepared,
    outcome,
    outcomeOwner,
    working,
    error,
    diagnostic,
    errorNotice,
    cleanupOwner,
    schemaPackage,
    schemaFile,
    schemaNotice,
    exampleDialog,
    exampleButton,
    owner,
    dialog,
    prepareButton,
    resultHeading,
    schemaOptions,
    context,
    useBpmnSelection,
    selected,
    format,
    schemaContext,
    disabled,
    messages,
    explain,
    reset,
    load,
    loadSchema,
    chooseSchemaFile,
    changeSchemaFile,
    addFiles,
    hasDraft,
    begin,
    prepare,
    dismiss,
    openEventLog,
    send,
  };
}
