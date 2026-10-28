import { caseGroups, filterCaseGroups, defaultCaseMessage } from '../case-groups.js';
import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from '../native.js';
import { listCases, caseParts, readCaseFile, caseRequest, caseErrorMessage } from '../cases.js';
import { createPreview, disposePreview } from '../submission-preview.js';
import { errorMessage } from '../diagnostics.js';
import { SCHEMA_VIEW_BYTES } from '../schema-annotations.js';
import { structuredFormat, STRUCTURED_BYTES } from '../structured-data.js';

// Owns case workspace state and its session-bound lifecycle.
export function useCaseWorkspace(props, emit) {
  const records = shallowRef([]),
    selected = shallowRef(null),
    parts = shallowRef([]),
    application = shallowRef(null),
    preview = shallowRef(null);
  const search = ref(''),
    direction = ref('all'),
    attentionOnly = ref(false),
    pending = ref(false),
    error = ref(''),
    notice = ref(''),
    persistent = ref(false),
    canPersist = ref(false),
    clearDialog = ref(null),
    detailHeading = ref(null),
    searchBox = ref(null);
  const groups = computed(() => caseGroups(records.value));
  const filtered = computed(() =>
    filterCaseGroups(groups.value, search.value, direction.value, attentionOnly.value),
  );
  const selectedGroup = computed(() =>
    groups.value.find((group) =>
      group.messages.some((record) => record.recordId === selected.value?.recordId),
    ),
  );
  const disabled = computed(() => pending.value || props.busy || !props.session);
  const attachments = computed(() => parts.value.filter((p) => p.kind === 'attachment'));
  const hasPlaintext = computed(() => parts.value.some((part) => part.kind === 'data'));
  let generation = 0,
    controller,
    downloadUrl,
    downloadTimer;
  const bytesLabel = (size) => `${(size / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KiB`;
  const when = (value) =>
    Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('de-DE') : 'Zeitpunkt nicht lesbar';
  async function resetFilters() {
    if (disabled.value) return;
    search.value = '';
    direction.value = 'all';
    attentionOnly.value = false;
    await nextTick();
    searchBox.value?.focus();
  }
  function closePreview() {
    disposePreview(preview.value);
    preview.value = null;
  }
  function reset() {
    generation++;
    controller?.abort();
    closePreview();
    selected.value = null;
    parts.value = [];
    application.value = null;
  }
  async function run(operation) {
    if (disabled.value) return;
    const stamp = generation,
      session = { ...props.session };
    pending.value = true;
    emit('busy', true);
    error.value = '';
    notice.value = '';
    try {
      await operation(session, () => stamp === generation);
    } catch (cause) {
      if (stamp === generation) error.value = caseErrorMessage(cause) || errorMessage(cause);
    } finally {
      pending.value = false;
      emit('busy', false);
    }
  }
  async function refresh(session) {
    const result = await listCases(invoke, session);
    if (props.session?.sessionId !== session.sessionId || props.session?.apiVersion !== session.apiVersion)
      return;
    records.value = result.records;
    persistent.value = result.persistent;
    canPersist.value = result.canPersist;
    if (result.storageError)
      error.value =
        'Die dauerhafte Sicherung ist fehlgeschlagen. Die aktuelle Kopie bleibt in dieser Anwendungssitzung erhalten. Vor dem Annehmen oder Ablehnen wird die Sicherung erneut geprüft.';
  }
  let loadedContext = '';
  const sessionContext = () => `${props.session?.apiVersion}/${props.session?.sessionId}`;
  function load() {
    if (disabled.value) return;
    loadedContext = sessionContext();
    void run(async (session, current) => {
      const result = await listCases(invoke, session);
      if (!current()) return;
      records.value = result.records;
      persistent.value = result.persistent;
      canPersist.value = result.canPersist;
      if (result.storageError)
        error.value =
          'Die dauerhafte Sicherung ist fehlgeschlagen. Die Sitzungskopie ist noch vorhanden. Bitte Speicherplatz prüfen und erneut laden.';
    });
  }
  watch(
    [() => props.session?.sessionId, () => props.session?.apiVersion, () => props.visible],
    () => {
      reset();
      loadedContext = '';
      records.value = [];
      if (props.visible && props.session) load();
    },
    { immediate: true },
  );
  watch(
    () => props.busy,
    (value) => {
      if (!value && !pending.value && props.visible && props.session && loadedContext !== sessionContext())
        load();
    },
  );
  async function textFile(session, record, part) {
    controller = new AbortController();
    const bytes = await readCaseFile(invoke, session, record.recordId, part, { signal: controller.signal });
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } finally {
      bytes.fill(0);
    }
  }
  let opener;
  async function closeCase() {
    reset();
    error.value = '';
    notice.value = '';
    await nextTick();
    if (opener?.isConnected) opener.focus();
    else searchBox.value?.focus();
  }
  function openGroup(group, event) {
    const record = defaultCaseMessage(group, search.value);
    if (record) open(record, event);
  }
  function open(record, event) {
    if (disabled.value || record.available === false) return;
    if (event) opener = event.currentTarget;
    else if (!selected.value) opener = document.activeElement;
    generation++;
    controller?.abort();
    closePreview();
    void run(async (session, current) => {
      const rows = await caseParts(invoke, session, record.recordId);
      const data = rows.find((p) => p.kind === 'data');
      const format =
        data && structuredFormat({ filename: data.fileName || '', mimeType: data.mimeType || '' });
      let view = null;
      if (data && format && data.totalBytes <= STRUCTURED_BYTES) {
        const text = await textFile(session, record, data);
        const schema = rows.find((p) => p.kind === 'schema');
        view = {
          text,
          format,
          schemaDocument:
            schema && schema.totalBytes <= SCHEMA_VIEW_BYTES ? await textFile(session, record, schema) : null,
          schemaUri: schema?.fileName || null,
        };
      }
      if (!current()) return;
      selected.value = record;
      parts.value = rows;
      application.value = view;
      await nextTick();
      detailHeading.value?.focus();
      detailHeading.value?.scrollIntoView({ block: 'start' });
    });
  }
  function inspect(part, download = false) {
    if (!download && part.totalBytes > 8 * 1024 * 1024) {
      error.value = 'Die Vorschau ist auf 8 MiB begrenzt. Bitte das Original herunterladen.';
      return;
    }
    void run(async (session, current) => {
      controller = new AbortController();
      const bytes = await readCaseFile(invoke, session, selected.value.recordId, part, {
        signal: controller.signal,
      });
      try {
        if (!current()) return;
        if (download) {
          if (downloadUrl) URL.revokeObjectURL(downloadUrl);
          clearTimeout(downloadTimer);
          downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = (part.fileName || 'Datei').split(/[\\/]/).pop();
          a.click();
          downloadTimer = setTimeout(() => {
            URL.revokeObjectURL(downloadUrl);
            downloadUrl = null;
          }, 30000);
        } else {
          const result = await createPreview(bytes, {
            filename: part.fileName || 'Datei',
            mimeType: part.mimeType || '',
          });
          if (!current()) {
            disposePreview(result);
            return;
          }
          closePreview();
          preview.value = result;
        }
      } finally {
        bytes.fill(0);
      }
    });
  }
  async function remove(record) {
    const activeContext = sessionContext();
    const replacing = selected.value?.recordId === record.recordId;
    let nextId;
    await run(async (session, current) => {
      await caseRequest(invoke, session, 'delete', { recordId: record.recordId });
      if (!current()) return;
      await refresh(session);
      if (!current()) return;
      if (replacing) {
        const group = groups.value.find((item) => record.caseId && item.caseId === record.caseId);
        nextId = group && defaultCaseMessage(group)?.recordId;
        reset();
      }
      notice.value = 'Lokale Kopie gelöscht. Der Serverbestand bleibt unverändert.';
    });
    if (activeContext !== sessionContext()) return;
    await nextTick();
    if (nextId) open(records.value.find((item) => item.recordId === nextId));
    else if (replacing) {
      await nextTick();
      if (opener?.isConnected) opener.focus();
      else searchBox.value?.focus();
    }
  }
  function clear() {
    clearDialog.value.close();
    void run(async (session) => {
      await caseRequest(invoke, session, 'clear');
      reset();
      await refresh(session);
      notice.value = 'Der lokale Verlauf dieses Profils und dieser API wurde geleert.';
      await nextTick();
      searchBox.value?.focus();
    });
  }
  function storage(event) {
    const enabled = event.target.checked;
    event.target.checked = persistent.value;
    void run(async (session) => {
      try {
        await caseRequest(invoke, session, 'storage', { persistent: enabled });
      } catch (cause) {
        try {
          await refresh(session);
        } catch {
          /* Keep the original storage failure visible. */
        }
        throw cause;
      }
      await refresh(session);
      notice.value = enabled
        ? 'Vorhandene Vorgänge sind geschützt gespeichert. Neue Vorgänge werden ebenfalls gesichert.'
        : 'Neue Vorgänge bleiben in der Sitzung. Bereits gespeicherte Kopien bleiben bis zum Löschen erhalten.';
    });
  }
  onBeforeUnmount(() => {
    reset();
    clearTimeout(downloadTimer);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  });
  return {
    records,
    selected,
    parts,
    application,
    preview,
    search,
    direction,
    attentionOnly,
    pending,
    error,
    notice,
    persistent,
    canPersist,
    clearDialog,
    detailHeading,
    searchBox,
    filtered,
    selectedGroup,
    disabled,
    attachments,
    hasPlaintext,
    bytesLabel,
    when,
    resetFilters,
    closePreview,
    load,
    closeCase,
    openGroup,
    open,
    inspect,
    remove,
    clear,
    storage,
  };
}
