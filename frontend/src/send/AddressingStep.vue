<script setup>
import ServiceNames from './ServiceNames.vue';
import SenderDestination from '../SenderDestination.vue';
import { serviceLabel } from '../service-label.js';
const props = defineProps({ controller: Object, session: Object, visible: Boolean });
const emit = defineEmits(['activity', 'fatal']);
const {
  target,
  source,
  service,
  serviceName,
  region,
  caseId,
  addressing,
  sendStep,
  recipientButton,
  recipient,
  processChoice,
  selectedService,
  loadRecipient,
  disabled,
} = props.controller;
</script>
<template>
  <fieldset v-show="sendStep === 0" data-send-step="0" :disabled="disabled">
    <legend tabindex="-1">Adressierung</legend>
    <div class="client-fields send-address-fields">
      <label for="send-target">
        <span id="send-target-label">Empfänger-Destination</span>
        <input
          id="send-target"
          aria-labelledby="send-target-label"
          type="text"
          v-model="target"
          required
          maxlength="36"
          placeholder="Destination ID"
        />
        <button
          ref="recipientButton"
          class="button secondary"
          type="button"
          :disabled="!target.trim()"
          @click="loadRecipient"
        >
          Leistungen laden
        </button>
      </label>
      <div v-if="recipient" class="send-service-selection">
        <label v-if="recipient.services.length || addressing !== 'process'" for="send-service">
          Verwaltungsleistung
          <select id="send-service" v-model="service" required :disabled="!recipient?.services.length">
            <option value="" disabled>Bitte zuerst Empfängerleistungen laden</option>
            <option v-for="item in recipient?.services || []" :key="item.identifier" :value="item.identifier">
              {{ serviceLabel(item.identifier, item.name).option }}
            </option>
          </select>
          <small v-if="service">
            {{
              serviceLabel(service, selectedService?.name).hasName
                ? `LeiKa / Leistungskennung: ${serviceLabel(service).code}`
                : 'Auswahl nach Leistungskennung. Eine Bezeichnung können Sie unter „Weitere Adressierungsoptionen“ ergänzen.'
            }}
          </small>
        </label>
        <label v-else for="send-service">
          Leistung des Vorgangs
          <input
            id="send-service"
            v-model="service"
            :disabled="!recipient"
            type="text"
            required
            maxlength="1024"
            placeholder="Leistungs-URN des Vorgangs"
          />
          <small>Diese Prozess-Destination bietet keine eigenen Verwaltungsleistungen an.</small>
        </label>
        <ServiceNames
          v-if="recipient?.services.length"
          :services="recipient.services"
          :context-key="`${session?.sessionId}:${target.trim().toLowerCase()}`"
          :disabled="disabled"
          @names="
            (names) => {
              if (Object.hasOwn(names, service) && (!serviceName || serviceName === service))
                serviceName = names[service];
              for (const item of recipient.services)
                if (Object.hasOwn(names, item.identifier)) item.name = names[item.identifier];
            }
          "
        />
      </div>
      <label v-if="session?.apiVersion === 'v3' && addressing === 'process'" for="send-process">
        Prozessnachricht
        <select id="send-process" v-model="processChoice" :disabled="!recipient?.processes.length">
          <option v-for="(item, index) in recipient?.processes || []" :key="index" :value="index">
            {{ item.messageId }} · {{ item.processModelId }}
          </option>
        </select>
      </label>
      <SenderDestination
        v-if="session?.apiVersion === 'v3'"
        v-model="source"
        :session="session"
        :busy="disabled"
        :visible="visible && sendStep === 0"
        @activity="emit('activity', $event)"
        @fatal="emit('fatal', $event)"
      />
    </div>
    <p v-if="!recipient" class="small-note">
      Geben Sie die Empfänger-Destination ein und laden Sie deren Leistungen.
    </p>
    <details class="address-options" :open="addressing === 'process'">
      <summary>Weitere Adressierungsoptionen</summary>
      <div class="client-fields">
        <label v-if="session?.apiVersion === 'v3'" for="send-address">
          Adressierungsart
          <select id="send-address" v-model="addressing">
            <option value="service">Verwaltungsleistung</option>
            <option value="process">Prozessnachricht</option>
          </select>
        </label>

        <label for="send-case">
          Case ID (optional)
          <input
            id="send-case"
            type="text"
            v-model="caseId"
            maxlength="36"
            placeholder="Leer lassen für einen neuen Vorgang"
          />
        </label>
        <label for="send-service-name">
          Bezeichnung der Leistung
          <input
            id="send-service-name"
            :disabled="!recipient"
            type="text"
            v-model="serviceName"
            required
            maxlength="256"
          />
        </label>
        <label for="send-region">
          Region / ARS
          <input id="send-region" type="text" v-model="region" maxlength="128" />
        </label>
      </div>
    </details>
    <p v-if="session?.apiVersion === 'v2'">
      API v2 bestimmt den Absender über die Zugangsdaten. Prozessadressierung steht mit API v3 zur Verfügung.
    </p>
  </fieldset>
</template>
