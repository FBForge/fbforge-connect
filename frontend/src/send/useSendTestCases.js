import { packFromDraft, serializeTestPack, testCaseFiles, validateTestPack } from '../test-packs.js';
import { downloadLocal } from '../local-download.js';
import { loadSendDestination } from '../sender-options.js';
import { invoke } from '../native.js';
import { nextTick } from 'vue';

// Import validates the current recipient offer before replacing any draft fields.
export function useSendTestCases({ act, currentDraft, props, selectSchema, draft, view, state, selection }) {
  const {
    recipient,
    dataFile,
    dataText,
    attachments,
    localValidationSchemas,
    target,
    service,
    addressing,
    processChoice,
    schemaChoice,
    serviceName,
    region,
    caseId,
    offerReplies,
    replySchema,
    replyMime,
    offeredProcessMessages,
  } = draft;
  const { sendForm, stepNotice, pendingTest, sendStep, packDialog } = view;
  const { error, outcome } = state;
  const { disabled } = selection;
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
      error.value =
        'Dieser Prozesstest benötigt API v3. Bitte die API-Version wechseln und erneut verbinden.';
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
            (entry) =>
              entry.processModelId === process.processModelId && entry.messageId === process.messageId,
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
  return { saveTestCase, importTestCase };
}
