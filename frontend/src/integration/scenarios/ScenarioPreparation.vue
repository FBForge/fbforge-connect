<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ScenarioAttachments from './ScenarioAttachments.vue';
import { duplicateCase, removeCase, setFirstReply } from './authoring.ts';
import { formatTestJson } from './json-format.ts';
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
defineProps<{ disabled: boolean; session: Session | null; page: string }>();
const option = ref('cases');
const optionLabels = {
  cases: 'Testfälle',
  offers: 'Angebot der Gegenstelle',
  attachments: 'Anlagen',
  responses: 'Weitere Antworten',
  addressing: 'Adressierung und Prozessnachrichten',
  variables: 'Variable Angaben und Datensätze',
  expectations: 'Prüferwartungen',
};
const emit = defineEmits<{ context: [value: object]; busy: [value: boolean] }>();
const authoringError = ref('');
function duplicate() {
  try {
    const id = duplicateCase(scenario.value, item.value.id);
    selected.value = scenario.value.pack.cases.findIndex((c) => c.id === id);
    authoringError.value = '';
  } catch {
    authoringError.value =
      'Die Kopie würde die Grenze für Testfälle oder Testdaten überschreiten. Entfernen Sie nicht benötigte Daten.';
  }
}
function remove() {
  removeCase(scenario.value, item.value.id);
  selected.value = Math.min(selected.value, scenario.value.pack.cases.length - 1);
}
function format() {
  if (!message.value) return;
  try {
    message.value.data = formatTestJson(message.value.data);
    authoringError.value = '';
  } catch {
    authoringError.value =
      'JSON konnte nicht formatiert werden. Prüfen Sie die Syntax und Größe. Der Inhalt bleibt erhalten.';
  }
}
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
    <section v-show="page === 'connection'" class="scenario-section">
      <div class="scenario-fields">
        <label>
          Testname
          <input v-model="scenario.name" maxlength="160" :disabled="disabled" />
        </label>
        <label>
          Welche Gegenstelle testen Sie?
          <select v-model="scenario.mode" :disabled="disabled" aria-describedby="scenario-mode-hint">
            <option value="sender">Fachverfahren</option>
            <option value="receiver">Onlinedienst</option>
            <option value="both">Beide Seiten</option>
          </select>
        </label>
      </div>
      <p id="scenario-mode-hint" class="small-note">
        {{
          scenario.mode === 'sender'
            ? 'FBForge Connect sendet an Ihr Fachverfahren und prüft dessen Rückmeldungen.'
            : scenario.mode === 'receiver'
              ? 'FBForge Connect empfängt von Ihrem Onlinedienst und prüft dessen Einreichungen.'
              : 'FBForge Connect übernimmt Sender und Empfänger. Beide Seiten können eigene Profile verwenden.'
        }}
      </p>
      <label>
        <span id="scenario-destination-label">Empfangs-Destination</span>
        <input
          v-model="assignment.receiverDestination"
          aria-labelledby="scenario-destination-label"
          aria-describedby="scenario-destination-hint"
          maxlength="36"
          :disabled="disabled"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
        <span id="scenario-destination-hint" class="small-note">
          Destination, an die der Testantrag gesendet wird. Sie können sie auch beim Versand auswählen.
        </span>
      </label>
      <TestFlowContext
        v-model:context="assignment"
        :environment="environment as Environment"
        :disabled="disabled"
        :mode="scenario.mode"
        receiver-destination-outside
        expanded
        @open="emit('context', $event)"
      />
    </section>
    <template v-if="page === 'data'">
      <label v-if="scenario.pack.cases.length > 1">
        Testfall bearbeiten
        <select v-model="selected" :disabled="disabled">
          <option v-for="(c, index) in scenario.pack.cases" :key="c.id" :value="index">{{ c.name }}</option>
        </select>
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          :checked="Boolean(item.reply)"
          :disabled="disabled"
          @change="setFirstReply(scenario, item.id, ($event.target as HTMLInputElement).checked)"
        />
        Fachliche Antwort erwarten
      </label>
      <label v-if="options.length > 1">
        Nachricht bearbeiten
        <select v-model="scope" :disabled="disabled">
          <option v-for="o in options" :key="o.value" :value="o.value">{{ o.name }}</option>
        </select>
      </label>
      <template v-if="message">
        <div class="scenario-fields">
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
        </div>
        <div class="scenario-data-editor">
          <div class="scenario-section-heading">
            <label for="scenario-message-data">Fachdaten</label>
            <button
              v-if="message.mimeType === 'application/json'"
              class="button secondary"
              :disabled="disabled || Boolean(syntax)"
              @click="format"
            >
              JSON formatieren
            </button>
          </div>
          <textarea
            id="scenario-message-data"
            v-model="message.data"
            rows="6"
            spellcheck="false"
            :disabled="disabled"
          />
        </div>
        <p v-if="syntax" class="small-note scenario-notice error">{{ syntax }}</p>
        <p class="small-note">
          {{ message.attachments.length }} {{ message.attachments.length === 1 ? 'Anlage' : 'Anlagen' }}.
          Dateien ändern Sie unter „Weitere Testeinstellungen → Anlagen“.
        </p>
      </template>
      <p v-if="scope.startsWith('reply:')" class="small-note">
        Alle Antworten verwenden das vereinbarte Antwortschema. Format und Schema ändern Sie bei „Erste
        Antwort“.
      </p>
      <div class="scenario-fields">
        <label v-if="!item.request.processMessage">
          Leistungskennung
          <input v-model="item.request.serviceIdentifier" maxlength="4096" :disabled="disabled" />
        </label>
        <label>
          Erwartete Empfangsbestätigung
          <select v-model="item.receipt" :disabled="disabled">
            <option value="none">Keine Empfangsbestätigung prüfen</option>
            <option value="accept">Annehmen</option>
            <option value="reject">Ablehnen</option>
          </select>
        </label>
      </div>
    </template>
    <template v-if="page === 'options'">
      <label>
        Weitere Testeinstellungen
        <select v-model="option" :disabled="disabled">
          <option v-for="(label, key) in optionLabels" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <section class="scenario-section" :aria-label="optionLabels[option as keyof typeof optionLabels]">
        <label v-if="scenario.pack.cases.length > 1">
          Testfall bearbeiten
          <select v-model="selected" :disabled="disabled">
            <option v-for="(c, index) in scenario.pack.cases" :key="c.id" :value="index">{{ c.name }}</option>
          </select>
        </label>
        <template v-if="option === 'cases'">
          <section class="scenario-section">
            <label>
              Testfallname
              <input v-model="item.name" maxlength="160" :disabled="disabled" />
            </label>
            <div class="client-actions">
              <button class="button secondary" :disabled="disabled" @click="duplicate">
                Testfall duplizieren
              </button>
              <button
                class="button secondary"
                :disabled="disabled || scenario.pack.cases.length === 1"
                @click="remove"
              >
                Testfall entfernen
              </button>
            </div>
          </section>
        </template>

        <template v-if="option === 'attachments'">
          <label v-if="options.length > 1">
            Nachricht bearbeiten
            <select v-model="scope" :disabled="disabled">
              <option v-for="o in options" :key="o.value" :value="o.value">{{ o.name }}</option>
            </select>
          </label>
          <ScenarioAttachments
            v-if="message"
            expanded
            :message="message"
            :scenario="scenario"
            :disabled="disabled"
            @update="message.attachments = $event"
            @busy="emit('busy', $event)"
          />
        </template>
        <ScenarioResponses
          v-if="option === 'responses'"
          expanded
          v-model="scenario"
          :case-id="item.id"
          :disabled="disabled"
        />
        <template v-if="option === 'addressing'">
          <label v-if="options.length > 1">
            Nachricht bearbeiten
            <select v-model="scope" :disabled="disabled">
              <option v-for="o in options" :key="o.value" :value="o.value">{{ o.name }}</option>
            </select>
          </label>
          <section class="scenario-section" v-if="scope !== 'request' && message">
            <h4>Adressierung der ausgewählten Antwort</h4>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :disabled="disabled"
                :checked="Boolean(message.processMessage)"
                @change="
                  message.processMessage = message.processMessage
                    ? null
                    : { processModelId: '', messageId: '' }
                "
              />
              Antwort als Prozessnachricht (API v3)
            </label>
            <template v-if="message.processMessage">
              <label>
                Prozessmodell der Antwort
                <input
                  v-model="message.processMessage.processModelId"
                  maxlength="1000"
                  :disabled="disabled"
                />
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
          </section>
          <section class="scenario-section">
            <h4>Einreichung</h4>
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
                <input
                  v-model="item.request.processMessage.messageId"
                  maxlength="1000"
                  :disabled="disabled"
                />
              </label>
            </template>
            <label v-if="scenario.pack.cases.length > 1" class="checkbox-label">
              <input v-model="scenario.sharedCase" type="checkbox" :disabled="disabled" />
              Folgeschritte im selben Vorgang senden (API v3)
            </label>
            <p v-if="item.request.processMessage" class="small-note">
              Prozess: {{ item.request.processMessage.processModelId }} · Nachricht:
              {{ item.request.processMessage.messageId }}. Dieses Angebot muss an der Gegenstelle eingerichtet
              sein.
            </p>
            <p v-if="item.request.replyOffer" class="small-note">
              Antwortangebot: {{ item.request.replyOffer.schemaUri }}
            </p>
          </section>
        </template>
        <fieldset v-if="option === 'variables'" class="scenario-flat-group" :disabled="disabled">
          <ScenarioVariables v-model="scenario" />
        </fieldset>
        <fieldset v-if="option === 'expectations'" class="scenario-flat-group" :disabled="disabled">
          <ScenarioExpectations v-model="scenario" />
        </fieldset>
      </section>
    </template>
    <ScenarioOffers
      v-show="page === 'options' && option === 'offers'"
      expanded
      :session="session"
      :assignment="assignment"
      :item="item"
      :disabled="disabled"
      @apply="Object.assign(item, $event)"
    />
    <p v-if="authoringError" role="alert">{{ authoringError }}</p>
  </div>
</template>
