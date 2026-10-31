import { saveLocalFile, localSave } from '../local-download.js';
import { label } from './presentation.ts';
import { inject, ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { processWorkspaceKey } from '../process-context.js';
import { invoke } from '../native.js';
import {
  verifySubmission,
  verifyReply,
  listReceivedContents,
  readReceivedFile,
  discardReceived,
} from '../receiving.js';
import { uploadContent, discardContent } from '../content.js';
import { createPreview, disposePreview } from '../submission-preview.js';
import { errorMessage, diagnosticCode } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';
import { useSchemaSourceAccess, withSchemaSourceAccess } from '../schema-source-access.js';
import { readReceivedSchema } from '../received-schema.js';
import { STRUCTURED_BYTES, structuredFormat } from '../structured-data.js';
import { receiveMessages, receiveErrorTitle } from './messages.js';

// Owns receive panel state and its session-bound lifecycle.
export function useReceivePanel(props, emit) {
  const messages = receiveMessages(props.reply);
  const processWorkspace = inject(processWorkspaceKey, null);
  const replySender = ref(null),
    receiptPanel = ref(null),
    discardReplyDialog = ref(null);
  const preparation = ref(null),
    replySection = ref(null),
    receiptSection = ref(null);
  const allowExternalSchemas = useSchemaSourceAccess(() => props.session);
  const schemaAccess = ref(null);
  const diagnostic = ref('');
  const errorNotice = ref(null);
  const schemaSettings = ref(null);
  const applicationSchema = ref(null);
  const application = ref(null),
    applicationNotice = ref(''),
    applicationHeading = ref(null);
  const attachments = computed(() => parts.value.filter((part) => part.kind === 'attachment'));
  const schemaChecked = computed(
    () =>
      Boolean(proof.value) &&
      ['application/json', 'application/xml'].includes(
        parts.value.find((part) => part.kind === 'data')?.mimeType,
      ) &&
      !proof.value.warnings.some((stage) =>
        ['XML_SCHEMA_NOT_CHECKED', 'DATA_SCHEMA_INVALID'].includes(stage),
      ),
  );
  const proof = ref(null),
    parts = ref([]),
    schemas = ref([]),
    preview = ref(null),
    error = ref('');
  const pending = ref(false),
    action = ref('');
  const receiptOutcome = ref(null);
  const receiptUncertain = computed(
    () =>
      receiptOutcome.value?.status === 'uncertain' &&
      receiptOutcome.value.sessionId === props.session?.sessionId &&
      receiptOutcome.value.apiVersion === props.session?.apiVersion,
  );
  const completed = computed(
    () =>
      !props.reply &&
      receiptOutcome.value?.status === 'confirmed' &&
      receiptOutcome.value.sessionId === props.session?.sessionId &&
      receiptOutcome.value.submissionId === props.detail?.submissionId,
  );
  const controller = shallowRef(null);
  const disabled = computed(() => props.busy || pending.value || !props.session || !props.detail);
  const context = computed(
    () => `${props.session?.apiVersion || ''}/${props.session?.sessionId || ''}/${props.destinationId || ''}`,
  );
  const panelId = computed(() => (props.reply ? 'reply-receive' : 'receive'));
  const subject = computed(() => (props.reply ? 'Antwort' : 'Einreichung'));
  const errorTitle = computed(() => receiveErrorTitle(diagnostic.value));
  watch(error, async (message) => {
    if (!message) return;
    await nextTick();
    errorNotice.value?.focus();
  });
  async function showSchemaSettings(local) {
    preparation.value.open = true;
    if (!local) {
      if (await schemaAccess.value.request()) verify();
      return;
    }
    if (local) schemaSettings.value.open = true;
    await nextTick();
    const target = document.getElementById(`${panelId.value}-${local ? 'schema-file' : 'schema-sources'}`);
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }
  let generation = 0,
    proofSession,
    alive = true;
  function showError(cause) {
    diagnostic.value = diagnosticCode(cause);
    const message = Object.hasOwn(messages, diagnostic.value)
      ? messages[diagnostic.value]
      : errorMessage(cause);
    error.value = message.replaceAll('Einreichung', subject.value);
  }
  function closePreview() {
    disposePreview(preview.value);
    preview.value = null;
  }
  async function release(operation) {
    try {
      await operation();
    } catch (cause) {
      const code = typeof cause === 'string' ? cause : cause?.message;
      if (!['session_missing', 'invalid_resource', 'resource_missing'].includes(code) && alive)
        error.value = messages.content_cleanup_failed;
      if (resetsSessions(cause) && alive) emit('fatal', cause);
    }
  }
  function resetProof() {
    generation++;
    controller.value?.abort();
    closePreview();
    const previous = proof.value,
      owner = proofSession,
      reply = props.reply;
    proof.value = null;
    proofSession = null;
    parts.value = [];
    application.value = null;
    applicationSchema.value = null;
    applicationNotice.value = '';
    emit('verified', false);
    return previous && owner
      ? release(() => discardReceived(invoke, owner, previous.proofId, reply))
      : Promise.resolve();
  }
  async function resetAll() {
    const files = schemas.value;
    schemas.value = [];
    await resetProof();
    for (const file of files) await release(() => discardContent(invoke, file.owner, file.contentId));
  }
  watch(
    context,
    () => {
      error.value = '';
      diagnostic.value = '';
      void resetAll();
    },
    { flush: 'sync' },
  );
  watch(
    [() => props.detail, () => props.keyRevision, () => props.receiveRevision],
    () => {
      error.value = '';
      diagnostic.value = '';
      void resetProof();
    },
    { flush: 'sync' },
  );
  watch(
    () => props.autoOpen,
    async (value) => {
      if (value && props.detail) {
        await nextTick();
        verify();
      }
    },
  );
  onBeforeUnmount(() => {
    alive = false;
    void resetAll();
  });
  let actionOpener;
  async function run(name, operation) {
    if (disabled.value) return;
    const active = { ...props.session },
      stamp = generation,
      started = performance.now();
    const current = () => alive && stamp === generation;
    actionOpener = document.activeElement;
    pending.value = true;
    action.value = name;
    error.value = '';
    diagnostic.value = '';
    emit('busy', true);
    let status = 'Erfolgreich';
    try {
      const result = await operation(active, current);
      if (['Fehlgeschlagen', 'Abgebrochen'].includes(result)) status = result;
      if (!current()) status = 'Abgebrochen';
    } catch (cause) {
      const code = typeof cause === 'string' ? cause : cause?.message;
      status = code === 'content_cancelled' ? 'Abgebrochen' : 'Fehlgeschlagen';
      if (current() && code !== 'content_cancelled') {
        showError(cause);
      }
      if (resetsSessions(cause)) emit('fatal', cause);
    } finally {
      controller.value = null;
      pending.value = false;
      action.value = '';
      emit('busy', false);
      emit('activity', {
        api: active.apiVersion,
        role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
        action: name,
        status,
        started,
      });
    }
  }
  function verify() {
    if (disabled.value) return;
    const cleanup = resetProof(),
      detail = props.detail,
      reply = props.reply;
    emit('receive-start');
    run('Inhalte entschlüsseln und prüfen', async (active, current) => {
      await cleanup;
      const catalog = schemas.value.map(({ uri, contentId }) => ({ uri, contentId }));
      const result = await withSchemaSourceAccess(
        () =>
          reply
            ? verifyReply(invoke, active, detail.caseId, detail.replyId, catalog, allowExternalSchemas.value)
            : verifySubmission(
                invoke,
                active,
                detail.destinationId,
                detail.submissionId,
                catalog,
                allowExternalSchemas.value,
              ),
        () => schemaAccess.value.request(actionOpener),
        current,
      );
      try {
        const rows = [];
        for (let offset = 0; offset < result.partCount && current(); offset += 2)
          rows.push(...(await listReceivedContents(invoke, active, result, offset, reply)).parts);
        if (!current()) {
          await release(() => discardReceived(invoke, active, result.proofId, reply));
          return;
        }
        if (
          rows.length !== result.partCount ||
          new Set(rows.map((part) => part.contentId)).size !== rows.length ||
          new Set(rows.filter((part) => part.attachmentId).map((part) => part.attachmentId)).size !==
            rows.length - 2 ||
          rows.reduce((total, part) => total + part.totalBytes, 0) > 64 * 1024 * 1024
        )
          throw new Error('engine_protocol_error');
        let display = null,
          notice = '';
        const data = rows.find((part) => part.kind === 'data');
        const format =
          data && structuredFormat({ filename: data.fileName || '', mimeType: data.mimeType || '' });
        if (!format)
          notice =
            'Für dieses Fachdatenformat steht keine Formularansicht zur Verfügung. Die technischen Inhalte und Downloads bleiben verfügbar.';
        else if (data.totalBytes > STRUCTURED_BYTES)
          notice =
            'Die Fachdaten überschreiten die Formulargrenze von 256 KiB. Über die technischen Inhalte können Sie den Quelltext ansehen oder das Original herunterladen.';
        else {
          controller.value = new AbortController();
          let bytes;
          try {
            bytes = await readReceivedFile(invoke, active, result.proofId, data, {
              signal: controller.value.signal,
              reply,
            });
            try {
              display = { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), format };
            } catch {
              notice = 'Die Fachdaten sind kein gültiger UTF-8-Text. Der Originaldownload bleibt verfügbar.';
            }
          } finally {
            bytes?.fill(0);
          }
        }
        if (!current()) {
          await release(() => discardReceived(invoke, active, result.proofId, reply));
          return;
        }
        let schemaView = null;
        if (display) {
          controller.value ||= new AbortController();
          schemaView = await readReceivedSchema(invoke, active, result.proofId, {
            reply,
            signal: controller.value.signal,
          });
        }
        if (!current()) {
          await release(() => discardReceived(invoke, active, result.proofId, reply));
          return;
        }
        proofSession = active;
        proof.value = result;
        parts.value = rows;
        applicationSchema.value = schemaView;
        application.value = display;
        applicationNotice.value = notice;
        emit('verified', true);
        await nextTick();
        if (current()) {
          applicationHeading.value?.focus({ preventScroll: true });
          applicationHeading.value?.scrollIntoView({ block: 'start' });
        }
      } catch (cause) {
        await release(() => discardReceived(invoke, active, result.proofId, reply));
        throw cause;
      }
    });
  }
  function chooseSchema(files) {
    const file = files[0];
    if (!file || disabled.value) return;
    const cleanup = resetProof();
    run('Fachdaten-Schema laden', async (active, current) => {
      await cleanup;
      if (file.size > 2 * 1024 * 1024 || schemas.value.length >= 32) throw new Error('invalid_input');
      if (schemas.value.reduce((total, item) => total + item.bytes, file.size) > 16 * 1024 * 1024)
        throw new Error('content_limit');
      let uri = '';
      try {
        uri = JSON.parse(await file.text()).$id;
      } catch {
        throw new Error('invalid_input');
      }
      try {
        if (
          typeof uri !== 'string' ||
          uri.length > 4096 ||
          !new URL(uri).protocol ||
          schemas.value.some((item) => item.uri === uri)
        )
          throw new Error();
      } catch {
        throw new Error('invalid_input');
      }
      if (!current()) return;
      controller.value = new AbortController();
      const staged = await uploadContent(invoke, active, file, { signal: controller.value.signal });
      if (!current()) {
        await release(() => discardContent(invoke, active, staged.contentId));
        return;
      }
      schemas.value = [
        ...schemas.value,
        { uri, contentId: staged.contentId, filename: file.name, bytes: file.size, owner: active },
      ];
    });
  }
  function removeSchema(file) {
    if (disabled.value) return;
    const cleanup = resetProof();
    run('Fachdaten-Schema entfernen', async (active, current) => {
      await cleanup;
      await discardContent(invoke, file.owner, file.contentId);
      if (current()) schemas.value = schemas.value.filter((item) => item.contentId !== file.contentId);
    });
  }
  function inspect(part, download = false) {
    if (disabled.value || !proof.value) return;
    closePreview();
    const currentProof = proof.value;
    run(
      download ? 'Entschlüsselten Inhalt herunterladen' : 'Lokale Vorschau öffnen',
      async (active, current) => {
        controller.value = new AbortController();
        let bytes;
        try {
          if (!download && part.totalBytes > 8 * 1024 * 1024) {
            preview.value = {
              kind: 'unavailable',
              filename: label(part),
              notice: 'Diese Datei ist für die Vorschau zu groß. Der Download bleibt verfügbar.',
            };
            return;
          }
          bytes = await readReceivedFile(invoke, active, currentProof.proofId, part, {
            signal: controller.value.signal,
            reply: props.reply,
          });
          if (!current()) return;
          if (download) {
            const saved = await saveLocalFile(
              bytes,
              part.fileName || `${label(part)}.bin`,
              part.mimeType || 'application/octet-stream',
            );
            return saved ? 'Erfolgreich' : localSave.value.error ? 'Fehlgeschlagen' : 'Abgebrochen';
          } else {
            const value = await createPreview(bytes, {
              filename: part.fileName || label(part),
              mimeType: part.mimeType || '',
            });
            if (!current() || controller.value.signal.aborted) {
              disposePreview(value);
              return;
            }
            preview.value = {
              ...value,
              isApplication: part.kind === 'data',
              json:
                value.kind === 'text' &&
                (/\.json$/i.test(part.fileName || '') || /json(?:;|$)/i.test(part.mimeType || '')),
            };
          }
        } catch (cause) {
          const code = typeof cause === 'string' ? cause : cause?.message;
          if (current() && code !== 'content_cancelled') {
            showError(cause);
            void resetProof();
          }
          throw cause;
        } finally {
          bytes?.fill(0);
        }
      },
    );
  }
  async function confirmLeave() {
    if (props.busy || pending.value) return false;
    if (!replySender.value?.hasDraft) return true;
    const discard = await discardReplyDialog.value.ask();
    if (discard) replySender.value?.discardDraft();
    return discard;
  }
  async function beginReply() {
    await replySender.value?.begin();
    await nextTick();
    replySection.value?.scrollIntoView({ block: 'start' });
  }
  async function beginReceipt(action) {
    if (receiptUncertain.value || !(await confirmLeave())) return;
    await receiptPanel.value?.begin(action);
    await nextTick();
    if (!document.querySelector('dialog[open]')) receiptSection.value?.scrollIntoView({ block: 'start' });
  }
  return {
    processWorkspace,
    replySender,
    receiptPanel,
    discardReplyDialog,
    preparation,
    replySection,
    receiptSection,
    allowExternalSchemas,
    schemaAccess,
    diagnostic,
    errorNotice,
    schemaSettings,
    applicationSchema,
    application,
    applicationNotice,
    applicationHeading,
    attachments,
    schemaChecked,
    proof,
    parts,
    schemas,
    preview,
    error,
    pending,
    action,
    receiptOutcome,
    receiptUncertain,
    completed,
    controller,
    disabled,
    context,
    panelId,
    errorTitle,
    showSchemaSettings,
    closePreview,
    resetProof,
    verify,
    chooseSchema,
    removeSchema,
    inspect,
    confirmLeave,
    beginReply,
    beginReceipt,
  };
}
