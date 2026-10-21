import { withSchemaSourceAccess } from '../schema-source-access.js';
import { loadSendSchema } from '../sender-options.js';
import { invoke } from '../native.js';
import { nextTick } from 'vue';
import { validateSendData } from '../send-data-validation.js';

// Schema reads and validation are bound to the current draft and connection.
export function useSendSchema({ props, act, draft, view, state, selection }) {
  const {
    schema,
    target,
    service,
    addressing,
    modelId,
    messageId,
    mime,
    dataFile,
    dataText,
    localValidationSchemas,
  } = draft;
  const { schemaAccess, exampleDialog, exampleButton } = view;
  const { actionOpener, dataValidation } = state;
  const { disabled, schemaContext, allowExternalSchemas, schemaDocument, exampleNotice } = selection;
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
        () => schemaAccess.value.request(actionOpener.value),
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
        () => schemaAccess.value.request(actionOpener.value),
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
      () => schemaAccess.value.request(actionOpener.value),
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
  return { loadLabels, createExample, checkDataNow, checkData, addValidationSchemas };
}
