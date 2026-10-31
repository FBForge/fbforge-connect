<script setup>
import ScanResult from './ScanResult.vue';
import { useEnvironment } from './environments.js';
const environment = useEnvironment();
import CopyValue from './CopyValue.vue';
import ActionNotice from './ActionNotice.vue';
import DocumentationLink from './DocumentationLink.vue';

import SchemaSourceConsent from './SchemaSourceConsent.vue';
import DraftDataPreview from './DraftDataPreview.vue';
import FileDropInput from './FileDropInput.vue';
import ExampleDraftDialog from './ExampleDraftDialog.vue';
import { useReplySender } from './reply/useReplySender.js';
const props = defineProps({ session: Object, proof: Object, busy: Boolean, guided: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'invalidate', 'event-log']);
const controller = useReplySender(props, emit);
const {
  storageWarning,
  processWorkspace,
  expanded,
  allowExternalSchemas,
  schemaAccess,
  processChoice,
  target,
  choice,
  mime,
  process,

  text,
  file,
  attachments,
  prepared,
  outcome,
  outcomeOwner,
  working,
  error,
  diagnostic,
  errorNotice,
  cleanupOwner,
  schemaPackage,
  schemaFile,
  schemaNotice,
  exampleDialog,
  exampleButton,
  owner,
  dialog,
  prepareButton,
  resultHeading,
  schemaOptions,
  context,
  useBpmnSelection,
  selected,
  format,
  schemaContext,
  disabled,
  messages,
  explain,
  reset,
  load,
  loadSchema,
  chooseSchemaFile,
  changeSchemaFile,
  addFiles,
  hasDraft,
  begin,
  prepare,
  dismiss,
  openEventLog,
  send,
} = controller;
defineExpose({ begin, hasDraft, discardDraft: reset });
</script>

<template>
  <section
    v-show="!guided || expanded || outcome || error"
    class="tool-section"
    aria-labelledby="reply-send-title"
    :aria-busy="working"
  >
    <ExampleDraftDialog ref="exampleDialog" :context-key="schemaContext" />
    <p class="workspace-eyebrow">FIT-Connect {{ environment }}</p>
    <h2 id="reply-send-title">Auf die Einreichung antworten</h2>
    <p>
      Verfassen Sie Ihre Antwort und prüfen Sie den Entwurf vor dem Senden. Eine Antwort schließt den Empfang
      noch nicht ab.
    </p>
    <p v-if="!proof">Zuerst die Inhalte der Einreichung entschlüsseln und prüfen.</p>
    <button
      v-if="!target && diagnostic !== 'reply_channel_missing'"
      class="button secondary"
      type="button"
      :disabled="disabled"
      @click="load"
    >
      Antwortmöglichkeiten laden
    </button>
    <form v-if="target" class="send-form" @submit.prevent="prepare">
      <fieldset :disabled="disabled">
        <legend>Antwort</legend>
        <div class="client-fields">
          <label v-if="target.schemas.length > 1" for="reply-schema">
            Angebotenes Antwortschema
            <select id="reply-schema" v-model="choice">
              <option v-for="(item, index) in target.schemas" :key="index" :value="index">
                {{ item.schemaUri }}{{ item.mimeType ? ` · ${item.mimeType}` : '' }}
              </option>
            </select>
          </label>
          <label v-if="!selected?.mimeType" for="reply-mime">
            Antwortformat
            <select id="reply-mime" v-model="mime">
              <option value="application/json">JSON</option>
              <option value="application/xml">XML</option>
            </select>
          </label>
          <p v-else>
            Antwortformat:
            <strong>{{ format === 'application/json' ? 'JSON' : 'XML' }}</strong>
          </p>
        </div>
        <div class="client-actions">
          <button ref="exampleButton" class="button secondary" type="button" @click="loadSchema(true)">
            Fiktiven Antwortentwurf erzeugen
          </button>
        </div>
        <DraftDataPreview
          :schema-document="schemaPackage?.document"
          :schema-uri="selected?.schemaUri"
          :text="text"
          :file="file"
          :mime-type="format"
          :context-key="context"
          :disabled="disabled"
        >
          <label v-if="!file" for="reply-data">
            Antwortinhalt
            <textarea id="reply-data" v-model="text" rows="6" required spellcheck="false"></textarea>
          </label>
          <p v-else>
            {{ file.name }} · {{ file.size }} Bytes
            <button class="button secondary" type="button" @click="file = null">Eingabefeld verwenden</button>
          </p>
        </DraftDataPreview>
        <p v-if="schemaNotice" class="small-note" role="status">{{ schemaNotice }}</p>
        <SchemaSourceConsent
          ref="schemaAccess"
          id="reply-schema-sources"
          v-model="allowExternalSchemas"
          :disabled="disabled"
          :context-key="schemaContext"
        />
        <details :open="Boolean(file)">
          <summary>Antwortinhalt aus Datei übernehmen</summary>
          <FileDropInput
            id="reply-data-file"
            label="Fachdaten aus Datei (optional)"
            accept=".json,.xml,application/json,application/xml,text/xml"
            :disabled="disabled"
            @files="(files) => (file = files[0] || null)"
          />
        </details>
        <details ref="schemaOptions" class="reply-schema-options">
          <summary>Antwortschema und technische Optionen</summary>
          <CopyValue v-if="selected" label="Antwortschema" :value="selected.schemaUri" />
          <div class="client-fields">
            <FileDropInput
              id="reply-schema-file"
              label="Lokales Antwortschema (optional, JSON mit passender $id)"
              accept=".json,application/json,application/schema+json"
              :disabled="disabled"
              @files="chooseSchemaFile"
            >
              Maximal 2 MiB. Bei lokaler Auswahl werden keine externen Referenzen geladen.
            </FileDropInput>
            <p v-if="schemaFile">
              {{ schemaFile.name }}
              <button
                class="button secondary"
                type="button"
                @click="
                  schemaFile = null;
                  schemaPackage = null;
                "
              >
                Lokales Schema entfernen
              </button>
            </p>
          </div>

          <div class="client-actions">
            <button class="button secondary" type="button" @click="loadSchema(false)">
              Antwortschema laden
            </button>
          </div>
        </details>
        <details v-if="session?.apiVersion === 'v3'" :open="process">
          <summary>Als Prozessnachricht antworten</summary>
          <label class="checkbox-label">
            <input v-model="process" type="checkbox" :disabled="!target?.processMessages?.length" />
            Als angebotene Prozessnachricht antworten
          </label>
          <p v-if="!target?.processMessages?.length">
            Dieser geprüfte Rückkanal bietet keine Prozessantworten an. Eine normale fachliche Antwort ist mit
            seinen angebotenen Schemata möglich.
          </p>
          <button
            v-if="processWorkspace?.selection.value"
            class="button secondary"
            type="button"
            @click="useBpmnSelection"
          >
            BPMN-Auswahl mit angebotenem Antwortkanal abgleichen
          </button>
          <div v-if="process" class="client-fields">
            <label for="reply-process-choice">
              Angebotene Prozessantwort
              <select id="reply-process-choice" v-model="processChoice">
                <option v-for="(item, index) in target.processMessages" :key="index" :value="index">
                  {{ item.messageId }} · {{ item.processModelId }}
                </option>
              </select>
            </label>
          </div>
        </details>
      </fieldset>
      <fieldset :disabled="disabled">
        <legend>Antwortanlagen</legend>
        <FileDropInput
          id="reply-files"
          label="Antwortanlagen hinzufügen"
          multiple
          :disabled="disabled"
          @files="addFiles"
        />
        <div v-for="item in attachments" :key="item.id" class="client-fields">
          <p>
            <strong>{{ item.file.name }}</strong>
            <br />
            {{ item.file.size }} Bytes
          </p>
          <label :for="`reply-description-${item.id}`">
            Beschreibung
            <input
              :id="`reply-description-${item.id}`"
              type="text"
              v-model="item.description"
              maxlength="1000"
            />
          </label>
          <button
            class="button secondary"
            type="button"
            @click="attachments = attachments.filter((value) => value.id !== item.id)"
          >
            Anlage entfernen
          </button>
        </div>
        <p class="small-note">
          Höchstens 32 MiB je Datei und 64 MiB insgesamt. Schema und Format müssen zum angebotenen
          Antwortkanal passen.
        </p>
      </fieldset>
      <button ref="prepareButton" class="button" type="submit" :disabled="disabled">
        Antwort prüfen und vorbereiten
      </button>
    </form>
    <p v-if="working" role="status">
      Antwortaktion läuft. Bei aktiviertem Virenscan werden die Fachdaten und Anlagen geprüft …
    </p>
    <p v-if="storageWarning" role="status">{{ storageWarning }}</p>
    <ActionNotice
      v-if="error"
      ref="errorNotice"
      :title="
        diagnostic === 'reply_channel_missing'
          ? 'Kein Antwortkanal angeboten'
          : diagnostic === 'schema_id_mismatch'
            ? 'Antwortschema passt nicht zum Angebot'
            : 'Antwortaktion fehlgeschlagen'
      "
      :message="error"
      :tone="diagnostic === 'reply_channel_missing' ? 'warning' : 'error'"
      :code="diagnostic"
      :api-version="session?.apiVersion"
    >
      <template v-if="diagnostic === 'schema_id_mismatch' && selected">
        <CopyValue :value="selected.schemaUri" label="Erwartete Schema-Kennung" />
        <button class="button secondary" type="button" :disabled="disabled" @click="changeSchemaFile">
          Passendes Schema auswählen
        </button>
      </template>
      <DocumentationLink topic="replies">Anleitung zu Antworten</DocumentationLink>
    </ActionNotice>
    <p v-if="cleanupOwner === session?.sessionId" role="alert">{{ messages.content_cleanup_failed }}</p>
    <div v-if="outcome && outcomeOwner === session?.sessionId" role="status">
      <h3 ref="resultHeading" tabindex="-1">
        {{
          outcome.status === 'sent'
            ? 'Antwort an FIT-Connect übergeben'
            : outcome.status === 'uncertain'
              ? 'Reply-Versandausgang ungewiss'
              : 'Reply-Versand fehlgeschlagen'
        }}
      </h3>
      <p v-if="outcome.replyId">
        Reply ID:
        <CopyValue :value="outcome.replyId" label="Reply ID" />
      </p>
      <p>
        Vorgang:
        <CopyValue :value="outcome.caseId" label="Case ID" />
      </p>
      <button
        v-if="outcome.replyId"
        type="button"
        class="button secondary"
        :disabled="busy || working"
        @click="openEventLog"
      >
        Event Log der Antwort prüfen
      </button>
      <p v-if="outcome.status === 'uncertain'">
        Bitte nicht erneut senden. Der Dienst kann die Antwort bereits erhalten haben.
      </p>
      <p v-if="outcome.error">{{ explain(outcome.error) }}</p>
    </div>
    <dialog
      ref="dialog"
      class="tool-dialog receipt-dialog"
      aria-labelledby="reply-confirm-title"
      @cancel.prevent="dismiss"
    >
      <template v-if="prepared">
        <h2 id="reply-confirm-title">Antwort an FIT-Connect senden?</h2>
        <dl class="receipt-dialog-context">
          <dt>API</dt>
          <dd>{{ owner.apiVersion }}</dd>
          <dt>Einreichung</dt>
          <dd>
            <code>{{ prepared.summary.submissionId }}</code>
          </dd>
          <dt>Vorgang</dt>
          <dd>
            <code>{{ prepared.summary.caseId }}</code>
          </dd>
          <dt>Antwortschema</dt>
          <dd>{{ prepared.summary.schemaUri }}</dd>
          <dt>Antwortinhalt</dt>
          <dd>{{ prepared.summary.mimeType }} · {{ prepared.summary.dataBytes }} Bytes</dd>
        </dl>
        <ScanResult :status="prepared.scanStatus" :attachments="prepared.summary.attachments" outgoing />
        <p v-if="prepared.summary.processMessage">
          Prozess: {{ prepared.summary.processMessage.processModelId }} · Nachricht:
          {{ prepared.summary.processMessage.messageId }}
        </p>
        <ul v-if="prepared.summary.attachments.length">
          <li v-for="(item, index) in prepared.summary.attachments" :key="index">
            {{ item.fileName }} · {{ item.bytes }} Bytes
            <span v-if="item.description">· {{ item.description }}</span>
          </li>
        </ul>
        <p>
          <span class="status-badge ok">Antwortschema geprüft</span>
          Der native Kern hat die exakten vorbereiteten Fachdaten gegen das gewählte Schema geprüft. Eine
          fachliche Prüfung bleibt erforderlich.
        </p>
        <p>
          Die Bestätigung gilt 60 Sekunden. Dieser Schritt versendet die verschlüsselte Antwort an FIT-Connect
          {{ environment }}.
        </p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="client-actions">
          <button class="button secondary" type="button" :disabled="working" autofocus @click="dismiss">
            Abbrechen
          </button>
          <button class="button" type="button" :disabled="working" @click="send">
            {{ working ? 'Wird übertragen …' : 'Antwort jetzt senden' }}
          </button>
        </div>
      </template>
    </dialog>
  </section>
</template>
