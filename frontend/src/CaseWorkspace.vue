<script setup>
import { defaultCaseMessage } from './case-groups.js';
import DocumentLayout from './DocumentLayout.vue';
import AttachmentList from './AttachmentList.vue';
import MessageDownload from './MessageDownload.vue';
import BlockedAttachments from './BlockedAttachments.vue';
import { exportSource } from './message-export.js';
import CopyValue from './CopyValue.vue';
import DocumentationLink from './DocumentationLink.vue';
import { serviceLabel } from './service-label.js';

import { caseStatus } from './cases.js';
import StructuredData from './StructuredData.vue';
import ContentPreview from './ContentPreview.vue';
import { useCaseWorkspace } from './cases/useCaseWorkspace.js';
const props = defineProps({ session: Object, busy: Boolean, visible: Boolean });
const emit = defineEmits(['busy', 'receive', 'event-log']);
const controller = useCaseWorkspace(props, emit);
const {
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
  blockedAttachments,
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
} = controller;
</script>
<template>
  <div class="case-workspace">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="pending" role="status">Vorgangsablage wird bearbeitet …</p>
    <section v-show="!selected" class="tool-section" aria-labelledby="case-list-title">
      <div class="tool-section-heading">
        <div>
          <h2 id="case-list-title">Meine Vorgänge</h2>
          <p>
            Gesendete und empfangene Nachrichten als lokale Kopien – auch nach dem Annehmen oder Ablehnen.
          </p>
        </div>
        <DocumentationLink topic="cases">Hilfe zu Vorgängen</DocumentationLink>
      </div>
      <p v-if="!session">
        Verbinden Sie zuerst das gewünschte Profil. Die Übersicht zeigt ausschließlich dessen API und Zugang.
      </p>
      <details class="case-storage">
        <summary>
          {{ persistent ? 'Geschützte Aufbewahrung aktiv' : 'Aufbewahrung: aktuelle Sitzung' }}
        </summary>
        <p class="small-note">
          {{
            persistent
              ? 'Vorgänge werden standardmäßig geschützt für dieses gespeicherte Profil aufbewahrt. Wenn Sie die Aufbewahrung abwählen, gelten neue Kopien nur für diese Sitzung.'
              : 'Neue Vorgangskopien bleiben nur für die laufende Anwendungssitzung. Beim Beenden gehen ungespeicherte Kopien verloren.'
          }}
          Ein Profilwechsel löscht keine Sitzungskopien. Nach erneutem Verbinden mit demselben Zugang sind sie
          wieder sichtbar.
        </p>
        <label class="checkbox-label">
          <input
            type="checkbox"
            :checked="persistent"
            :disabled="disabled || !canPersist"
            @change="storage"
          />
          Vorgänge für dieses gespeicherte Profil dauerhaft aufbewahren
        </label>
        <p v-if="canPersist" class="small-note">
          Ihre Auswahl wird für dieses Profil und diese API gespeichert. Bereits dauerhaft gespeicherte Kopien
          bleiben bis zum Löschen erhalten.
        </p>
        <p v-if="!canPersist" class="small-note">
          Dauerhafte Aufbewahrung erfordert ein gespeichertes Profil und den geschützten Windows-Speicher.
        </p>
      </details>
      <div class="case-filters client-fields">
        <label>
          Vorgänge durchsuchen
          <input
            ref="searchBox"
            v-model="search"
            type="search"
            placeholder="Titel, Case ID, Submission ID oder Reply ID"
          />
        </label>
        <label for="case-direction">
          Nachrichten
          <select id="case-direction" v-model="direction">
            <option value="all">Alle Nachrichten</option>
            <option value="received">Empfangen</option>
            <option value="sent">Gesendet</option>
          </select>
        </label>
      </div>
      <label class="checkbox-label case-attention-filter">
        <input v-model="attentionOnly" type="checkbox" />
        Nur Vorgänge mit Klärungsbedarf
      </label>
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
      <div v-if="!filtered.length && !pending">
        <p>
          {{
            records.length
              ? 'Keine Vorgänge passen zur Suche oder den gewählten Filtern.'
              : 'Noch keine Vorgänge vorhanden. Senden Sie eine Nachricht oder öffnen und prüfen Sie eine empfangene Einreichung.'
          }}
        </p>
        <button
          v-if="records.length"
          class="button secondary"
          type="button"
          :disabled="disabled"
          @click="resetFilters"
        >
          Suche und Filter zurücksetzen
        </button>
      </div>
      <ul v-else class="case-list" aria-label="Lokale Vorgänge">
        <li v-for="group in filtered" :key="group.key">
          <div class="case-row">
            <span class="small-note case-row-time">Letzte Aktivität: {{ when(group.latest.createdAt) }}</span>
            <h3 class="case-row-title">
              <button
                class="case-open"
                type="button"
                :disabled="disabled || !defaultCaseMessage(group)"
                @click="openGroup(group, $event)"
              >
                {{
                  /^urn:de:fim:leika:leistung:/i.test(group.title)
                    ? serviceLabel(group.title).title
                    : group.title
                }}
              </button>
            </h3>
            <div class="case-metadata">
              <span>
                {{ group.messages.length }} {{ group.messages.length === 1 ? 'Nachricht' : 'Nachrichten' }}
              </span>
              <span>
                {{ group.messages.filter((record) => record.direction === 'received').length }} empfangen
              </span>
              <span>
                {{ group.messages.filter((record) => record.direction === 'sent').length }} gesendet
              </span>
            </div>
            <p v-if="group.attention.length" class="case-attention" role="status">
              {{ group.attention.length }}
              {{ group.attention.length === 1 ? 'Nachricht erfordert' : 'Nachrichten erfordern' }} Ihre
              Aufmerksamkeit. Einzelheiten im Verlauf.
            </p>
            <p v-if="group.caseId" class="small-note case-identifier">Case ID: {{ group.caseId }}</p>
            <p v-else class="small-note">Lokaler Versuch – noch keine bestätigte Case ID.</p>
            <details class="case-message-copies">
              <summary>Einzelne lokale Kopien verwalten</summary>
              <ul>
                <li v-for="record in group.messages" :key="record.recordId">
                  <span>
                    {{ record.direction === 'received' ? 'Empfangen' : 'Gesendet' }}:
                    {{ record.kind === 'reply' ? 'Antwort' : 'Einreichung' }} ·
                    {{ caseStatus(record.status) }} · {{ when(record.createdAt) }}
                  </span>
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
            </details>
          </div>
        </li>
      </ul>
    </section>
    <section v-if="selected" class="tool-section case-detail" aria-labelledby="case-detail-title">
      <div class="tool-section-heading">
        <div>
          <h2 id="case-detail-title" ref="detailHeading" tabindex="-1">
            {{
              /^urn:de:fim:leika:leistung:/i.test(selectedGroup?.title || selected.title)
                ? serviceLabel(selectedGroup?.title || selected.title).title
                : selectedGroup?.title || selected.title
            }}
          </h2>
          <p>
            {{ selected.direction === 'received' ? 'Empfangen' : 'Gesendet' }}:
            {{ selected.kind === 'reply' ? 'Antwort' : 'Einreichung' }} · {{ when(selected.createdAt) }}
          </p>
        </div>
        <button class="button secondary" type="button" :disabled="disabled" @click="closeCase">
          Zur Vorgangsübersicht
        </button>
      </div>
      <nav v-if="selectedGroup" class="case-timeline" aria-label="Nachrichten im Vorgang">
        <ol>
          <li v-for="record in selectedGroup.messages" :key="record.recordId">
            <button
              class="button secondary"
              type="button"
              :aria-current="record.recordId === selected.recordId ? 'true' : undefined"
              :disabled="disabled || record.available === false"
              @click="open(record)"
            >
              <strong>
                {{ record.direction === 'received' ? 'Empfangen' : 'Gesendet' }}:
                {{ record.kind === 'reply' ? 'Antwort' : 'Einreichung' }}
              </strong>
              <span>{{ when(record.createdAt) }}</span>
              <span>
                {{ caseStatus(record.status)
                }}{{ record.available === false ? ' · Inhalt nicht verfügbar' : '' }}
              </span>
            </button>
          </li>
        </ol>
      </nav>
      <p class="case-current-status">
        Status dieser Nachricht:
        <strong>{{ caseStatus(selected.status) }}</strong>
      </p>
      <p class="small-note">
        Lokale Kopie. Prüfergebnisse stammen vom damaligen Abruf. Serverzustand und Berechtigungen werden
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
            : warning === 'MALWARE_ATTACHMENT_BLOCKED'
              ? 'Anlagen wurden vom Virenscan gesperrt. Die betroffenen Dateien bleiben unzugänglich.'
              : warning === 'MALWARE_SCAN_PASSED'
                ? 'Metadaten, Fachdaten und Anlagen wurden vom eingerichteten Scanner freigegeben.'
                : warning === 'DATA_SCHEMA_INVALID'
                  ? 'Die Fachdaten weichen vom Schema ab. Bitte die angezeigten Fehler prüfen.'
                  : warning === 'XML_SCHEMA_NOT_CHECKED'
                    ? 'XML-Syntax geprüft. Keine XSD-Prüfung durchgeführt.'
                    : warning
        }}
      </p>
      <BlockedAttachments :items="blockedAttachments" />
      <DocumentLayout>
        <template #data>
          <div class="tool-section-heading">
            <div>
              <h3>Fachdaten</h3>
              <p>Inhalt der gespeicherten Nachricht</p>
            </div>
          </div>
          <StructuredData
            v-if="application"
            :text="application.text"
            :format="application.format"
            :schema-document="application.schemaDocument"
            :schema-uri="application.schemaUri"
          />
          <p v-else-if="!hasPlaintext">
            Für diese Kopie wurden noch keine entschlüsselten Fachdaten gespeichert. Die
            Transportinformationen stehen unter „Technische Inhalte und Kennungen“. Prüfen Sie die Nachricht
            im Empfang, wenn sie noch auf dem Server verfügbar ist.
          </p>
          <p v-else>
            Für diese Fachdaten ist keine Formularansicht verfügbar oder die Grenze von 256 KiB wurde
            überschritten. Das Original ist unter „Technische Inhalte“ verfügbar.
          </p>
        </template>
        <template #aside>
          <MessageDownload
            :session="session"
            :source="exportSource(selected, selected.kind === 'reply')"
            :blocked="selected.warnings.includes('MALWARE_ATTACHMENT_BLOCKED')"
            :disabled="disabled || !hasPlaintext"
            @busy="emit('busy', $event)"
          />
          <div v-if="!hasPlaintext" class="small-note" role="status">
            <p>Für diese lokale Kopie sind noch keine entschlüsselten Fachdaten verfügbar.</p>
            <button
              v-if="selected.direction === 'received' && selected.kind === 'submission'"
              class="button secondary"
              type="button"
              :disabled="disabled"
              @click="emit('receive', selected)"
            >
              Im Empfang entschlüsseln und prüfen
            </button>
          </div>
          <AttachmentList
            :parts="attachments"
            :warnings="selected.warnings"
            :disabled="disabled"
            @inspect="inspect"
            @download="inspect($event, true)"
          />
        </template>
      </DocumentLayout>
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
          v-if="hasPlaintext && selected.direction === 'received' && selected.kind === 'submission'"
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
      <div class="client-actions">
        <button class="button secondary" type="button" :disabled="disabled" @click="remove(selected)">
          Diese lokale Kopie löschen
        </button>
      </div>
      <details>
        <summary>Technische Inhalte und Kennungen</summary>
        <dl>
          <dt>Vorgang</dt>
          <dd><CopyValue :value="selected.caseId" label="Case ID" /></dd>
          <dt>Einreichung</dt>
          <dd><CopyValue :value="selected.submissionId" label="Submission ID" /></dd>
          <dt>Antwort</dt>
          <dd><CopyValue :value="selected.replyId" label="Reply ID" /></dd>
          <dt>Destination</dt>
          <dd><CopyValue :value="selected.destinationId" label="Destination ID" /></dd>
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
        gelöscht. Profile, Schlüssel und Nachrichten auf dem FIT-Connect-Server bleiben erhalten. Das Löschen
        kann nicht rückgängig gemacht werden.
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
