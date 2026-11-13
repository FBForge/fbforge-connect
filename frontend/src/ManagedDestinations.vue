<script setup>
import { reactive } from 'vue';
import { useEnvironment } from './environments.js';
const environment = useEnvironment();
import DestinationSetup from './DestinationSetup.vue';
import DestinationList from './destinations/DestinationList.vue';
import DestinationFacts from './destinations/DestinationFacts.vue';
import DestinationTemplates from './integration/DestinationTemplates.vue';
import DestinationHistory from './integration/DestinationHistory.vue';
import DestinationComparison from './integration/DestinationComparison.vue';
import DestinationCleanup from './DestinationCleanup.vue';
import DestinationOffers from './DestinationOffers.vue';
import DestinationKeyRotation from './DestinationKeyRotation.vue';
import DestinationExtraFields from './destinations/DestinationExtraFields.vue';
import { useDestinationManager } from './destinations/useDestinationManager.js';
const props = defineProps({ session: Object, busy: Boolean, creationSeed: Object });
const emit = defineEmits([
  'busy',
  'activity',
  'fatal',
  'changed',
  'receive',
  'manual',
  'backup',
  'manage-api',
]);
const controller = useDestinationManager(props, emit);
const {
  setupOpen,
  existing,
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
  backupExtras,
  backupCallback,
  nameEnabled,
  name,
  statusEnabled,
  status,
  versionsEnabled,
  versions,
  contacts,
  disabled,
  canEdit,
  managementReason,
  locked,
  changes,
  labels,
  statuses,
  messages,
  openCreated,
  search,
  toggle,

  back,
  inspect,
  edit,
  editSelection,
  prepare,
  execute,
  recover,
  cancel,
  difference,
  applyTemplate,
} = controller;
defineExpose({ controller: reactive(controller) });
</script>

<template>
  <div>
    <div class="client-actions" aria-label="Destination-Aufgabe">
      <button
        type="button"
        class="button secondary"
        :aria-pressed="!setupOpen"
        :disabled="disabled"
        @click="existing"
      >
        Bestehende Destinations
      </button>
      <button
        type="button"
        class="button secondary"
        :aria-pressed="setupOpen"
        :aria-disabled="disabled || !canEdit"
        :title="managementReason || undefined"
        :aria-describedby="managementReason ? 'destination-management-reason' : undefined"
        @click="
          if (!disabled && canEdit) {
            emit('manual');
            setupOpen = true;
          }
        "
      >
        Neue Destination anlegen
      </button>
      <slot name="navigation" />
    </div>
    <p v-if="managementReason" id="destination-management-reason" class="small-note">
      {{ managementReason }}
    </p>
    <button
      v-if="session?.apiVersion === 'v2'"
      class="button secondary"
      :disabled="disabled"
      @click="emit('manage-api')"
    >
      Mit diesen Zugangsdaten über API v3 verwalten
    </button>
    <DestinationSetup
      :seed="creationSeed"
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
      <p class="workspace-eyebrow">FIT-Connect {{ environment }}</p>
      <h2 id="manager-title" ref="listHeading" tabindex="-1">Eigene Destinations verwalten</h2>
      <p v-if="view === 'list'">
        Destinations der angemeldeten Zugangsdaten laden und einzeln oder gemeinsam bearbeiten. Bis zu zehn
        Destinations pro Änderung.
      </p>
      <p v-if="!session">Bitte zuerst eine Sitzung öffnen.</p>
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
      <DestinationList
        v-if="page && view === 'list'"
        :page="page"
        :selected="selected"
        :disabled="disabled"
        :locked="locked"
        :can-edit="canEdit"
        :can-select="session?.apiVersion === 'v3'"
        @selection="selected = $event"
        @toggle="toggle"
        @inspect="inspect"
        @edit="edit"
        @edit-selection="editSelection"
        @search="search"
        @backup="emit('backup', $event)"
      />
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
        <slot name="destination" :destination="detail" />
        <DestinationFacts :detail="detail" :labels="labels" />
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
      <DestinationHistory :session="session" :busy="disabled" />
      <form v-if="view === 'edit' && selected.length && canEdit" @submit.prevent="prepare">
        <h3 ref="editHeading" tabindex="-1">
          {{
            selected.length === 1
              ? 'Destination bearbeiten'
              : `${selected.length} Destinations gemeinsam bearbeiten`
          }}
        </h3>
        <p v-if="selected.length > 1">
          Nur angehakte Felder werden geändert. Ein leeres angehaktes Kontaktfeld entfernt diesen Kontaktwert.
          Andere Einstellungen bleiben erhalten.
        </p>
        <p v-else>
          Geänderte Felder werden in der Vorschau angezeigt. Ein geleertes Kontaktfeld entfernt den bisherigen
          Wert.
        </p>
        <ul>
          <li v-for="row in selected" :key="row.destinationId">{{ row.name || row.destinationId }}</li>
        </ul>
        <DestinationTemplates
          :session="session"
          :changes="changes"
          :disabled="disabled || locked"
          @apply="applyTemplate"
        />
        <DestinationExtraFields
          v-if="selected.length === 1 || Object.keys(backupExtras).length || backupCallback"
          v-model="backupExtras"
          :baseline="
            selected.length === 1
              ? { ...detail?.extras, contactInformation: { cc: detail?.contact.cc || [] } }
              : {}
          "
          :callback-url="backupCallback || detail?.extras?.callback?.url"
          :disabled="disabled || locked"
        />
        <fieldset :disabled="disabled || locked">
          <legend>{{ selected.length === 1 ? 'Stammdaten' : 'Gemeinsame Änderungen' }}</legend>
          <div class="client-fields">
            <div>
              <label v-if="selected.length > 1" class="destination-toggle">
                <input v-model="nameEnabled" type="checkbox" />
                Name ändern
              </label>
              <label for="manager-name">
                {{ selected.length === 1 ? 'Name' : 'Neuer Name / Vorlage' }}
                <input
                  id="manager-name"
                  v-model="name"
                  type="text"
                  maxlength="256"
                  :disabled="selected.length > 1 && !nameEnabled"
                />
              </label>
              <small v-if="selected.length > 1">
                Für Bulk-Edit z. B. „{name} – Test“. {name} übernimmt den bisherigen Namen jeder Destination.
              </small>
            </div>
            <div>
              <label v-if="selected.length > 1" class="destination-toggle">
                <input v-model="statusEnabled" type="checkbox" />
                Status ändern
              </label>
              <label for="manager-status">
                Neuer Status
                <select
                  id="manager-status"
                  v-model="status"
                  :disabled="selected.length > 1 && !statusEnabled"
                >
                  <option
                    v-if="selected.length === 1 && !['active', 'inactive'].includes(detail?.status)"
                    :value="detail?.status"
                  >
                    {{
                      { draft: 'Entwurf', created: 'Angelegt' }[detail?.status] ||
                      detail?.status ||
                      'Nicht gesetzt'
                    }}
                  </option>
                  <option value="inactive">Inaktiv</option>
                  <option value="active">Aktiv</option>
                </select>
              </label>
              <small>Es werden nur die vom Server erlaubten Statuswechsel vorbereitet.</small>
            </div>
            <div>
              <label v-if="selected.length > 1" class="destination-toggle">
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
                  :disabled="selected.length > 1 && !versionsEnabled"
                />
              </label>
              <small>
                Kommagetrennt, z. B. 2.0.0, 3.0.0. Dies beeinflusst die ausgehandelte Metadatenversion.
              </small>
            </div>
            <div v-for="(field, key) in contacts" :key="key">
              <label v-if="selected.length > 1" class="destination-toggle">
                <input v-model="field.enabled" type="checkbox" />
                {{ labels[key] }} ändern
              </label>
              <label :for="`manager-${key}`">
                {{ selected.length === 1 ? labels[key] : 'Neuer Wert' }}
                <textarea
                  v-if="key === 'address'"
                  :id="`manager-${key}`"
                  v-model="field.value"
                  maxlength="2048"
                  rows="3"
                  :disabled="selected.length > 1 && !field.enabled"
                ></textarea>
                <input
                  v-else
                  :id="`manager-${key}`"
                  v-model="field.value"
                  type="text"
                  maxlength="256"
                  :disabled="selected.length > 1 && !field.enabled"
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
            <h4>Angebote</h4>
            <label class="destination-toggle">
              <input v-model="offersEnabled" type="checkbox" />
              Leistungen, Schemata und Prozessnachrichten bearbeiten
            </label>
            <DestinationOffers
              :session="session"
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
          <DestinationComparison :before="row.before" :after="row.after" />
          <template v-if="row.after.publicServices || row.after.processMessages">
            <h5>Angebote nach der Änderung</h5>
            <DestinationOffers
              :session="session"
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
            Diese Änderungen verbindlich in der gewählten Umgebung speichern
          </button>
          <button class="button secondary" :disabled="disabled" @click="cancel">Abbrechen</button>
        </div>
      </section>
    </section>
  </div>
</template>
