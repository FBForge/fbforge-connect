<script setup>
import { warning, label, bytesLabel } from './receive/presentation.ts';
import { canPreview } from './submission-preview.js';
import SchemaSourceConsent from './SchemaSourceConsent.vue';
import FileDropInput from './FileDropInput.vue';
import DocumentationLink from './DocumentationLink.vue';
import ActionNotice from './ActionNotice.vue';
import ContentPreview from './ContentPreview.vue';
import DiscardReplyDialog from './DiscardReplyDialog.vue';
import ReceiptPanel from './ReceiptPanel.vue';
import ReplyReceiptPanel from './ReplyReceiptPanel.vue';
import ReplySender from './ReplySender.vue';
import DocumentLayout from './DocumentLayout.vue';
import AttachmentList from './AttachmentList.vue';
import MessageDownload from './MessageDownload.vue';
import { exportSource } from './message-export.js';
import StructuredData from './StructuredData.vue';
import { useReceivePanel } from './receive/useReceivePanel.js';
const props = defineProps({
  session: Object,
  detail: Object,
  destinationId: String,
  busy: Boolean,
  keyRevision: Number,
  receiveRevision: Number,
  reply: Boolean,
  autoOpen: Number,
});
const emit = defineEmits([
  'busy',
  'activity',
  'fatal',
  'verified',
  'outcome',
  'receive-start',
  'event-log',
  'setup',
]);
const receiveController = useReceivePanel(props, emit);
const {
  processWorkspace,
  replySender,
  receiptPanel,
  discardReplyDialog,
  preparation,
  replySection,
  receiptSection,
  allowExternalSchemas,
  schemaAccess,
  diagnostic,
  errorNotice,
  schemaSettings,
  applicationSchema,
  application,
  applicationNotice,
  applicationHeading,
  attachments,
  schemaChecked,
  proof,
  parts,
  schemas,
  preview,
  error,
  pending,
  action,
  receiptOutcome,
  receiptUncertain,
  completed,
  controller,
  disabled,
  context,
  panelId,
  errorTitle,
  showSchemaSettings,
  closePreview,
  resetProof,
  verify,
  chooseSchema,
  removeSchema,
  inspect,
  confirmLeave,
  beginReply,
  beginReceipt,
} = receiveController;
defineExpose({
  confirmLeave,
  getSchemas: () => schemas.value.map(({ uri, contentId }) => ({ uri, contentId })),
});
</script>

<template>
  <div v-if="detail" class="receive-workspace">
    <DiscardReplyDialog ref="discardReplyDialog" />
    <section
      v-if="!completed"
      class="tool-section"
      :aria-labelledby="`${panelId}-title`"
      :aria-busy="pending"
    >
      <div class="tool-section-heading">
        <div>
          <h2 :id="`${panelId}-title`">{{ reply ? 'Antwortinhalte prüfen' : 'Inhalte prüfen' }}</h2>
          <p v-if="reply && !proof">
            Mit dem beim Versand erzeugten Antwortschlüssel lokal entschlüsseln. Er wird automatisch über
            Vorgang und Schlüssel-ID zugeordnet. Ein gespeichertes Profil kann den Schlüssel nach einem
            Neustart wiederherstellen.
          </p>
          <p v-else-if="!proof">
            Mit dem geladenen privaten Schlüssel lokal entschlüsseln. Schlüssel bleiben für weitere passende
            Einreichungen in dieser Sitzung verfügbar.
          </p>
        </div>
      </div>
      <details ref="preparation" class="receive-preparation" :open="!proof">
        <summary>
          {{ proof ? 'Entschlüsselung und Schemaeinstellungen' : 'Entschlüsselung vorbereiten' }}
        </summary>
        <details ref="schemaSettings">
          <summary>Lokale Fachdaten-Schemata ({{ schemas.length }})</summary>
          <p>
            Zuerst entschlüsselt das SDK die Metadaten und liest daraus die Schema-URI. Öffentlich erreichbare
            HTTPS-Schemata werden nur mit aktivierter Freigabe ohne Zugangsdaten geladen. Optional können Sie
            eine lokale JSON-Schemadatei mit passender
            <code>$id</code>
            hinzufügen. Mit aktivierter Freigabe werden auch externe Referenzen und XRepository-XSDs
            kontrolliert geladen.
          </p>
          <div class="client-fields">
            <FileDropInput
              :id="`${panelId}-schema-file`"
              label="JSON-Schemadatei hinzufügen"
              accept=".json,application/json,application/schema+json"
              :disabled="disabled"
              @files="chooseSchema"
            >
              Maximal 2 MiB pro Datei, insgesamt 16 MiB. Vor dem Abruf öffentlicher HTTPS-Schemata fragt die
              Anwendung nach Ihrer Freigabe. Private Netzadressen werden nicht aufgerufen.
            </FileDropInput>
          </div>
          <ul v-if="schemas.length" class="receive-schema-list">
            <li v-for="file in schemas" :key="file.contentId">
              <div>
                <strong>{{ file.filename }}</strong>
                <br />
                <span>{{ file.uri }}</span>
              </div>
              <button class="button secondary" type="button" :disabled="disabled" @click="removeSchema(file)">
                Entfernen
              </button>
            </li>
          </ul>
        </details>
        <SchemaSourceConsent
          ref="schemaAccess"
          :id="`${panelId}-schema-sources`"
          v-model="allowExternalSchemas"
          :disabled="disabled"
          :context-key="`${context}/${detail?.submissionId || detail?.replyId || ''}`"
        />
        <div class="client-actions">
          <button class="button" type="button" :disabled="disabled" @click="verify">
            {{ proof ? 'Erneut entschlüsseln und prüfen' : 'Inhalte entschlüsseln und prüfen' }}
          </button>
          <button
            v-if="proof"
            class="button secondary"
            type="button"
            :disabled="disabled"
            @click="resetProof"
          >
            Prüfergebnis verwerfen
          </button>
          <button
            v-if="pending && controller"
            class="button secondary"
            type="button"
            @click="controller.abort()"
          >
            Übertragung abbrechen
          </button>
        </div>
      </details>
      <p v-if="pending" role="status">{{ action }} …</p>
      <ActionNotice
        v-if="error"
        ref="errorNotice"
        :title="errorTitle"
        :message="error"
        :tone="diagnostic === 'schema_consent_required' ? 'warning' : 'error'"
        :code="diagnostic"
        :api-version="session?.apiVersion"
      >
        <button
          v-if="!reply && ['key_missing', 'key_rejected', 'test_certificate_required'].includes(diagnostic)"
          type="button"
          class="button"
          :disabled="disabled"
          @click="emit('setup')"
        >
          Schlüssel einrichten
        </button>
        <button
          v-if="diagnostic === 'schema_consent_required'"
          type="button"
          class="button"
          :disabled="disabled"
          @click="showSchemaSettings(false)"
        >
          Zur Freigabe
        </button>
        <button
          v-if="diagnostic.startsWith('schema_') || diagnostic === 'data_schema_invalid'"
          type="button"
          class="button secondary"
          :disabled="disabled"
          @click="showSchemaSettings(true)"
        >
          Lokales Schema hinzufügen
        </button>
        <DocumentationLink :topic="reply ? 'replies' : 'problems'">Hilfe zu diesem Problem</DocumentationLink>
      </ActionNotice>
      <template v-if="proof">
        <div class="verification-stages" aria-label="Prüfstatus">
          <p><span class="status-badge ok">Entschlüsselung und Integrität geprüft</span></p>
          <p>
            <span class="status-badge" :class="schemaChecked ? 'ok' : 'info'">
              {{ schemaChecked ? 'Fachdaten-Schema geprüft' : 'Schemaprüfung nicht bestätigt' }}
            </span>
          </p>
          <p><span class="status-badge info">Fachliche Prüfung: manuell offen</span></p>
        </div>
        <ul v-if="proof.warnings.length">
          <li v-for="stage in proof.warnings" :key="stage">{{ warning(stage) }}</li>
        </ul>
        <details class="verification-explanation">
          <summary>Was wurde geprüft?</summary>
          <p class="small-note">
            Das SDK hat Ereignisse, Signaturen, Verschlüsselung und Inhalts-Hashes geprüft. Hinweise oben
            benennen verbleibende Prüfungen. Dies bestätigt noch keinen Empfang bei FIT-Connect.
          </p>
        </details>
        <p v-if="proof.processMessage">
          <strong>
            Prozessnachricht: {{ proof.processMessage.processModelId }} · {{ proof.processMessage.messageId }}
          </strong>
          <button
            type="button"
            class="button secondary"
            :disabled="disabled"
            @click="
              processWorkspace?.showContext({
                ...proof.processMessage,
                caseId: proof.caseId,
                apiVersion: session.apiVersion,
                sessionId: session.sessionId,
              })
            "
          >
            Geprüften Nachrichtenbezug im BPMN-Modell zeigen
          </button>
        </p>
        <DocumentLayout>
          <template #data>
            <section class="received-application" :aria-labelledby="`${panelId}-application-title`">
              <div class="tool-section-heading">
                <div>
                  <h3 :id="`${panelId}-application-title`" ref="applicationHeading" tabindex="-1">
                    {{ reply ? 'Antwort lesen' : 'Antrag lesen' }}
                  </h3>
                  <p>Fachdaten aus dem lokal entschlüsselten Inhalt</p>
                </div>
              </div>
              <StructuredData
                v-if="application"
                :text="application.text"
                :format="application.format"
                :schema-document="applicationSchema?.document"
                :schema-uri="applicationSchema?.schemaUri"
                :schema-status="applicationSchema?.status"
              />
              <p v-else class="small-note" role="status">{{ applicationNotice }}</p>
            </section>
          </template>
          <template #aside>
            <AttachmentList
              :parts="attachments"
              :disabled="disabled"
              @inspect="inspect"
              @download="inspect($event, true)"
            />
            <div class="document-next-actions">
              <MessageDownload
                :session="session"
                :source="exportSource(proof, reply)"
                :disabled="disabled"
                @busy="emit('busy', $event)"
              />
              <h3>Nächster Schritt</h3>
              <p class="small-note">
                Prüfen Sie die Fachdaten und Anlagen. Eine Antwort schließt den Empfang noch nicht ab.
              </p>
              <div class="client-actions">
                <button
                  v-if="!reply"
                  class="button secondary"
                  type="button"
                  :disabled="disabled"
                  @click="beginReply"
                >
                  Antwort verfassen
                </button>
                <button
                  v-if="!reply"
                  class="button"
                  type="button"
                  :disabled="disabled || receiptUncertain"
                  @click="beginReceipt('accept')"
                >
                  Annehmen
                </button>
                <button
                  v-if="!reply"
                  class="button secondary"
                  type="button"
                  :disabled="disabled || receiptUncertain"
                  @click="beginReceipt('reject')"
                >
                  Ablehnen
                </button>
                <button
                  v-else
                  class="button"
                  type="button"
                  :disabled="disabled"
                  @click="
                    receiptSection?.scrollIntoView({ block: 'start' });
                    receiptSection?.querySelector('button, select')?.focus();
                  "
                >
                  Antwort quittieren
                </button>
              </div>
            </div>
          </template>
        </DocumentLayout>
        <details class="application-technical">
          <summary>Technische Inhalte und Originaldownloads ({{ parts.length }})</summary>
          <div class="client-table support-table">
            <table class="submission-content-table receive-content-table">
              <thead>
                <tr>
                  <th scope="col">Inhalt</th>
                  <th scope="col">Format / Größe</th>
                  <th scope="col">Lokale Prüfung</th>
                  <th scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="part in parts" :key="part.contentId">
                  <th scope="row" data-label="Inhalt">
                    {{ label(part) }}
                    <p v-if="part.description" class="small-note">{{ part.description }}</p>
                    <details v-if="part.attachmentId">
                      <summary>Anlagen-ID</summary>
                      <code>{{ part.attachmentId }}</code>
                    </details>
                  </th>
                  <td data-label="Format / Größe">
                    {{ part.mimeType || 'Nicht angegeben' }}
                    <br />
                    <span class="small-note">{{ bytesLabel(part.totalBytes) }}</span>
                  </td>
                  <td data-label="Lokale Prüfung">
                    <span class="status-badge ok">
                      {{ part.kind === 'metadata' ? 'JWE geprüft' : 'JWE und Hash geprüft' }}
                    </span>
                  </td>
                  <td data-label="Aktionen">
                    <div class="client-actions">
                      <button
                        class="button secondary"
                        type="button"
                        :disabled="disabled"
                        v-if="canPreview(part)"
                        @click="inspect(part)"
                      >
                        Anzeigen
                      </button>
                      <button
                        class="button secondary"
                        type="button"
                        :disabled="disabled"
                        @click="inspect(part, true)"
                      >
                        Herunterladen
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </template>
      <ContentPreview
        v-if="preview"
        :preview="preview"
        :schema-document="preview?.isApplication ? applicationSchema?.document : undefined"
        :schema-uri="preview?.isApplication ? applicationSchema?.schemaUri : undefined"
        @close="closePreview"
      />
    </section>
    <div v-show="!reply && !completed" ref="replySection" class="receive-action-section">
      <ReplySender
        ref="replySender"
        guided
        v-if="!reply && !completed"
        :session="session"
        :proof="proof"
        :busy="busy || pending"
        @busy="(value) => emit('busy', value)"
        @activity="(value) => emit('activity', value)"
        @fatal="(value) => emit('fatal', value)"
        @invalidate="resetProof"
        @event-log="(value) => emit('event-log', value)"
      />
    </div>
    <div ref="receiptSection" class="receive-action-section">
      <ReplyReceiptPanel
        v-if="reply"
        :session="session"
        :detail="detail"
        :proof="proof"
        :parts="parts"
        :busy="busy || pending"
        @busy="(value) => emit('busy', value)"
        @activity="(value) => emit('activity', value)"
        @fatal="(value) => emit('fatal', value)"
        @outcome="(value) => emit('outcome', value)"
        @invalidate="resetProof"
        @event-log="(value) => emit('event-log', value)"
      />
      <ReceiptPanel
        ref="receiptPanel"
        guided
        v-if="!reply"
        :session="session"
        :detail="detail"
        :proof="proof"
        :busy="busy || pending"
        :key-revision="keyRevision"
        @busy="(value) => emit('busy', value)"
        @activity="(value) => emit('activity', value)"
        @fatal="(value) => emit('fatal', value)"
        @outcome="
          (value) => {
            receiptOutcome = value;
            emit('outcome', value);
          }
        "
        @invalidate="resetProof"
      />
    </div>
  </div>
</template>
