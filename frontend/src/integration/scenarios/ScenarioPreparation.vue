<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ScenarioResponses from './ScenarioResponses.vue';
import { messageFor, messageOptions } from './messages.ts';
import { synchronizeReplyOffers } from './response-offers.ts';
import { messageFields } from './fields.ts';
import type { Scenario, Assignment, Scope } from './types.ts';
import type { Environment } from '../../contracts.d.ts';
import TestFlowContext from '../TestFlowContext.vue';
import ScenarioVariables from './ScenarioVariables.vue';
import ScenarioExpectations from './ScenarioExpectations.vue';
import ScenarioOffers from './ScenarioOffers.vue';
import type { Session } from '../../contracts.d.ts';
import { useEnvironment } from '../../environments.js';
const environment = useEnvironment();
const scenario = defineModel<Scenario>({ required: true });
const assignment = defineModel<Assignment>('assignment', { required: true });
defineProps<{ disabled: boolean; session: Session | null }>();
const emit = defineEmits<{ context: [value: object] }>();
const selected = ref(0),
  scope = ref<Scope>('request');
const item = computed(() => scenario.value.pack.cases[selected.value] || scenario.value.pack.cases[0]);
const options = computed(() => messageOptions(scenario.value, item.value.id));
const message = computed(() =>
  messageFor(scenario.value.pack, scenario.value.followups, item.value.id, scope.value),
);
watch(options, (value) => {
  if (!value.some((o) => o.value === scope.value)) scope.value = 'request';
});
watch(
  () =>
    JSON.stringify(
      scenario.value.pack.cases.map((c) => [
        c.id,
        c.reply?.processMessage,
        ...(scenario.value.followups || [])
          .filter((f) => f.caseId === c.id)
          .map((f) => f.message.processMessage),
      ]),
    ),
  () => synchronizeReplyOffers(scenario.value),
);
const syntax = computed(() => {
  try {
    if (message.value) messageFields(message.value.data, message.value.mimeType);
    return '';
  } catch {
    return 'Die Fachdaten enthalten kein gültiges oder eindeutig lesbares JSON/XML. Prüfen Sie Inhalt und Nachrichtenformat.';
  }
});
watch(
  () => [item.value.reply?.schemaUri, item.value.reply?.mimeType],
  () => {
    if (item.value.reply && item.value.request.replyOffer) {
      item.value.request.replyOffer.schemaUri = item.value.reply.schemaUri;
      item.value.request.replyOffer.mimeType = item.value.reply.mimeType;
      for (const f of scenario.value.followups || [])
        if (f.caseId === item.value.id) {
          f.message.schemaUri = item.value.reply.schemaUri;
          f.message.mimeType = item.value.reply.mimeType;
        }
    }
  },
);
</script>
<template>
  <div class="scenario-preparation">
    <div class="scenario-fields">
      <label>
        Testname
        <input v-model="scenario.name" maxlength="160" :disabled="disabled" />
      </label>
      <label>
        Welche Gegenstelle testen Sie?
        <select v-model="scenario.mode" :disabled="disabled">
          <option value="sender">Fachverfahren empfängt, Connect sendet</option>
          <option value="receiver">Onlinedienst sendet, Connect empfängt</option>
          <option value="both">Beide Seiten mit Connect</option>
        </select>
      </label>
    </div>
    <TestFlowContext
      v-model:context="assignment"
      :environment="environment as Environment"
      :disabled="disabled"
      @open="emit('context', $event)"
    />
    <ScenarioOffers
      :session="session"
      :assignment="assignment"
      :item="item"
      :disabled="disabled"
      @apply="Object.assign(item, $event)"
    />
    <section class="scenario-section" aria-labelledby="scenario-data-title">
      <h3 id="scenario-data-title">Testdaten</h3>
      <div class="scenario-fields">
        <label>
          Testfall bearbeiten
          <select v-model="selected" :disabled="disabled">
            <option v-for="(c, index) in scenario.pack.cases" :key="c.id" :value="index">{{ c.name }}</option>
          </select>
        </label>
        <label>
          Nachricht bearbeiten
          <select v-model="scope" :disabled="disabled">
            <option v-for="o in options" :key="o.value" :value="o.value">{{ o.name }}</option>
          </select>
        </label>
      </div>
      <template v-if="message">
        <label>
          Nachrichtenformat
          <select v-model="message.mimeType" :disabled="disabled || scope.startsWith('reply:')">
            <option value="application/json">JSON</option>
            <option value="application/xml">XML</option>
          </select>
        </label>
        <label>
          Schema-Kennung
          <input
            v-model="message.schemaUri"
            maxlength="4096"
            :disabled="disabled || scope.startsWith('reply:')"
          />
        </label>
        <label>
          Fachdaten
          <textarea v-model="message.data" rows="9" spellcheck="false" :disabled="disabled" />
        </label>
        <p v-if="syntax" class="small-note scenario-notice error">{{ syntax }}</p>
        <p class="small-note">
          {{ message.mimeType }} · {{ message.attachments.length }} Anlagen. Technische Prüfung und Virenscan
          erfolgen über die vorhandenen Versand- und Empfangsfunktionen.
        </p>
      </template>
      <p v-if="scope.startsWith('reply:')" class="small-note">
        Alle Antworten verwenden das vereinbarte Antwortschema. Format und Schema ändern Sie bei „Erste
        Antwort“.
      </p>
      <details v-if="scope !== 'request' && message">
        <summary>Adressierung der ausgewählten Antwort</summary>
        <label class="checkbox-label">
          <input
            type="checkbox"
            :disabled="disabled"
            :checked="Boolean(message.processMessage)"
            @change="
              message.processMessage = message.processMessage ? null : { processModelId: '', messageId: '' }
            "
          />
          Antwort als Prozessnachricht (API v3)
        </label>
        <template v-if="message.processMessage">
          <label>
            Prozessmodell der Antwort
            <input v-model="message.processMessage.processModelId" maxlength="1000" :disabled="disabled" />
          </label>
          <label>
            Nachrichtenkennung der Antwort
            <input v-model="message.processMessage.messageId" maxlength="1000" :disabled="disabled" />
          </label>
        </template>
        <p class="small-note">
          Diese Prozessnachrichten werden beim Versand der Testeinreichung im Antwortkanal angeboten. Ein
          bereits gesendetes Angebot lässt sich dadurch nicht ändern.
        </p>
      </details>
      <ScenarioResponses v-model="scenario" :case-id="item.id" :disabled="disabled" />
      <label>
        Erwartete Empfangsbestätigung
        <select v-model="item.receipt" :disabled="disabled">
          <option value="none">Keine Empfangsbestätigung prüfen</option>
          <option value="accept">Annehmen</option>
          <option value="reject">Ablehnen</option>
        </select>
      </label>
      <details>
        <summary>Adressierung und Prozessnachricht</summary>
        <label class="checkbox-label">
          <input
            type="checkbox"
            :checked="Boolean(item.request.processMessage)"
            :disabled="disabled"
            @change="
              item.request.processMessage = item.request.processMessage
                ? null
                : { processModelId: '', messageId: '' }
            "
          />
          Prozessnachricht verwenden (API v3)
        </label>
        <template v-if="item.request.processMessage">
          <label>
            Prozessmodell-Kennung
            <input
              v-model="item.request.processMessage.processModelId"
              maxlength="1000"
              :disabled="disabled"
            />
          </label>
          <label>
            Nachrichtenkennung
            <input v-model="item.request.processMessage.messageId" maxlength="1000" :disabled="disabled" />
          </label>
        </template>
        <label v-if="scenario.pack.cases.length > 1" class="checkbox-label">
          <input v-model="scenario.sharedCase" type="checkbox" :disabled="disabled" />
          Folgeschritte im selben Vorgang senden (API v3)
        </label>
        <label>
          Leistungskennung
          <input v-model="item.request.serviceIdentifier" maxlength="4096" :disabled="disabled" />
        </label>
        <p v-if="item.request.processMessage" class="small-note">
          Prozess: {{ item.request.processMessage.processModelId }} · Nachricht:
          {{ item.request.processMessage.messageId }}. Dieses Angebot muss an der Gegenstelle eingerichtet
          sein.
        </p>
        <p v-if="item.request.replyOffer" class="small-note">
          Antwortangebot: {{ item.request.replyOffer.schemaUri }}
        </p>
        <ul v-if="message?.attachments.length">
          <li v-for="a in message.attachments" :key="a.fileName">{{ a.fileName }} · {{ a.mimeType }}</li>
        </ul>
      </details>
    </section>
    <details>
      <summary>Variable Angaben und Datensätze</summary>
      <ScenarioVariables v-model="scenario" />
    </details>
    <details>
      <summary>Prüferwartungen anpassen</summary>
      <ScenarioExpectations v-model="scenario" />
    </details>
  </div>
</template>
