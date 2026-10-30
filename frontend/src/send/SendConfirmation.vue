<script setup>
import ScanResult from '../ScanResult.vue';
import { useEnvironment } from '../environments.js';
const environment = useEnvironment();
import ServiceLabel from '../ServiceLabel.vue';
const props = defineProps({ controller: Object, session: Object, visible: Boolean });
const { prepared, working, error, dialog, confirmedSchemaValidation, confirmedSession, dismiss, send } =
  props.controller;
</script>
<template>
  <dialog
    ref="dialog"
    class="tool-dialog receipt-dialog"
    aria-labelledby="send-confirm-title"
    @cancel.prevent="dismiss"
  >
    <template v-if="prepared">
      <p class="workspace-eyebrow">FIT-Connect {{ environment }}</p>
      <h2 id="send-confirm-title">Einreichung an FIT-Connect senden?</h2>
      <dl class="receipt-dialog-context">
        <dt>API</dt>
        <dd>{{ confirmedSession.apiVersion }}</dd>
        <dt>Empfänger</dt>
        <dd>
          <code>{{ prepared.summary.destinationId }}</code>
        </dd>
        <template v-if="prepared.summary.fromDestinationId">
          <dt>Absender</dt>
          <dd>
            <code>{{ prepared.summary.fromDestinationId }}</code>
          </dd>
        </template>
        <dt>Leistung</dt>
        <dd>
          <ServiceLabel
            :name="prepared.summary.serviceName"
            :identifier="prepared.summary.serviceIdentifier"
          />
        </dd>
        <dt>Vorgang</dt>
        <dd>{{ prepared.summary.caseId || 'Neuer Vorgang' }}</dd>
        <dt>Schema</dt>
        <dd>{{ prepared.summary.schemaUri }}</dd>
        <dt>Fachdaten</dt>
        <dd>{{ prepared.summary.mimeType }} · {{ prepared.summary.dataBytes }} Bytes</dd>
        <dt>Fachdatenprüfung</dt>
        <dd>
          {{ confirmedSchemaValidation ? 'Schema erfüllt' : 'Nicht durchgeführt – bewusster Negativtest' }}
        </dd>
        <dt>Antwortangebot</dt>
        <dd>{{ prepared.summary.replyOffer ? 'Angeboten' : 'Nicht angeboten' }}</dd>
        <dt>Anlagen</dt>
        <dd>{{ prepared.summary.attachments.length }}</dd>
      </dl>
      <ScanResult :status="prepared.scanStatus" :attachments="prepared.summary.attachments" outgoing />
      <ul v-if="prepared.summary.replyOffer?.processMessages?.length">
        <li
          v-for="item in prepared.summary.replyOffer.processMessages"
          :key="`${item.processModelId}/${item.messageId}`"
        >
          Erlaubte Prozessantwort: {{ item.processModelId }} · {{ item.messageId }}
        </li>
      </ul>
      <p v-if="prepared.summary.processMessage">
        Prozess: {{ prepared.summary.processMessage.processModelId }} · Nachricht:
        {{ prepared.summary.processMessage.messageId }}
      </p>
      <p v-if="prepared.summary.replyOffer">
        Antwortkanal: {{ prepared.summary.replyOffer.schemaUri }} ·
        {{ prepared.summary.replyOffer.mimeType }}. Mit einem gespeicherten Profil wird der private
        Antwortschlüssel vor dem Versand geschützt gesichert. Ohne gespeichertes Profil gilt er nur für diese
        Sitzung.
      </p>
      <ul v-if="prepared.summary.attachments.length">
        <li v-for="(item, index) in prepared.summary.attachments" :key="index">
          {{ item.fileName }} · {{ item.bytes }} Bytes
          <span v-if="item.description">· {{ item.description }}</span>
        </li>
      </ul>
      <p>
        Die Bestätigung gilt 60 Sekunden. Dieser Schritt überträgt die Einreichung an die FIT-Connect in
        {{ environment }}.
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="client-actions">
        <button class="button secondary" type="button" :disabled="working" autofocus @click="dismiss">
          Abbrechen
        </button>
        <button class="button" type="button" :disabled="working" @click="send">
          {{ working ? 'Wird an FIT-Connect übertragen …' : 'Jetzt an FIT-Connect senden' }}
        </button>
      </div>
    </template>
  </dialog>
</template>
