<script setup>
import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from './native.js';
import { listCases, caseParts, readCaseFile, caseRequest, caseStatus } from './cases.js';
import { createPreview, disposePreview, canPreview } from './submission-preview.js';
import { errorMessage } from './diagnostics.js';
import { SCHEMA_VIEW_BYTES } from './schema-annotations.js';
import { structuredFormat, STRUCTURED_BYTES } from './structured-data.js';
import StructuredData from './StructuredData.vue';
import ContentPreview from './ContentPreview.vue';
const props = defineProps({ session: Object, busy: Boolean, visible: Boolean });
const emit = defineEmits(['busy', 'receive', 'event-log', 'help']);
const records = shallowRef([]),
  selected = shallowRef(null),
  parts = shallowRef([]),
  application = shallowRef(null),
  preview = shallowRef(null);
const search = ref(''),
  direction = ref('all'),
  pending = ref(false),
  error = ref(''),
  notice = ref(''),
  persistent = ref(false),
  canPersist = ref(false),
  clearDialog = ref(null),
  detailHeading = ref(null),
  searchBox = ref(null);
const filtered = computed(() =>
  records.value
    .filter(
      (r) =>
        (direction.value === 'all' || r.direction === direction.value) &&
        [r.title, r.caseId, r.submissionId, r.replyId, r.destinationId]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('de')
          .includes(search.value.trim().toLocaleLowerCase('de')),
    )
    .toSorted((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
);
const disabled = computed(() => pending.value || props.busy || !props.session);
const attachments = computed(() => parts.value.filter((p) => p.kind === 'attachment'));
let generation = 0,
  controller,
  downloadUrl,
  downloadTimer;
const bytesLabel = (size) => `${(size / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KiB`;
const when = (value) => new Date(value).toLocaleString('de-DE');
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
    if (stamp === generation) error.value = errorMessage(cause);
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
  [() => props.session?.sessionId, () => props.visible],
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
function closeCase() {
  reset();
  opener?.focus();
}
function open(record) {
  opener = document.activeElement;
  reset();
  void run(async (session, current) => {
    const rows = await caseParts(invoke, session, record.recordId);
    const data = rows.find((p) => p.kind === 'data');
    const format = data && structuredFormat({ filename: data.fileName || '', mimeType: data.mimeType || '' });
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
function remove(record) {
  void run(async (session) => {
    await caseRequest(invoke, session, 'delete', { recordId: record.recordId });
    if (selected.value?.recordId === record.recordId) reset();
    await refresh(session);
    notice.value = 'Lokale Kopie gelöscht. Der Serverbestand bleibt unverändert.';
    await nextTick();
    searchBox.value?.focus();
  });
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
    await caseRequest(invoke, session, 'storage', { persistent: enabled });
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
</script>
<template>
  <div class="case-workspace">
    <section class="tool-section" aria-labelledby="case-list-title">
      <div class="tool-section-heading">
        <div>
          <h2 id="case-list-title">Meine Vorgänge</h2>
          <p>
            Gesendete und empfangene Nachrichten als lokale Kopien – auch nach dem Annehmen oder Ablehnen.
          </p>
        </div>
        <button class="button secondary" type="button" @click="emit('help', 'cases')">
          Hilfe zu Vorgängen
        </button>
      </div>
      <p v-if="!session">
        Verbinde zuerst das gewünschte TEST-Profil. Die Übersicht zeigt ausschließlich dessen API und Zugang.
      </p>
      <p class="small-note">
        {{
          persistent
            ? 'Geschützt auf diesem Windows-Benutzerkonto gespeichert.'
            : 'Standard: nur für die laufende Anwendungssitzung. Beim Beenden gehen ungespeicherte Kopien verloren.'
        }}
        Ein Profilwechsel löscht keine Sitzungskopien. Nach erneutem Verbinden mit demselben Zugang sind sie
        wieder sichtbar.
      </p>
      <label class="checkbox-label">
        <input type="checkbox" :checked="persistent" :disabled="disabled || !canPersist" @change="storage" />
        Vorgänge für dieses gespeicherte Profil dauerhaft aufbewahren
      </label>
      <p v-if="!canPersist" class="small-note">
        Dauerhafte Aufbewahrung erfordert ein gespeichertes Profil und den geschützten Windows-Speicher.
      </p>
      <div class="case-filters client-fields">
        <label>
          Vorgänge durchsuchen
          <input
            ref="searchBox"
            v-model="search"
            type="search"
            placeholder="Titel, Vorgangs- oder Nachrichten-ID"
          />
        </label>
        <label>
          Nachrichten
          <select v-model="direction">
            <option value="all">Alle Nachrichten</option>
            <option value="received">Empfangen</option>
            <option value="sent">Gesendet</option>
          </select>
        </label>
      </div>
      <div class="client-actions">
        <button class="button secondary" type="button" :disabled="disabled" @click="load">
          Übersicht aktualisieren
        </button>
        <button
          class="button secondary"
          type="button"
          :disabled="disabled || !records.length"
          @click="clearDialog.showModal()"
        >
          Verlauf leeren
        </button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="pending" role="status">Vorgangsablage wird bearbeitet …</p>
      <p v-if="!filtered.length && !pending">
        {{
          records.length
            ? 'Keine Vorgänge passen zur Suche.'
            : 'Noch keine Vorgänge vorhanden. Sende eine Nachricht oder öffne und prüfe eine empfangene Einreichung.'
        }}
      </p>
      <ul v-else class="case-list" aria-label="Lokale Vorgänge">
        <li
          v-for="record in filtered"
          :key="record.recordId"
          :class="{ 'case-selected': selected?.recordId === record.recordId }"
        >
          <div>
            <span class="small-note">
              {{ record.direction === 'received' ? 'Empfangen' : 'Gesendet' }} ·
              {{ record.kind === 'reply' ? 'Antwort' : 'Einreichung' }} ·
              {{ record.createdAt ? when(record.createdAt) : 'Zeitpunkt nicht lesbar' }}
            </span>
            <h3>
              <button
                class="case-open"
                type="button"
                :disabled="disabled || record.available === false"
                @click="open(record)"
              >
                {{ record.title }}
              </button>
            </h3>
            <span class="status-badge info">{{ caseStatus(record.status) }}</span>
            <span class="small-note">
              {{ record.attachmentCount }} Anlagen · {{ bytesLabel(record.totalBytes)
              }}{{ record.archived ? ' · Gespeicherte Kopie' : '' }}
            </span>
            <p v-if="record.caseId" class="small-note case-identifier">Vorgang: {{ record.caseId }}</p>
            <p v-else class="small-note">Lokaler Versuch – noch keine bestätigte Vorgangs-ID.</p>
          </div>
          <button
            class="button secondary"
            type="button"
            :aria-label="`Lokale Kopie löschen: ${record.title}`"
            :disabled="disabled"
            @click="remove(record)"
          >
            Löschen
          </button>
        </li>
      </ul>
    </section>
    <section v-if="selected" class="tool-section case-detail" aria-labelledby="case-detail-title">
      <div class="tool-section-heading">
        <div>
          <h2 id="case-detail-title" ref="detailHeading" tabindex="-1">{{ selected.title }}</h2>
          <p>{{ caseStatus(selected.status) }} · {{ when(selected.createdAt) }}</p>
        </div>
        <button class="button secondary" type="button" :disabled="disabled" @click="closeCase">
          Antrag schließen
        </button>
      </div>
      <p class="small-note">
        Lokale Kopie. Prüfergebnisse stammen vom damaligen Abruf; Serverzustand und Berechtigungen werden
        dadurch nicht erneut bestätigt.
      </p>
      <p v-if="selected.status === 'uncertain'" role="status">
        Der Ausgang ist ungewiss. Bitte im Event Log prüfen. Es wird nicht automatisch erneut gesendet.
      </p>
      <p v-for="warning in selected.warnings" :key="warning">
        Prüfhinweis:
        {{
          warning === 'MALWARE_SCAN_NOT_CONFIGURED'
            ? 'Kein Malwarescanner eingerichtet.'
            : warning === 'XML_SCHEMA_NOT_CHECKED'
              ? 'XML-Syntax geprüft; keine XSD-Prüfung durchgeführt.'
              : warning
        }}
      </p>
      <StructuredData
        v-if="application"
        :text="application.text"
        :format="application.format"
        :schema-document="application.schemaDocument"
        :schema-uri="application.schemaUri"
      />
      <p v-else>
        Für diese Fachdaten ist keine Formularansicht verfügbar oder die Grenze von 256 KiB wurde
        überschritten. Das Original ist unter „Technische Inhalte“ verfügbar.
      </p>
      <h3>Anlagen</h3>
      <p v-if="!attachments.length">Keine Anlagen vorhanden.</p>
      <ul class="case-attachments">
        <li v-for="part in attachments" :key="part.contentId">
          <div>
            <strong>{{ part.fileName || 'Anlage' }}</strong>
            <p v-if="part.description">{{ part.description }}</p>
            <span class="small-note">{{ part.mimeType }} · {{ bytesLabel(part.totalBytes) }}</span>
          </div>
          <div class="client-actions">
            <button
              v-if="canPreview(part)"
              type="button"
              class="button secondary"
              :disabled="disabled"
              @click="inspect(part)"
            >
              Ansehen
            </button>
            <button type="button" class="button secondary" :disabled="disabled" @click="inspect(part, true)">
              Original herunterladen
            </button>
          </div>
        </li>
      </ul>
      <div class="client-actions">
        <button
          v-if="selected.caseId"
          class="button secondary"
          type="button"
          :disabled="disabled"
          @click="
            emit('event-log', {
              apiVersion: session.apiVersion,
              sessionId: session.sessionId,
              caseId: selected.caseId,
            })
          "
        >
          Vorgangs-Event-Log öffnen
        </button>
        <button
          v-if="selected.direction === 'received' && selected.kind === 'submission'"
          class="button secondary"
          type="button"
          :disabled="disabled"
          @click="emit('receive', selected)"
        >
          Im Empfang erneut prüfen / antworten
        </button>
      </div>
      <p class="small-note">
        Annehmen, Ablehnen und Antworten erfordern einen aktuellen Abruf mit gültigen Schlüsseln. Bereits
        bestätigte Nachrichten sind serverseitig möglicherweise nicht mehr abrufbar.
      </p>
      <details>
        <summary>Technische Inhalte und Kennungen</summary>
        <dl>
          <dt>Vorgang</dt>
          <dd>{{ selected.caseId || 'Noch nicht bekannt' }}</dd>
          <dt>Einreichung</dt>
          <dd>{{ selected.submissionId || '–' }}</dd>
          <dt>Antwort</dt>
          <dd>{{ selected.replyId || '–' }}</dd>
          <dt>Zustellpunkt</dt>
          <dd>{{ selected.destinationId || '–' }}</dd>
        </dl>
        <ul>
          <li v-for="part in parts" :key="part.contentId">
            <span>
              {{ part.kind === 'schema' ? 'Verwendetes Schema' : part.fileName }} ·
              {{ bytesLabel(part.totalBytes) }}
            </span>
            <button class="button secondary" type="button" :disabled="disabled" @click="inspect(part, true)">
              Herunterladen
            </button>
          </li>
        </ul>
      </details>
    </section>
    <ContentPreview v-if="preview" :preview="preview" @close="closePreview" />
    <dialog
      ref="clearDialog"
      class="tool-dialog"
      aria-labelledby="clear-cases-title"
      @cancel="clearDialog.close()"
    >
      <h2 id="clear-cases-title">Lokalen Verlauf leeren?</h2>
      <p>
        Alle Sitzungskopien und dauerhaft gespeicherten Vorgänge des aktuellen Profils und dieser API werden
        gelöscht. Profile, Schlüssel und Nachrichten auf dem TEST-Server bleiben erhalten. Das Löschen kann
        nicht rückgängig gemacht werden.
      </p>
      <div class="client-actions">
        <button class="button secondary" type="button" autofocus @click="clearDialog.close()">
          Abbrechen
        </button>
        <button class="button" type="button" :disabled="disabled" @click="clear">
          Lokalen Verlauf löschen
        </button>
      </div>
    </dialog>
  </div>
</template>
