<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import DestinationSetup from './DestinationSetup.vue';
import DestinationCleanup from './DestinationCleanup.vue';
import DestinationOffers from './DestinationOffers.vue';
import DestinationKeyRotation from './DestinationKeyRotation.vue';
import { invoke } from './native.js';
import { listDestinations } from './resources.js';
import {
  loadManagedDestination,
  prepareDestinationUpdate,
  executeDestinationUpdate,
  cancelDestinationUpdate,
  destinationUpdateState,
} from './destination-management.js';
import { errorMessage, diagnosticCode } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
const props = defineProps({ session: Object, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'changed', 'receive']);
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
    resultStatus = 'Fehlgeschlagen';
    if (stamp === generation)
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
        preview.value = { ...confirmed, status: 'uncertain' };
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
</script>

<template>
  <div>
    <div class="client-actions" aria-label="Destination-Aufgabe">
      <button
        type="button"
        class="button secondary"
        :aria-pressed="!setupOpen"
        :disabled="disabled"
        @click="setupOpen = false"
      >
        Bestehende Destinations
      </button>
      <button
        type="button"
        class="button secondary"
        :aria-pressed="setupOpen"
        v-if="canEdit"
        :disabled="disabled"
        @click="setupOpen = true"
      >
        Neue TEST-Destination anlegen
      </button>
    </div>
    <DestinationSetup
      v-show="setupOpen"
      :session="session"
      :busy="busy || pending"
      @busy="(value) => emit('busy', value)"
      @activity="(value) => emit('activity', value)"
      @fatal="(value) => emit('fatal', value)"
      @changed="emit('changed')"
      @created="openCreated"
      @receive="(id) => emit('receive', id)"
    />
    <section v-show="!setupOpen" class="tool-section" aria-labelledby="manager-title" :aria-busy="pending">
      <p v-if="setupNotice" role="status">{{ setupNotice }}</p>
      <h2 id="manager-title" ref="listHeading" tabindex="-1">Eigene Destinations verwalten</h2>
      <p v-if="view === 'list'">
        Destinations der angemeldeten TEST-Zugangsdaten laden und einzeln oder gemeinsam bearbeiten. Bis zu
        zehn Destinations pro Änderung.
      </p>
      <p v-if="!session">Bitte zuerst eine TEST-Sitzung öffnen.</p>
      <p v-else-if="session.apiVersion === 'v2'">
        Die Bearbeitung steht zunächst über API v3 bereit. Sie können eigene Destinations mit v2 ansehen oder
        oben eine v3-Sitzung öffnen.
      </p>
      <p v-if="session?.apiVersion === 'v3' && !canEdit" role="status">
        Diese Verbindung erlaubt nur das Ansehen der Destinations. Für Änderungen wird die Berechtigung
        manage-destinations benötigt.
      </p>
      <div v-show="view === 'list'" class="client-actions">
        <button class="button" :disabled="disabled" @click="search()">Eigene Destinations laden</button>
        <button
          v-if="preview && ['uncertain', 'running'].includes(preview.status)"
          class="button secondary"
          :disabled="disabled"
          @click="recover"
        >
          Ergebnis abrufen
        </button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="pending" role="status">Aktion wird ausgeführt …</p>
      <template v-if="page && view === 'list'">
        <p role="status">
          {{ page.totalCount }} eigene Destinations
          <span v-if="canEdit">· {{ selected.length }} von höchstens 10 ausgewählt</span>
        </p>
        <div
          v-if="canEdit && selected.length"
          class="client-actions destination-selection-actions"
          aria-label="Ausgewählte Destinations"
        >
          <button class="button" :disabled="disabled || locked" @click="editSelection">
            {{ selected.length }}
            {{ selected.length === 1 ? 'Destination bearbeiten' : 'Destinations gemeinsam bearbeiten' }}
          </button>
          <button class="button secondary" :disabled="disabled || locked" @click="selected = []">
            Auswahl aufheben
          </button>
        </div>
        <div class="client-table support-table">
          <table class="submission-result-table destination-manager-table">
            <thead>
              <tr>
                <th v-if="canEdit" scope="col">Auswahl</th>
                <th scope="col">Name / Destination</th>
                <th scope="col">Status</th>
                <th scope="col">Aktion</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in page.destinations" :key="row.destinationId">
                <td v-if="canEdit" data-label="Auswahl">
                  <input
                    type="checkbox"
                    :aria-label="`${row.name || row.destinationId} auswählen`"
                    :checked="selected.some((item) => item.destinationId === row.destinationId)"
                    :disabled="
                      disabled ||
                      locked ||
                      (!selected.some((item) => item.destinationId === row.destinationId) &&
                        selected.length >= 10)
                    "
                    @change="toggle(row, $event.target.checked)"
                  />
                </td>
                <td data-label="Name / Destination">
                  {{ row.name || 'Ohne Namen' }}
                  <br />
                  <code>{{ row.destinationId }}</code>
                </td>
                <td data-label="Status">{{ row.status || 'Unbekannt' }}</td>
                <td data-label="Aktion">
                  <div class="client-actions">
                    <button
                      class="button secondary"
                      :data-open-destination="row.destinationId"
                      :disabled="disabled"
                      @click="inspect(row)"
                    >
                      Ansehen
                    </button>
                    <button
                      v-if="canEdit && !locked && selected.length < 2"
                      class="button secondary"
                      :data-edit-destination="row.destinationId"
                      :disabled="disabled"
                      @click="edit(row)"
                    >
                      Bearbeiten
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="client-actions">
          <button
            class="button secondary"
            :disabled="disabled || page.offset === 0"
            @click="search(page.offset - 20)"
          >
            Vorherige Seite
          </button>
          <button
            class="button secondary"
            :disabled="
              disabled || page.offset + page.destinations.length >= page.totalCount || page.offset >= 10000
            "
            @click="search(page.offset + 20)"
          >
            Nächste Seite
          </button>
        </div>
      </template>
      <div v-if="view !== 'list'" class="client-actions">
        <button class="button secondary" type="button" :disabled="disabled" @click="back">
          Zur Destination-Übersicht
        </button>
      </div>
      <section v-if="detail && view === 'detail'" aria-labelledby="manager-detail-title">
        <h3 id="manager-detail-title" ref="detailHeading" tabindex="-1">
          {{ detail.name || 'Destination ansehen' }}
        </h3>
        <p>
          <code>{{ detail.destinationId }}</code>
        </p>
        <dl>
          <dt>Status</dt>
          <dd>{{ detail.status }}</dd>
          <dt>Metadatenversionen</dt>
          <dd>{{ detail.metadataVersions.join(', ') }}</dd>
          <template v-for="(value, key) in detail.contact" :key="key">
            <dt>{{ labels[key] }}</dt>
            <dd class="receipt-description">
              {{ Array.isArray(value) ? value.join(', ') : value || 'Nicht gesetzt' }}
            </dd>
          </template>
        </dl>
        <button
          v-if="canEdit && !locked"
          class="button"
          type="button"
          :disabled="disabled"
          @click="edit(detail)"
        >
          {{ selected.length > 1 ? 'Auswahl gemeinsam bearbeiten' : 'Destination bearbeiten' }}
        </button>
      </section>
      <form v-if="view === 'edit' && selected.length && canEdit" @submit.prevent="prepare">
        <h3 ref="editHeading" tabindex="-1">
          {{
            selected.length === 1
              ? 'Destination bearbeiten'
              : `${selected.length} Destinations gemeinsam bearbeiten`
          }}
        </h3>
        <p>
          Nur angehakte Felder werden geändert. Ein leeres angehaktes Kontaktfeld entfernt diesen Kontaktwert.
          Andere Einstellungen bleiben erhalten.
        </p>
        <ul>
          <li v-for="row in selected" :key="row.destinationId">{{ row.name || row.destinationId }}</li>
        </ul>
        <fieldset :disabled="disabled || locked">
          <legend>Gemeinsame Änderungen</legend>
          <div class="client-fields">
            <div>
              <label class="destination-toggle">
                <input v-model="nameEnabled" type="checkbox" />
                Name ändern
              </label>
              <label for="manager-name">
                Neuer Name / Vorlage
                <input
                  id="manager-name"
                  v-model="name"
                  type="text"
                  maxlength="256"
                  :disabled="!nameEnabled"
                />
              </label>
              <small>
                Für Bulk-Edit z. B. „{name} – Test“. {name} übernimmt den bisherigen Namen jeder Destination.
              </small>
            </div>
            <div>
              <label class="destination-toggle">
                <input v-model="statusEnabled" type="checkbox" />
                Status ändern
              </label>
              <label for="manager-status">
                Neuer Status
                <select id="manager-status" v-model="status" :disabled="!statusEnabled">
                  <option value="inactive">Inaktiv</option>
                  <option value="active">Aktiv</option>
                </select>
              </label>
              <small>Es werden nur die vom Server erlaubten Statuswechsel vorbereitet.</small>
            </div>
            <div>
              <label class="destination-toggle">
                <input v-model="versionsEnabled" type="checkbox" />
                Metadatenversionen ändern
              </label>
              <label for="manager-versions">
                Neue Metadatenversionen
                <input
                  id="manager-versions"
                  v-model="versions"
                  type="text"
                  maxlength="256"
                  :disabled="!versionsEnabled"
                />
              </label>
              <small>
                Kommagetrennt, z. B. 2.0.0, 3.0.0. Dies beeinflusst die ausgehandelte Metadatenversion.
              </small>
            </div>
            <div v-for="(field, key) in contacts" :key="key">
              <label class="destination-toggle">
                <input v-model="field.enabled" type="checkbox" />
                {{ labels[key] }} ändern
              </label>
              <label :for="`manager-${key}`">
                Neuer Wert
                <textarea
                  v-if="key === 'address'"
                  :id="`manager-${key}`"
                  v-model="field.value"
                  maxlength="2048"
                  rows="3"
                  :disabled="!field.enabled"
                ></textarea>
                <input
                  v-else
                  :id="`manager-${key}`"
                  v-model="field.value"
                  type="text"
                  maxlength="256"
                  :disabled="!field.enabled"
                />
              </label>
            </div>
          </div>
          <template
            v-if="
              selected.length === 1 &&
              detail?.destinationId === selected[0].destinationId &&
              detail.type === 'A' &&
              detail.offers
            "
          >
            <label class="destination-toggle">
              <input v-model="offersEnabled" type="checkbox" />
              Leistungen, Schemata und Prozessnachrichten bearbeiten
            </label>
            <DestinationOffers
              v-if="offersEnabled"
              v-model="offers"
              :disabled="disabled || locked"
              prefix="manager-offer"
            />
            <p v-if="offersEnabled">
              Diese Listen ersetzen die Angebote dieser Destination. Entfernte Angebote stehen danach für neue
              Nachrichten nicht mehr zur Verfügung. Andere Einstellungen bleiben erhalten.
            </p>
          </template>
          <button class="button" type="submit" :disabled="!Object.keys(changes).length">
            Änderungsvorschau erstellen
          </button>
        </fieldset>
      </form>
      <DestinationCleanup
        v-if="
          view === 'edit' &&
          canEdit &&
          selected.length === 1 &&
          detail?.destinationId === selected[0].destinationId &&
          ['draft', 'created'].includes(detail.status)
        "
        :session="session"
        :destination="detail"
        :busy="busy || pending || locked || preview?.status === 'prepared'"
        @busy="(value) => emit('busy', value)"
        @activity="(value) => emit('activity', value)"
        @fatal="(value) => emit('fatal', value)"
        @changed="emit('changed')"
      />
      <DestinationKeyRotation
        v-if="view === 'edit' && canEdit && selected.length"
        :session="session"
        :selected="selected"
        :busy="busy || pending || locked || preview?.status === 'prepared'"
        @busy="(value) => emit('busy', value)"
        @activity="(value) => emit('activity', value)"
        @fatal="(value) => emit('fatal', value)"
        @changed="emit('changed')"
        @receive="(id) => emit('receive', id)"
      />
      <section v-if="preview" class="tool-section" aria-labelledby="update-preview-title">
        <h3 id="update-preview-title" ref="previewHeading" tabindex="-1">
          {{ statuses[preview.status] || preview.status }}
        </h3>
        <p v-if="preview.status === 'prepared'">
          Noch nichts gespeichert. Prüfen Sie die Werte für jede Destination. Die Vorschau gilt zwei Minuten.
          Vor dem Speichern werden alle ausgewählten Destinations erneut auf zwischenzeitliche Änderungen
          geprüft.
        </p>
        <p v-if="preview.status === 'uncertain'">
          Der Ausgang mindestens einer Änderung ist ungewiss. Es wird nichts automatisch wiederholt. Rufen Sie
          das Ergebnis ab und laden Sie die Destinations neu. Weitere Schreibversuche sind in dieser Sitzung
          gesperrt.
        </p>
        <p v-if="preview.status === 'conflict'">{{ messages.destination_conflict }}</p>
        <article v-for="row in preview.changes" :key="row.destinationId" class="tool-section">
          <h4>{{ row.name || row.destinationId }} · {{ statuses[row.status] }}</h4>
          <p>
            <code>{{ row.destinationId }}</code>
          </p>
          <p v-if="row.error" role="status">
            {{ messages[row.error] || 'Änderung nicht bestätigt. Bitte die Destination neu laden.' }}
          </p>
          <template v-if="row.after.publicServices || row.after.processMessages">
            <h5>Angebote nach der Änderung</h5>
            <DestinationOffers
              :model-value="{
                publicServices: row.after.publicServices || [],
                processMessages: row.after.processMessages || [],
              }"
              disabled
              :prefix="`preview-${row.destinationId}`"
            />
          </template>
          <dl v-for="change in difference(row)" :key="change.field">
            <dt>{{ change.field }}</dt>
            <dd>
              {{ change.before }} →
              <strong>{{ change.after }}</strong>
            </dd>
          </dl>
        </article>
        <div v-if="preview.status === 'prepared'" class="client-actions">
          <button
            class="button"
            :disabled="disabled || preview.changes.every((row) => row.status === 'unchanged')"
            @click="execute"
          >
            Diese Änderungen verbindlich auf TEST speichern
          </button>
          <button class="button secondary" :disabled="disabled" @click="cancel">Abbrechen</button>
        </div>
      </section>
    </section>
  </div>
</template>
