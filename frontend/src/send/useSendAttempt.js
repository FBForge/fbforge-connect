import { prepareSend, executeSend, cancelSend, sendState } from '../sending.js';
import { invoke } from '../native.js';
import { nextTick } from 'vue';
import { resetsSessions } from '../sessions.js';
import { caseStorageNotice } from '../cases.js';

// Prepared attempts remain bound to their confirmed session. Never retry uncertain writes.
export function useSendAttempt({
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
}) {
  const {
    recipient,
    schema,
    addressing,
    dataFile,
    dataText,
    attachments,
    caseId,
    service,
    offerReplies,
    offeredProcessMessages,
    modelId,
    messageId,
  } = draft;
  const {
    dialog,
    prepareButton,
    keepData,
    keepAttachments,
    draftRevision,
    sendStep,
    stepNotice,
    nextDialog,
    recipientButton,
  } = view;
  const {
    confirmedSession,
    skipSchemaValidation,
    dataValidation,
    prepared,
    progress,
    outcome,
    confirmedSchemaValidation,
    working,
    history,
    storageWarning,
    error,
  } = state;
  const { disabled, selectedService, schemaDocument } = selection;
  async function prepare() {
    if (disabled.value) return;
    await act('Versand lokal vorbereiten', async () => {
      if (!recipient.value || !schema.value || (addressing.value !== 'process' && !selectedService.value))
        throw new Error('invalid_submission');
      confirmedSession.value = { ...props.session };
      if (!skipSchemaValidation.value && !dataValidation.value) await checkDataNow();
      const draft = currentDraft();
      prepared.value = await prepareSend(
        invoke,
        confirmedSession.value,
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

  async function dismiss() {
    if (!prepared.value || working.value) return;
    await act('Versandvorbereitung verwerfen', async () => {
      await cancelSend(invoke, confirmedSession.value, prepared.value.attempt.attemptId);
      prepared.value = null;
      dialog.value.close();
    });
    await nextTick();
    if (!disabled.value && props.visible) prepareButton.value?.focus();
  }

  async function send() {
    if (!prepared.value || working.value) return;
    await act('Einreichung an TEST senden', async () => {
      const result = await executeSend(invoke, confirmedSession.value, prepared.value.attempt);
      outcome.value = result;
      if (result.submissionId && result.caseId)
        caseWorkspace?.remember(confirmedSession.value, {
          ...result,
          destinationId: prepared.value.summary.destinationId,
        });
      history.value = [
        {
          ...result,
          api: confirmedSession.value.apiVersion,
          sessionId: confirmedSession.value.sessionId,
          destinationId: prepared.value.summary.destinationId,
        },
        ...history.value,
      ].slice(0, 20);
      prepared.value = null;
      dialog.value.close();
      if (resetsSessions(result.error)) emit('fatal');
      if (result.status === 'sent') {
        const warning = await caseStorageNotice(invoke, confirmedSession.value);
        if (props.session?.sessionId === confirmedSession.value.sessionId) storageWarning.value = warning;
      }
    });
  }

  function nextTest() {
    if (
      disabled.value ||
      outcome.value?.status !== 'sent' ||
      confirmedSession.value?.sessionId !== props.session?.sessionId
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
    confirmedSession.value = null;
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
      outcome.value = await sendState(invoke, confirmedSession.value);
    });
  }
  return { prepare, dismiss, send, nextTest, refreshState };
}
