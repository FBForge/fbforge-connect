import { cancelledProductionAction } from '../environments.js';
import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from '../native.js';
import { errorMessage } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';
import {
  generateTestKeys,
  listGeneratedKeys,
  prepareDestinationCreation,
  executeDestinationCreation,
  cancelDestinationCreation,
  destinationCreationState,
  reconcileDestinationCreation,
  useGeneratedKeys,
} from '../destination-setup.js';

// Owns destination setup state and its session-bound lifecycle.
export function useDestinationSetup(props, emit) {
  const wizardStep = ref(0),
    form = ref(null),
    stepNotice = ref('');
  const steps = computed(() => (kind.value === 'C' ? [0, 2] : [0, 1, 2]));
  const stepTitles = ['Testanwendung', 'Fachdaten', 'Schlüssel und Vorschau'];
  let invalidTarget;
  const name = ref(''),
    legalName = ref(''),
    email = ref(''),
    address = ref(''),
    phone = ref(''),
    kind = ref('A');
  const addressing = ref('service'),
    service = ref('99008001014002'),
    regions = ref('DE');
  const model = ref(''),
    message = ref(''),
    schema = ref(''),
    mime = ref('application/json');
  const replySchema = ref(''),
    compatible = ref(true);
  const bundles = shallowRef([]),
    selectedBundle = ref(''),
    unresolvedBundle = ref(''),
    knownDestination = ref('');
  const prepared = shallowRef(null),
    owner = shallowRef(null),
    outcome = shallowRef(null);
  const working = ref(false),
    error = ref(''),
    notice = ref(''),
    dialog = ref(null),
    prepareButton = ref(null),
    resultHeading = ref(null);
  const context = computed(() => `${props.session?.apiVersion}/${props.session?.sessionId}`);
  const locked = computed(() =>
    Boolean(
      outcome.value &&
      props.session &&
      outcome.value.sessionId === props.session.sessionId &&
      outcome.value.status === 'uncertain',
    ),
  );
  const disabled = computed(
    () =>
      props.busy ||
      working.value ||
      !props.session ||
      props.session.apiVersion !== 'v3' ||
      Boolean(prepared.value),
  );
  const available = computed(() => bundles.value.filter((item) => item.status === 'ready'));
  const unresolved = computed(() => bundles.value.filter((item) => item.status === 'unresolved'));
  let revision = 0,
    alive = true,
    generatedForDraft;
  const explain = (cause) =>
    ({
      invalid_input: 'Bitte die Pflichtfelder, Schema-Kennung und Zuständigkeit prüfen.',
      key_missing:
        'Das gewählte Schlüsselpaar ist nicht mehr verfügbar. Bitte die lokalen Schlüssel neu laden.',
      destination_update_locked:
        'Dieser Anlageversuch ist bereits abgeschlossen oder ungeklärt. Bitte die vorhandene Destination prüfen und zuordnen.',
      confirmation_expired: 'Die Vorschau ist abgelaufen. Bitte erneut vorbereiten.',
      verification_failed:
        'Die zurückgelesene Destination passt nicht vollständig zur Vorschau oder zu den erzeugten Schlüsseln. Bitte die vorhandene Destination prüfen.',
      resource_denied:
        'Diese Zugangsdaten dürfen die Destination nicht anlegen oder verwalten. Die Berechtigung muss im Konto der gewählten Umgebung eingerichtet werden.',
    })[typeof cause === 'string' ? cause : cause?.message] || errorMessage(cause);
  async function cancelKnown(value, active) {
    if (!value || !active) return;
    try {
      await cancelDestinationCreation(invoke, active, value.attempt.attemptId);
    } catch (cause) {
      if (alive && resetsSessions(cause)) emit('fatal', cause);
    }
  }
  async function revealInvalid(event) {
    event.preventDefault();
    if (invalidTarget) return;
    invalidTarget = event.target;
    stepNotice.value = 'Bitte das markierte Pflichtfeld prüfen und ergänzen.';
    wizardStep.value = Number(invalidTarget.closest('[data-setup-step]')?.dataset.setupStep || 0);
    await nextTick();
    invalidTarget?.focus();
    invalidTarget?.reportValidity();
    invalidTarget = null;
  }
  function validControls(selector) {
    const fields = [...(form.value?.querySelectorAll(selector) || [])];
    const invalid = fields.find((field) => !field.disabled && !field.checkValidity());
    return !invalid;
  }
  async function submitStep() {
    stepNotice.value = '';
    if (wizardStep.value !== 2) {
      if (
        !validControls(
          `[data-setup-step="${wizardStep.value}"] input, [data-setup-step="${wizardStep.value}"] select, [data-setup-step="${wizardStep.value}"] textarea`,
        )
      )
        return;
      wizardStep.value = steps.value[steps.value.indexOf(wizardStep.value) + 1];
      await nextTick();
      form.value
        ?.querySelector(
          `[data-setup-step="${wizardStep.value}"] input, [data-setup-step="${wizardStep.value}"] select, [data-setup-step="${wizardStep.value}"] textarea`,
        )
        ?.focus();
    } else if (validControls('input, select, textarea')) await prepare();
  }
  watch(kind, () => {
    if (!steps.value.includes(wizardStep.value)) wizardStep.value = 0;
  });
  function reset() {
    revision++;
    const value = prepared.value,
      active = owner.value;
    prepared.value = null;
    dialog.value?.close();
    error.value = '';
    notice.value = '';
    generatedForDraft = null;
    bundles.value = [];
    selectedBundle.value = '';
    outcome.value = null;
    unresolvedBundle.value = '';
    knownDestination.value = '';
    if (!working.value) void cancelKnown(value, active);
  }
  watch(context, reset, { flush: 'sync' });
  watch(
    () =>
      JSON.stringify([
        name.value,
        legalName.value,
        email.value,
        address.value,
        phone.value,
        kind.value,
        addressing.value,
        service.value,
        regions.value,
        model.value,
        message.value,
        schema.value,
        mime.value,
        replySchema.value,
        compatible.value,
        selectedBundle.value,
      ]),
    () => {
      revision++;
      if (prepared.value && !working.value) {
        const value = prepared.value;
        prepared.value = null;
        dialog.value?.close();
        void cancelKnown(value, owner.value);
      }
    },
    { flush: 'sync' },
  );
  onBeforeUnmount(() => {
    alive = false;
    reset();
  });
  async function run(action, operation) {
    if (props.busy || working.value || !props.session) return;
    const active = { ...props.session },
      stamp = revision,
      started = performance.now();
    const current = () => alive && stamp === revision;
    working.value = true;
    error.value = '';
    notice.value = '';
    emit('busy', true);
    let status = 'Erfolgreich';
    try {
      status = (await operation(active, current)) || status;
    } catch (cause) {
      status = cancelledProductionAction(cause) ? 'Abgebrochen' : 'Fehlgeschlagen';
      if (current() && !cancelledProductionAction(cause)) error.value = explain(cause);
      if (resetsSessions(cause)) emit('fatal', cause);
    } finally {
      working.value = false;
      emit('busy', false);
      emit('activity', { api: active.apiVersion, role: 'Destination-Verwaltung', action, status, started });
    }
  }
  async function refresh(active, current) {
    const rows = await listGeneratedKeys(invoke, active);
    if (current()) bundles.value = rows;
    return rows;
  }
  function loadBundles() {
    return run('Lokale Schlüssel laden', (active, current) => refresh(active, current).then(() => undefined));
  }
  function configuration() {
    const selectedRegions = regions.value
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((value) => (/^[0-9]{12}$/.test(value) ? `DE${value}` : value.toUpperCase()));
    const offeredSchema = { schemaUri: schema.value.trim(), mimeType: mime.value };
    const publicServices = [],
      processMessages = [];
    if (kind.value === 'A') {
      if (addressing.value === 'service') {
        const identifier = service.value.trim();
        publicServices.push({
          identifier: /^[0-9]{14}$/.test(identifier) ? `urn:de:fim:leika:leistung:${identifier}` : identifier,
          regions: selectedRegions,
          submissionSchemas: [offeredSchema],
          ...(replySchema.value.trim()
            ? { replyChannels: { fitConnect: { processStandards: [replySchema.value.trim()] } } }
            : {}),
        });
      } else
        processMessages.push({
          processModelId: model.value.trim(),
          messageId: message.value.trim(),
          regions: selectedRegions,
          schemas: [offeredSchema],
        });
    }
    return {
      name: name.value.trim(),
      type: kind.value,
      contactInformation: {
        legalName: legalName.value.trim(),
        email: email.value.trim(),
        address: address.value.trim(),
        phone: phone.value.trim(),
      },
      metadataVersions: compatible.value ? ['2.0.0', '3.0.0'] : ['3.0.0'],
      publicServices,
      processMessages,
    };
  }
  async function prepare() {
    if (disabled.value || locked.value) return;
    const draft = configuration(),
      chosen = selectedBundle.value;
    await run('Destination vorbereiten', async (active, current) => {
      const previous = await destinationCreationState(invoke, active);
      if (!current()) return 'Abgebrochen';
      if (previous.status === 'uncertain') {
        outcome.value = { ...previous, sessionId: active.sessionId };
        await refresh(active, current);
        return 'Ausgang ungewiss';
      }
      if (previous.status === 'prepared') await cancelDestinationCreation(invoke, active, previous.attemptId);
      let keys = null;
      if (draft.type === 'A') {
        const rows = await refresh(active, current);
        if (!current()) return 'Abgebrochen';
        keys = rows.find(
          (item) => item.bundleId === (chosen || generatedForDraft) && item.status === 'ready',
        );
        if (!chosen && !keys && active.environment === 'TEST') {
          keys = await generateTestKeys(invoke, active);
          generatedForDraft = keys.bundleId;
        }
        if (!keys) throw new Error('key_missing');
      }
      if (!current()) return 'Abgebrochen';
      const value = await prepareDestinationCreation(invoke, active, keys, draft);
      if (!current()) {
        await cancelKnown(value, active);
        return 'Abgebrochen';
      }
      owner.value = active;
      prepared.value = value;
      outcome.value = null;
    });
    await nextTick();
    if (alive && prepared.value) dialog.value?.showModal();
  }
  async function dismiss() {
    if (!prepared.value || working.value) return;
    const value = prepared.value,
      active = owner.value;
    await run('Destination-Vorbereitung verwerfen', async (_, current) => {
      try {
        await cancelDestinationCreation(invoke, active, value.attempt.attemptId);
      } finally {
        prepared.value = null;
        dialog.value?.close();
      }
      await refresh(active, current);
    });
    await nextTick();
    if (alive) prepareButton.value?.focus();
  }
  async function confirm() {
    if (!prepared.value || props.busy || working.value) return;
    const value = prepared.value,
      active = owner.value;
    await run('Eigene Destination anlegen', async (_, current) => {
      const result = await executeDestinationCreation(invoke, active, value.attempt);
      prepared.value = null;
      dialog.value?.close();
      emit('changed');
      if (current()) {
        outcome.value = { ...result, sessionId: active.sessionId };
        knownDestination.value = result.destinationId || '';
        unresolvedBundle.value = result.bundleId;
        await refresh(active, current);
        await nextTick();
        resultHeading.value?.focus();
      }
      if (resetsSessions(result.error)) emit('fatal', result.error);
      return result.status === 'confirmed'
        ? 'Erfolgreich'
        : result.status === 'uncertain'
          ? 'Ausgang ungewiss'
          : 'Fehlgeschlagen';
    });
  }
  async function reconcile() {
    if (
      disabled.value ||
      (!unresolvedBundle.value &&
        !(
          outcome.value?.status === 'uncertain' &&
          outcome.value.bundleId === null &&
          outcome.value.destinationId
        )) ||
      !knownDestination.value.trim()
    )
      return;
    const bundleId = unresolvedBundle.value || null,
      destinationId = knownDestination.value.trim().toLowerCase();
    await run('Vorhandene Destination zuordnen', async (active, current) => {
      const result = await reconcileDestinationCreation(invoke, active, bundleId, destinationId);
      if (current()) {
        outcome.value = { ...result, sessionId: active.sessionId };
        await refresh(active, current);
      }
      emit('changed');
    });
  }
  async function loadKeys() {
    if (disabled.value || outcome.value?.status !== 'confirmed') return;
    const target = outcome.value;
    let ready = false;
    await run('Erzeugte Schlüssel für Empfang laden', async (active, current) => {
      await useGeneratedKeys(invoke, active, target.bundleId, target.destinationId);
      if (current()) {
        notice.value = 'Die privaten Schlüssel sind für diese Destination geladen.';
        ready = true;
      }
      emit('changed');
    });
    if (ready) emit('receive', target.destinationId);
  }
  return {
    wizardStep,
    form,
    stepNotice,
    steps,
    stepTitles,
    name,
    legalName,
    email,
    address,
    phone,
    kind,
    addressing,
    service,
    regions,
    model,
    message,
    schema,
    mime,
    replySchema,
    compatible,
    selectedBundle,
    unresolvedBundle,
    knownDestination,
    prepared,
    outcome,
    working,
    error,
    notice,
    dialog,
    prepareButton,
    resultHeading,
    context,
    locked,
    disabled,
    available,
    unresolved,
    explain,
    revealInvalid,
    submitStep,
    loadBundles,
    configuration,
    dismiss,
    confirm,
    reconcile,
    loadKeys,
  };
}
