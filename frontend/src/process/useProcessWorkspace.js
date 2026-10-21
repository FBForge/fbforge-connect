import { ref, shallowRef, computed, watch, inject, nextTick } from 'vue';
import { invoke } from '../native.js';
import {
  BPMN_LIMIT,
  initialMapping,
  mappingDocument,
  checkedMapping,
  processHighlights,
} from '../bpmn-model.js';
import { loadBpmnModel } from '../load-bpmn-model.js';
import { searchProcessDestinations } from '../process-discovery.js';
import { processWorkspaceKey } from '../process-context.js';
import { errorMessage } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';

// Owns process workspace state and its session-bound lifecycle.
export function useProcessWorkspace(props, emit) {
  const workspace = inject(processWorkspaceKey, null);
  const model = shallowRef(null),
    xml = ref(''),
    mapping = shallowRef(null),
    selectedId = ref(''),
    search = ref(''),
    region = ref('DE'),
    page = shallowRef(null),
    pending = ref(false),
    error = ref(''),
    notice = ref('');
  const modelId = ref(''),
    messageId = ref(''),
    schemaUri = ref(''),
    mimeType = ref('application/json'),
    selectionHeading = ref(null),
    remember = ref(false);
  const selected = computed(() => model.value?.selections.find((row) => row.elementId === selectedId.value));
  const message = computed(() =>
    model.value?.messages.find((row) => row.bpmnMessageId === selected.value?.bpmnMessageId),
  );
  const currentMapping = computed(() =>
    mapping.value?.entries.find((row) => row.bpmnMessageId === selected.value?.bpmnMessageId),
  );
  const filtered = computed(
    () =>
      model.value?.selections.filter((row) =>
        `${row.label} ${row.elementId} ${row.bpmnMessageId}`
          .toLocaleLowerCase('de')
          .includes(search.value.toLocaleLowerCase('de')),
      ) || [],
  );
  const highlights = computed(() =>
    model.value && mapping.value ? processHighlights(model.value, mapping.value, props.context) : [],
  );
  const mappingDirty = computed(
    () =>
      !currentMapping.value ||
      modelId.value.trim() !== currentMapping.value.processModelId ||
      messageId.value.trim() !== currentMapping.value.messageId ||
      (schemaUri.value.trim() || null) !== currentMapping.value.schemaUri ||
      (Boolean(schemaUri.value.trim()) && mimeType.value !== currentMapping.value.mimeType),
  );
  watch(region, () => {
    page.value = null;
  });
  const disabled = computed(() => props.busy || pending.value);
  const connected = computed(() => props.session?.apiVersion === 'v3');
  const labels = {
    send: 'Sendeschritt',
    receive: 'Empfangsschritt',
    flow: 'Nachrichtenfluss',
    unknown: 'Nachrichtenreferenz',
  };
  let generation = 0;
  watch(
    () => props.session?.sessionId,
    () => {
      generation++;
      page.value = null;
    },
  );
  watch([selected, currentMapping], () => {
    modelId.value = currentMapping.value?.processModelId || message.value?.processModelId || '';
    messageId.value = currentMapping.value?.messageId || message.value?.messageId || '';
    schemaUri.value = currentMapping.value?.schemaUri || message.value?.schemaUri || '';
    mimeType.value = currentMapping.value?.mimeType || message.value?.mimeType || 'application/json';
    page.value = null;
  });
  watch(
    [currentMapping, mappingDirty],
    ([value, dirty]) => {
      if (workspace)
        workspace.selection.value =
          value && !dirty
            ? {
                ...value,
                sha256: model.value.sha256,
                elementId: selectedId.value,
                label: selected.value?.label,
              }
            : null;
    },
    { immediate: true },
  );
  watch(
    () => props.context,
    async (context) => {
      if (!context || !highlights.value.length) return;
      selectedId.value = highlights.value[0];
      await nextTick();
      selectionHeading.value?.focus();
    },
  );
  function explain(cause) {
    const code = typeof cause === 'string' ? cause : cause?.message;
    return (
      {
        bpmn_invalid:
          'Das Modell enthält ungültige, mehrdeutige oder nicht unterstützte BPMN-Strukturen. DTD, aktive Inhalte und externe Ressourcen sind nicht erlaubt.',
        bpmn_limit:
          'Das Modell ist zu groß oder zu aufwendig. Erlaubt sind höchstens 2 MiB, 10.000 XML-Elemente, 500 Diagrammelemente und 500 Nachrichten.',
        bpmn_mapping_mismatch:
          'Die Zuordnung passt nicht zum SHA-256-Fingerabdruck dieses Modells oder enthält ungültige Kennungen.',
        bpmn_mapping_ambiguous:
          'Dieselbe FIT-Connect-Nachricht ist mehreren BPMN-Nachrichten zugeordnet. Bitte die Zuordnung eindeutig festlegen.',
      }[code] || errorMessage(cause)
    );
  }
  async function load(source) {
    if (disabled.value) return;
    generation++;
    const stamp = generation;
    pending.value = true;
    error.value = '';
    page.value = null;
    notice.value = '';
    model.value = null;
    mapping.value = null;
    xml.value = '';
    selectedId.value = '';
    try {
      const parsed = await loadBpmnModel(source);
      if (stamp !== generation) return;
      const initial = initialMapping(parsed);
      model.value = parsed;
      xml.value = source;
      mapping.value = initial;
      selectedId.value = parsed.selections[0]?.elementId || '';
      remember.value = false;
      try {
        const saved = localStorage.getItem(`fit-connect.bpmn.${parsed.sha256}`);
        if (saved && saved.length <= 262144) {
          mapping.value = checkedMapping(parsed, JSON.parse(saved));
          remember.value = true;
          notice.value = 'Lokale Kennungszuordnung passend zu diesem Modell-Fingerabdruck geladen.';
        }
      } catch {
        /* Unavailable/old local mapping never grants a write capability. */
      }
    } catch (cause) {
      error.value = explain(cause);
    } finally {
      pending.value = false;
    }
  }
  async function file(files) {
    const file = files[0];
    if (!file || disabled.value) return;
    if (file.size > BPMN_LIMIT) {
      error.value = explain('bpmn_limit');
      return;
    }
    try {
      await load(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()));
    } catch {
      error.value = explain('bpmn_invalid');
    }
  }
  function select(id) {
    if (model.value?.selections.some((row) => row.elementId === id)) {
      selectedId.value = id;
      void nextTick(() => selectionHeading.value?.focus());
    }
  }
  function persist() {
    if (!model.value || !mapping.value) return;
    try {
      const key = `fit-connect.bpmn.${model.value.sha256}`;
      if (remember.value) {
        const keys = Object.keys(localStorage).filter((key) => key.startsWith('fit-connect.bpmn.'));
        if (!keys.includes(key) && keys.length >= 20) throw new Error();
        localStorage.setItem(key, JSON.stringify(mapping.value));
        notice.value =
          'Nur Modell-Fingerabdruck und Kennungszuordnung werden lokal gespeichert. Keine Zugangsdaten, Fachdaten oder Modelldatei.';
      } else {
        localStorage.removeItem(key);
        notice.value = 'Die Zuordnung wird nur in dieser Programmsitzung gehalten.';
      }
    } catch {
      remember.value = false;
      notice.value =
        'Die lokale Zuordnung konnte nicht gespeichert werden. Sie können sie als Datei exportieren.';
    }
  }
  function apply() {
    if (!selected.value || disabled.value) return;
    try {
      error.value = '';
      mapping.value = mappingDocument(model.value, [
        ...mapping.value.entries.filter((row) => row.bpmnMessageId !== selected.value.bpmnMessageId),
        {
          bpmnMessageId: selected.value.bpmnMessageId,
          processModelId: modelId.value.trim(),
          messageId: messageId.value.trim(),
          schemaUri: schemaUri.value.trim() || null,
          mimeType: schemaUri.value.trim() ? mimeType.value : null,
        },
      ]);
      persist();
      notice.value = 'Kennungszuordnung übernommen. Es wurde nichts an FIT-Connect gesendet.';
    } catch (cause) {
      error.value = explain(cause);
    }
  }
  async function importMapping(files) {
    const file = files[0];
    if (!file || !model.value || disabled.value) return;
    try {
      if (file.size > 262144) throw new Error('bpmn_mapping_mismatch');
      mapping.value = checkedMapping(model.value, JSON.parse(await file.text()));
      persist();
    } catch (cause) {
      error.value = explain(cause);
    }
  }
  function download() {
    if (!mapping.value) return;
    const blob = new Blob([JSON.stringify(mapping.value, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `bpmn-mapping-${model.value.sha256.slice(0, 12)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function discover(offset = 0) {
    if (disabled.value || !connected.value || !currentMapping.value || mappingDirty.value) return;
    const active = { ...props.session },
      stamp = generation,
      selected = { ...currentMapping.value },
      started = performance.now();
    pending.value = true;
    emit('busy', true);
    error.value = '';
    let status = 'Erfolgreich';
    try {
      const result = await searchProcessDestinations(invoke, active, selected, region.value.trim(), offset);
      if (stamp === generation && selected.bpmnMessageId === currentMapping.value?.bpmnMessageId)
        page.value = result;
    } catch (cause) {
      status = 'Fehlgeschlagen';
      if (stamp === generation) error.value = explain(cause);
      if (resetsSessions(cause)) emit('fatal', cause);
    } finally {
      pending.value = false;
      emit('busy', false);
      emit('activity', {
        api: 'v3',
        role: 'Prozesskommunikation',
        action: 'Prozess-Empfänger suchen',
        status,
        started,
      });
    }
  }
  function send(row) {
    if (disabled.value || !page.value || !currentMapping.value || mappingDirty.value) return;
    const mapped = currentMapping.value;
    if (
      mapped.schemaUri &&
      !row.schemas.some((item) => item.schemaUri === mapped.schemaUri && item.mimeType === mapped.mimeType)
    ) {
      error.value =
        'Diese Destination bietet das zugeordnete Schema nicht an. Bitte Schema oder Empfänger prüfen.';
      return;
    }
    emit('send', {
      ...mapped,
      region: page.value.region,
      destinationId: row.destinationId,
      sessionId: props.session.sessionId,
      apiVersion: 'v3',
      requestId: crypto.randomUUID(),
      sha256: model.value.sha256,
    });
  }
  return {
    model,
    xml,
    mapping,
    selectedId,
    search,
    region,
    page,
    pending,
    error,
    notice,
    modelId,
    messageId,
    schemaUri,
    mimeType,
    selectionHeading,
    remember,
    selected,
    message,
    currentMapping,
    filtered,
    highlights,
    mappingDirty,
    disabled,
    connected,
    labels,
    load,
    file,
    select,
    persist,
    apply,
    importMapping,
    download,
    discover,
    send,
  };
}
