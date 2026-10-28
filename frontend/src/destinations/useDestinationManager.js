import { cancelledProductionAction } from '../environments.js';
import { ref, computed, watch, nextTick } from 'vue';
import { invoke } from '../native.js';
import { listDestinations } from '../resources.js';
import {
  loadManagedDestination,
  prepareDestinationUpdate,
  executeDestinationUpdate,
  cancelDestinationUpdate,
  destinationUpdateState,
} from '../destination-management.js';
import { errorMessage, diagnosticCode } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';

// Owns destination manager state and its session-bound lifecycle.
export function useDestinationManager(props, emit) {
  const setupOpen = ref(false),
    setupNotice = ref('');
  const page = ref(null),
    selected = ref([]),
    detail = ref(null),
    preview = ref(null),
    pending = ref(false),
    error = ref('');
  const view = ref('list'),
    detailHeading = ref(null),
    editHeading = ref(null),
    previewHeading = ref(null),
    listHeading = ref(null);
  let returnTarget;
  const offersEnabled = ref(false),
    offers = ref({ publicServices: [], processMessages: [] });
  const nameEnabled = ref(false),
    name = ref('{name}'),
    statusEnabled = ref(false),
    status = ref('inactive');
  const versionsEnabled = ref(false),
    versions = ref('2.0.0, 3.0.0');
  const contacts = ref(
    Object.fromEntries(
      ['legalName', 'address', 'phone', 'email', 'unit'].map((key) => [key, { enabled: false, value: '' }]),
    ),
  );
  const disabled = computed(() => props.busy || pending.value || !props.session);
  const denied = ref(false);
  const canEdit = computed(
    () => props.session?.apiVersion === 'v3' && page.value?.canManageDestinations !== false && !denied.value,
  );
  const locked = computed(() => preview.value?.status === 'uncertain');
  const changes = computed(() => ({
    ...(offersEnabled.value && selected.value.length === 1 ? offers.value : {}),
    ...(nameEnabled.value ? { name: name.value } : {}),
    ...(statusEnabled.value ? { status: status.value } : {}),
    ...(versionsEnabled.value
      ? {
          metadataVersions: versions.value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }
      : {}),
    ...(Object.values(contacts.value).some((v) => v.enabled)
      ? {
          contactInformation: Object.fromEntries(
            Object.entries(contacts.value)
              .filter(([, v]) => v.enabled)
              .map(([key, v]) => [key, v.value || null]),
          ),
        }
      : {}),
  }));
  const labels = {
    publicServices: 'Leistungen und Antwortschemata',
    processMessages: 'Prozessnachrichten',
    name: 'Name',
    status: 'Status',
    metadataVersions: 'Metadatenversionen',
    legalName: 'Organisation',
    address: 'Anschrift',
    phone: 'Telefon',
    email: 'E-Mail',
    unit: 'Organisationseinheit',
    cc: 'Kopie an',
  };
  const statuses = {
    prepared: 'Zur Bestätigung',
    unchanged: 'Unverändert',
    updated: 'Gespeichert',
    failed: 'Fehlgeschlagen',
    uncertain: 'Ausgang ungewiss',
    skipped: 'Nicht ausgeführt',
    completed: 'Abgeschlossen',
    partial: 'Teilweise abgeschlossen',
    conflict: 'Zwischenzeitlich geändert',
    expired: 'Vorschau abgelaufen',
    cancelled: 'Abgebrochen',
    running: 'Wird gespeichert',
    idle: 'Keine Änderung vorbereitet',
  };
  const messages = {
    destination_conflict:
      'Mindestens eine Destination wurde seit der Vorschau geändert. Es wurde nichts gespeichert. Bitte neu laden und eine neue Vorschau erstellen.',
    destination_update_locked:
      'Diese Änderung kann nicht erneut ausgeführt werden. Bei ungewissem Ausgang bitte zuerst die Destination neu laden und für weitere Änderungen eine neue Sitzung öffnen.',
    resource_denied:
      'Die Zugangsdaten dürfen diese eigene Destination nicht verwalten. Bitte die Berechtigungen für die Destination API prüfen.',
    resource_missing: 'Die Destination ist nicht verfügbar.',
    invalid_input: 'Bitte Auswahl, Namen, Metadatenversionen und zulässige Statuswechsel prüfen.',
    confirmation_expired: 'Die Vorschau ist abgelaufen. Bitte neu vorbereiten.',
    content_limit: 'Die Auswahl oder Vorschau ist zu groß. Bitte weniger Destinations bearbeiten.',
    resource_unavailable:
      'Die Destination API ist nicht erreichbar. Bei einem Speicherversuch zuerst das Ergebnis abrufen. Nicht erneut speichern.',
  };
  let generation = 0;
  const context = computed(() => `${props.session?.apiVersion}/${props.session?.sessionId}`);
  watch(context, () => {
    generation++;
    page.value = null;
    selected.value = [];
    detail.value = null;
    preview.value = null;
    error.value = '';
    view.value = 'list';
    denied.value = false;
  });
  watch(
    () => JSON.stringify([selected.value.map((row) => row.destinationId), changes.value]),
    () => {
      const previous = preview.value;
      if (previous?.status === 'prepared') {
        preview.value = null;
        void cancelDestinationUpdate(invoke, { ...props.session }, previous.attemptId).catch(() => {});
      }
    },
  );
  async function run(action, operation) {
    if (disabled.value) return;
    const active = { ...props.session },
      stamp = generation,
      started = performance.now();
    pending.value = true;
    error.value = '';
    emit('busy', true);
    let resultStatus = 'Erfolgreich';
    try {
      await operation(active, () => stamp === generation);
    } catch (cause) {
      resultStatus = cancelledProductionAction(cause) ? 'Abgebrochen' : 'Fehlgeschlagen';
      if (stamp === generation && !cancelledProductionAction(cause))
        error.value = `${messages[diagnosticCode(cause)] || errorMessage(cause)} (${diagnosticCode(cause)})`;
      if (resetsSessions(cause)) emit('fatal', cause);
      if (diagnosticCode(cause) === 'resource_denied' && action === 'Destination-Änderung vorbereiten') {
        denied.value = true;
        selected.value = [];
        view.value = detail.value ? 'detail' : 'list';
      }
    } finally {
      pending.value = false;
      emit('busy', false);
      emit('activity', {
        api: active.apiVersion,
        role: 'Destination-Verwaltung',
        action,
        status: resultStatus,
        started,
      });
    }
  }
  async function openCreated(id) {
    setupOpen.value = false;
    setupNotice.value =
      'Destination und öffentliche Schlüssel sind angelegt. Prüfen Sie die Konfiguration und bestätigen Sie die Aktivierung separat.';
    await nextTick();
    await edit({ destinationId: id });
    if (detail.value?.destinationId === id && detail.value.possibleNextStatus.includes('active')) {
      nameEnabled.value = false;
      statusEnabled.value = true;
      status.value = 'active';
    }
  }
  function search(offset = 0) {
    return run('Eigene Destinations laden', async (active, current) => {
      const result = await listDestinations(invoke, active, offset);
      if (current()) {
        page.value = result;
        if (!canEdit.value) selected.value = [];
      }
    });
  }
  function toggle(row, checked) {
    if (disabled.value || locked.value || !canEdit.value) return;
    offersEnabled.value = false;
    if (checked && selected.value.length < 10) selected.value = [...selected.value, row];
    if (!checked) selected.value = selected.value.filter((item) => item.destinationId !== row.destinationId);
  }
  function resetFields() {
    offersEnabled.value = false;
    nameEnabled.value = false;
    name.value = '{name}';
    statusEnabled.value = false;
    versionsEnabled.value = false;
    for (const field of Object.values(contacts.value)) {
      field.enabled = false;
      field.value = '';
    }
  }
  async function show(target) {
    await nextTick();
    target.value?.focus();
    target.value?.scrollIntoView({ block: 'start' });
  }
  async function back() {
    view.value = 'list';
    await nextTick();
    const target = returnTarget
      ? document.querySelector(returnTarget)
      : document.querySelector('.destination-selection-actions button');
    if (target?.getClientRects().length) target.focus();
    else listHeading.value?.focus();
  }
  async function inspect(row) {
    returnTarget = `[data-open-destination="${row.destinationId}"]`;
    await run('Eigene Destination öffnen', async (active, current) => {
      const result = await loadManagedDestination(invoke, active, row.destinationId);
      if (!current()) return;
      detail.value = result;
      view.value = 'detail';
    });
    if (view.value === 'detail') await show(detailHeading);
  }
  async function edit(row) {
    if (!canEdit.value || locked.value) return;
    if (selected.value.length > 1) return editSelection();
    if (view.value === 'list') returnTarget = `[data-edit-destination="${row.destinationId}"]`;
    await run('Eigene Destination öffnen', async (active, current) => {
      const result = await loadManagedDestination(invoke, active, row.destinationId);
      if (!current()) return;
      detail.value = result;
      offersEnabled.value = false;
      offers.value = result.offers
        ? structuredClone(result.offers)
        : { publicServices: [], processMessages: [] };
      if (locked.value) return;
      selected.value = [row];
      preview.value = null;
      name.value = result.name || '';
      nameEnabled.value = true;
      versions.value = result.metadataVersions.join(', ');
      statusEnabled.value = false;
      versionsEnabled.value = false;
      for (const [key, field] of Object.entries(contacts.value)) {
        field.enabled = false;
        field.value = result.contact[key] || '';
      }
      view.value = 'edit';
    });
    if (view.value === 'edit') await show(editHeading);
  }
  async function editSelection() {
    if (disabled.value || locked.value || !canEdit.value || !selected.value.length) return;
    if (selected.value.length === 1) return edit(selected.value[0]);
    if (view.value === 'list') returnTarget = null;
    resetFields();
    detail.value = null;
    view.value = 'edit';
    await show(editHeading);
  }
  async function prepare() {
    if (!canEdit.value) return;
    await run('Destination-Änderung vorbereiten', async (active, current) => {
      const result = await prepareDestinationUpdate(
        invoke,
        active,
        selected.value.map((row) => row.destinationId),
        changes.value,
      );
      if (current()) preview.value = result;
    });
    if (preview.value) await show(previewHeading);
  }
  function execute() {
    const confirmed = preview.value;
    if (!confirmed || confirmed.status !== 'prepared') return;
    return run('Destination-Änderung speichern', async (active, current) => {
      // Remove the execute capability from the UI before the IPC call. Recovery reads state only.
      preview.value = { ...confirmed, status: 'running' };
      try {
        const result = await executeDestinationUpdate(invoke, active, confirmed);
        if (current()) {
          preview.value = result;
          emit('changed');
        }
      } catch (cause) {
        if (current()) {
          preview.value = cancelledProductionAction(cause)
            ? confirmed
            : { ...confirmed, status: 'uncertain' };
          emit('changed');
        }
        throw cause;
      }
    });
  }
  function recover() {
    return run('Änderungsergebnis abrufen', async (active, current) => {
      const result = await destinationUpdateState(invoke, active);
      if (current()) {
        preview.value = result;
        emit('changed');
      }
    });
  }
  function cancel() {
    const previous = preview.value;
    return run('Änderung abbrechen', async (active, current) => {
      await cancelDestinationUpdate(invoke, active, previous.attemptId);
      if (current()) preview.value = null;
    });
  }
  function difference(row) {
    const result = [],
      show = (value) =>
        value == null || value === ''
          ? 'Nicht gesetzt'
          : Array.isArray(value)
            ? value.join(', ')
            : String(value);
    for (const [key, value] of Object.entries(row.after)) {
      if (['publicServices', 'processMessages'].includes(key)) continue;
      if (key === 'contactInformation')
        for (const [field, next] of Object.entries(value)) {
          const old = row.before.contactInformation?.[field];
          if (JSON.stringify(old ?? null) !== JSON.stringify(next))
            result.push({ field: labels[field], before: show(old), after: show(next) });
        }
      else result.push({ field: labels[key], before: show(row.before[key]), after: show(value) });
    }
    return result;
  }
  return {
    setupOpen,
    setupNotice,
    page,
    selected,
    detail,
    preview,
    pending,
    error,
    view,
    detailHeading,
    editHeading,
    previewHeading,
    listHeading,
    offersEnabled,
    offers,
    nameEnabled,
    name,
    statusEnabled,
    status,
    versionsEnabled,
    versions,
    contacts,
    disabled,
    canEdit,
    locked,
    changes,
    labels,
    statuses,
    messages,
    openCreated,
    search,
    toggle,
    show,
    back,
    inspect,
    edit,
    editSelection,
    prepare,
    execute,
    recover,
    cancel,
    difference,
  };
}
