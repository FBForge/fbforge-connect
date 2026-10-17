<script setup>
import { ref, shallowRef, computed, watch, inject, nextTick, defineAsyncComponent } from 'vue';
import { invoke } from './native.js';
import {
  BPMN_LIMIT,
  initialMapping,
  mappingDocument,
  checkedMapping,
  processHighlights,
} from './bpmn-model.js';
import { loadBpmnModel } from './load-bpmn-model.js';
import { searchProcessDestinations } from './process-discovery.js';
import { processWorkspaceKey } from './process-context.js';
const BpmnDiagram = defineAsyncComponent(() => import('./BpmnDiagram.vue'));
import demo from './examples/test-process.bpmn?raw';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
const props = defineProps({ session: Object, busy: Boolean, visible: Boolean, context: Object });
const emit = defineEmits(['busy', 'activity', 'fatal', 'send', 'event-log']);
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
async function file(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
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
      'Die lokale Zuordnung konnte nicht gespeichert werden. Du kannst sie als Datei exportieren.';
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
async function importMapping(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !model.value) return;
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
      'Dieser Zustellpunkt bietet das zugeordnete Schema nicht an. Bitte Schema oder Empfänger prüfen.';
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
</script>
<template>
  <section class="tool-section" aria-labelledby="process-title" :aria-busy="pending">
    <h2 id="process-title">Prozesse und BPMN</h2>
    <p>
      Ein lokales BPMN-Modell öffnen, eine Nachricht auswählen und ihre FIT-Connect-Kennungen prüfen. Ein
      Modellklick oder eine Empfängersuche versendet nichts und führt keinen Prozess aus.
    </p>
    <div class="client-fields">
      <label for="bpmn-file">
        BPMN-2.0-Modell öffnen
        <input
          id="bpmn-file"
          type="file"
          accept=".bpmn,.xml,application/xml"
          :disabled="disabled"
          @change="file"
        />
        <small>UTF-8, höchstens 2 MiB. Die Modelldatei bleibt lokal.</small>
      </label>
    </div>
    <button class="button secondary" :disabled="disabled" @click="load(demo)">
      Fiktiven Demo-Prozess öffnen
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="pending" role="status">Modell oder Empfänger werden geprüft …</p>
    <template v-if="model">
      <h3>{{ model.name }}</h3>
      <details>
        <summary>Modellidentität und Zuordnung</summary>
        <p>
          SHA-256:
          <code>{{ model.sha256 }}</code>
        </p>
        <p>
          BPMN-IDs und Anzeigenamen sind keine automatisch gültigen FIT-Connect-Kennungen. Die Demo verwendet
          ausdrücklich hinterlegte Testkennungen; bei eigenen Modellen musst du die vereinbarten Kennungen
          prüfen oder ergänzen.
        </p>
        <label class="checkbox-label">
          <input v-model="remember" type="checkbox" :disabled="disabled" @change="persist" />
          Kennungszuordnung für diesen Modell-Fingerabdruck lokal merken
        </label>
        <div class="client-actions">
          <button class="button secondary" @click="download">Zuordnung als JSON exportieren</button>
          <label for="bpmn-mapping-file">
            Zuordnung importieren
            <input
              id="bpmn-mapping-file"
              type="file"
              accept=".json,application/json"
              :disabled="disabled"
              @change="importMapping"
            />
          </label>
        </div>
      </details>
      <p v-if="context">
        Nachrichtenbezug: {{ context.processModelId }} · {{ context.messageId }}.
        {{
          highlights.length
            ? 'Passende Elemente sind grün hervorgehoben.'
            : 'Keine passende Zuordnung in diesem Modell gefunden.'
        }}
        Die Hervorhebung bestätigt keinen ausgeführten Prozessschritt.
      </p>
      <BpmnDiagram
        v-if="model.hasDiagram"
        :xml="xml"
        :selected-id="selectedId"
        :highlights="highlights"
        :visible="visible"
        @select="select"
      />
      <p v-else>Dieses Modell hat keine Diagrammkoordinaten. Wähle eine Nachricht in der Liste.</p>
      <label for="bpmn-search">
        Nachricht oder BPMN-ID in diesem Modell suchen
        <input id="bpmn-search" v-model="search" type="search" maxlength="256" />
      </label>
      <ul class="bpmn-message-list">
        <li v-for="row in filtered" :key="row.elementId">
          <button
            class="button secondary"
            :aria-pressed="selectedId === row.elementId"
            :disabled="disabled"
            @click="select(row.elementId)"
          >
            {{ row.label }} · {{ labels[row.direction] }} · {{ row.elementId }}
          </button>
        </li>
      </ul>
      <p v-if="!filtered.length">Keine auswählbaren Nachrichten gefunden.</p>
      <section v-if="selected" class="tool-section" aria-labelledby="process-selection-title">
        <h3 id="process-selection-title" ref="selectionHeading" tabindex="-1">
          Ausgewählte Nachricht: {{ selected.label }}
        </h3>
        <dl>
          <dt>BPMN-Element-ID</dt>
          <dd>
            <code>{{ selected.elementId }}</code>
          </dd>
          <dt>BPMN-Nachrichtenreferenz</dt>
          <dd>
            <code>{{ selected.bpmnMessageId }}</code>
          </dd>
          <template v-if="selected.sourceId">
            <dt>Fluss</dt>
            <dd>{{ selected.sourceId }} → {{ selected.targetId }}</dd>
          </template>
        </dl>
        <form @submit.prevent="apply">
          <fieldset :disabled="disabled">
            <legend>Vereinbarte FIT-Connect-Zuordnung</legend>
            <div class="client-fields">
              <label for="bpmn-model-id">
                FIT-Connect-Modellkennung
                <input id="bpmn-model-id" v-model="modelId" required maxlength="1024" />
              </label>
              <label for="bpmn-message-id">
                FIT-Connect-Nachrichtenkennung
                <input id="bpmn-message-id" v-model="messageId" required maxlength="1024" />
              </label>
              <label for="bpmn-schema">
                Schemahinweis (optional)
                <input id="bpmn-schema" v-model="schemaUri" maxlength="4096" />
              </label>
              <label for="bpmn-mime">
                Format des Schemahinweises
                <select id="bpmn-mime" v-model="mimeType">
                  <option value="application/json">JSON</option>
                  <option value="application/xml">XML</option>
                </select>
              </label>
            </div>
            <button class="button secondary" type="submit">Kennungszuordnung übernehmen</button>
          </fieldset>
        </form>
        <p v-if="mappingDirty" role="status">
          Die eingegebenen Kennungen sind noch nicht übernommen. Bitte die Zuordnung bestätigen, bevor du
          Empfänger suchst.
        </p>
        <p v-if="currentMapping && !mappingDirty">
          Diese Auswahl steht auch beim Antworten auf eine geprüfte Einreichung bereit. Der angebotene
          Antwortkanal und seine Schemata bleiben maßgeblich.
        </p>
        <form @submit.prevent="discover()">
          <fieldset :disabled="disabled || !connected || !currentMapping || mappingDirty">
            <legend>Passende TEST-Empfänger für eine Prozess-Einreichung</legend>
            <label for="bpmn-region">
              Region
              <input id="bpmn-region" v-model="region" required pattern="DE[0-9]{0,12}" maxlength="14" />
              <small>DE für bundesweit oder eine vereinbarte Regionalkennung.</small>
            </label>
            <button class="button" type="submit">Passende Prozess-Zustellpunkte suchen</button>
          </fieldset>
        </form>
        <p v-if="!connected">
          Die lokale Modellansicht funktioniert ohne Anmeldung. Empfängersuche und Prozessversand benötigen
          eine v3-TEST-Sitzung.
        </p>
      </section>
      <section v-if="page" class="tool-section" aria-labelledby="process-results-title">
        <h3 id="process-results-title">Passende TEST-Zustellpunkte ({{ page.totalCount }})</h3>
        <p>
          Der Suchdienst liefert öffentliche Zustellpunkt-IDs. Beim Übernehmen werden die Angebote erneut
          geladen; die Versandprüfung bleibt ein eigener Schritt.
        </p>
        <article v-for="row in page.destinations" :key="row.destinationId" class="tool-section">
          <h4>
            <code>{{ row.destinationId }}</code>
          </h4>
          <ul>
            <li v-for="schema in row.schemas" :key="`${schema.schemaUri}/${schema.mimeType}`">
              {{ schema.mimeType }} · {{ schema.schemaUri }}
            </li>
          </ul>
          <button class="button secondary" :disabled="disabled" @click="send(row)">
            Als Prozess-Einreichung vorbereiten
          </button>
        </article>
        <p v-if="!page.destinations.length">
          Keine passenden öffentlichen Empfänger gefunden. Berechtigungen und Angebote des gewünschten
          TEST-Zustellpunkts prüfen.
        </p>
        <div class="client-actions">
          <button
            class="button secondary"
            :disabled="disabled || page.offset === 0"
            @click="discover(page.offset - 20)"
          >
            Vorherige Seite
          </button>
          <button
            class="button secondary"
            :disabled="
              disabled || page.offset + page.destinations.length >= page.totalCount || page.offset >= 10000
            "
            @click="discover(page.offset + 20)"
          >
            Nächste Seite
          </button>
        </div>
      </section>
    </template>
  </section>
</template>
