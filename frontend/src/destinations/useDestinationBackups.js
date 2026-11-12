import { computed, ref, shallowRef, watch, onBeforeUnmount } from 'vue';
import { invoke } from '../native.ts';
import { destinationBackups, backupChanges } from '../destination-backups.js';
import { diagnosticCode, errorMessage } from '../diagnostics.js';
import { resetsSessions } from '../sessions.ts';
import { validOffers } from '../destination-offers.js';
import { destinationConfiguration } from '../destination-extras.js';

export function useDestinationBackups(props, emit) {
  const items = ref([]),
    selected = ref(''),
    detail = shallowRef(null),
    pending = ref(false),
    task = ref('');
  const name = ref(''),
    target = ref('');
  const error = ref(''),
    notice = ref(''),
    profileMissing = ref(false);
  const disabled = computed(
    () => props.busy || pending.value || !props.session || props.session.apiVersion !== 'v3',
  );
  const reusable = computed(
    () =>
      detail.value &&
      destinationConfiguration(detail.value.configuration) &&
      Array.isArray(detail.value.configuration.metadataVersions) &&
      detail.value.configuration.metadataVersions.every((value) => typeof value === 'string') &&
      ['A', 'C'].includes(detail.value.configuration.type) &&
      validOffers({
        publicServices: detail.value.configuration.publicServices,
        processMessages: detail.value.configuration.processMessages,
      }),
  );
  let generation = 0,
    alive = true;
  function explain(cause) {
    return (
      {
        backup_invalid:
          'Die Sicherung ist ungültig oder enthält Einstellungen, die diese Version nicht bearbeiten kann.',
        backup_unavailable:
          'Die Sicherung konnte nicht gelesen oder gespeichert werden. Prüfen Sie Speicherplatz und Dateirechte.',
        environment_mismatch:
          'Die Sicherung gehört zu einer anderen FIT-Connect-Umgebung. Öffnen Sie ein passendes Profil.',
        vault_limit: 'Im Profil können höchstens 20 Zustellpunkt-Sicherungen gespeichert werden.',
      }[diagnosticCode(cause)] || errorMessage(cause)
    );
  }
  async function run(label, operation) {
    if (disabled.value) return;
    const stamp = generation,
      active = { ...props.session },
      started = performance.now();
    const current = () => alive && stamp === generation;
    pending.value = true;
    error.value = '';
    notice.value = '';
    emit('busy', true);
    let status = 'Erfolgreich';
    try {
      await operation(active, current);
    } catch (cause) {
      status = 'Fehlgeschlagen';
      if (current()) {
        profileMissing.value = diagnosticCode(cause) === 'vault_profile_required';
        if (!profileMissing.value) error.value = explain(cause);
      }
      if (resetsSessions(cause)) emit('fatal', cause);
    } finally {
      pending.value = false;
      emit('busy', false);
      emit('activity', {
        api: active.apiVersion,
        role: 'Destination-Verwaltung',
        action: label,
        status,
        started,
      });
    }
  }
  async function refresh(active, current) {
    const result = await destinationBackups(invoke, active, { action: 'list' });
    if (current()) {
      items.value = result;
      profileMissing.value = false;
    }
  }
  watch(
    () => [props.session?.sessionId, props.captureDestination?.destinationId],
    () => {
      generation++;
      items.value = [];
      selected.value = '';
      detail.value = null;
      task.value = '';
      profileMissing.value = false;
      error.value = '';
      notice.value = '';
      name.value = props.captureDestination
        ? `${props.captureDestination.name || 'Zustellpunkt'} · ${new Date().toLocaleDateString('de-DE')}`.slice(
            0,
            160,
          )
        : '';
      if (props.session?.apiVersion === 'v3') void run('Zustellpunkt-Sicherungen laden', refresh);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    alive = false;
    generation++;
  });
  async function select() {
    detail.value = null;
    task.value = '';
    const id = selected.value;
    if (!id) return;
    await run('Zustellpunkt-Sicherung öffnen', async (active, current) => {
      const result = await destinationBackups(invoke, active, { action: 'inspect', id });
      if (current() && selected.value === id) {
        detail.value = result;
        target.value = result.summary.sourceDestinationId;
      }
    });
  }
  async function capture() {
    await run('Zustellpunkt sichern', async (active, current) => {
      const result = await destinationBackups(invoke, active, {
        action: 'capture',
        destinationId: props.captureDestination.destinationId,
        name: name.value.trim(),
      });
      await refresh(active, current);
      if (current()) {
        selected.value = result.id;
        notice.value = 'Zustellpunkt-Sicherung geschützt im Profil gespeichert.';
      }
    });
    if (selected.value && !error.value) {
      await select();
      if (detail.value) notice.value = 'Zustellpunkt-Sicherung geschützt im Profil gespeichert.';
    }
  }
  async function create() {
    const source = detail.value;
    if (!source || !reusable.value) return;
    const stamp = generation;
    let next = null;
    await run('Neue Destination aus Sicherung vorbereiten', async (active, current) => {
      if (current()) next = { configuration: structuredClone(source.configuration), bundleId: null };
    });
    if (next && alive && stamp === generation) emit('create', next);
  }
  function edit() {
    if (disabled.value || !detail.value || !reusable.value) return;
    try {
      emit('edit', {
        destinationId: target.value.trim(),
        type: detail.value.configuration.type,
        changes: backupChanges(detail.value.configuration),
      });
    } catch (cause) {
      error.value = explain(cause);
    }
  }
  async function transfer() {
    const action = task.value;
    if (!['export', 'import'].includes(action)) return;
    let imported = false;
    await run(
      action === 'export' ? 'Zustellpunkt-Sicherung exportieren' : 'Zustellpunkt-Sicherung importieren',
      async (active, current) => {
        const result = await destinationBackups(invoke, active, {
          action,
          ...(action === 'export' ? { id: detail.value.summary.id } : {}),
        });
        if (!current()) return;
        if (action === 'import' && result) {
          await refresh(active, current);
          if (current()) {
            selected.value = result.id;
            imported = true;
            task.value = '';
            notice.value = 'Sicherung importiert und geschützt im Profil gespeichert.';
          }
        } else if (action === 'import') {
          notice.value = 'Import abgebrochen.';
        } else if (action === 'export') {
          task.value = '';
          notice.value = result.saved ? 'JSON-Konfiguration exportiert.' : 'Export abgebrochen.';
        }
      },
    );
    if (imported && selected.value && !error.value) {
      await select();
      if (detail.value) notice.value = 'Sicherung importiert und geschützt im Profil gespeichert.';
    }
  }
  async function remove() {
    const id = detail.value?.summary.id;
    if (!id) return;
    await run('Zustellpunkt-Sicherung löschen', async (active, current) => {
      await destinationBackups(invoke, active, { action: 'delete', id });
      await refresh(active, current);
      if (current()) {
        selected.value = '';
        detail.value = null;
        task.value = '';
        notice.value = 'Lokale Sicherung gelöscht. Die Destination bei FIT-Connect besteht weiter.';
      }
    });
  }
  function chooseTask(value) {
    task.value = value;
    error.value = '';
  }
  return {
    items,
    selected,
    detail,
    pending,
    task,
    name,
    target,
    error,
    notice,
    profileMissing,
    disabled,
    reusable,
    select,
    capture,
    create,
    edit,
    transfer,
    remove,
    chooseTask,
  };
}
