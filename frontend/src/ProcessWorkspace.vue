<script setup>
import { defineAsyncComponent } from 'vue';

import demo from './examples/test-process.bpmn?raw';
import FileDropInput from './FileDropInput.vue';
const BpmnDiagram = defineAsyncComponent(() => import('./BpmnDiagram.vue'));
import { useProcessWorkspace } from './process/useProcessWorkspace.js';
const props = defineProps({ session: Object, busy: Boolean, visible: Boolean, context: Object });
const emit = defineEmits(['busy', 'activity', 'fatal', 'send', 'event-log']);
const controller = useProcessWorkspace(props, emit);
const {
  model,
  xml,

  selectedId,
  search,
  region,
  page,
  pending,
  error,
  notice,
  modelId,
  messageId,
  schemaUri,
  mimeType,
  selectionHeading,
  remember,
  selected,

  currentMapping,
  filtered,
  highlights,
  mappingDirty,
  disabled,
  connected,
  labels,
  load,
  file,
  select,
  persist,
  apply,
  importMapping,
  download,
  discover,
  send,
} = controller;
</script>
<template>
  <section class="tool-section" aria-labelledby="process-title" :aria-busy="pending">
    <h2 id="process-title">Prozesse und BPMN</h2>
    <p>
      Ein lokales BPMN-Modell öffnen, eine Nachricht auswählen und ihre FIT-Connect-Kennungen prüfen. Ein
      Modellklick oder eine Empfängersuche versendet nichts und führt keinen Prozess aus.
    </p>
    <div class="process-model-header">
      <h3 v-if="model">{{ model.name }}</h3>
      <details class="process-model-picker" :open="!model">
        <summary>{{ model ? 'Anderes BPMN-Modell öffnen' : 'BPMN-Modell auswählen' }}</summary>
        <div class="client-fields">
          <FileDropInput
            id="bpmn-file"
            label="BPMN-2.0-Modell öffnen"
            accept=".bpmn,.xml,application/xml"
            :disabled="disabled"
            @files="file"
          >
            UTF-8, höchstens 2 MiB. Die Modelldatei bleibt lokal.
          </FileDropInput>
          <button class="button secondary" :disabled="disabled" @click="load(demo)">
            Fiktiven Demo-Prozess öffnen
          </button>
        </div>
      </details>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="pending" role="status">Modell oder Empfänger werden geprüft …</p>
    <template v-if="model">
      <p v-if="context">
        Nachrichtenbezug: {{ context.processModelId }} · {{ context.messageId }}.
        {{
          highlights.length
            ? 'Passende Elemente sind grün hervorgehoben.'
            : 'Keine passende Zuordnung in diesem Modell gefunden.'
        }}
        Die Hervorhebung bestätigt keinen ausgeführten Prozessschritt.
      </p>
      <BpmnDiagram
        v-if="model.hasDiagram"
        :xml="xml"
        :selected-id="selectedId"
        :highlights="highlights"
        :visible="visible"
        @select="select"
      />
      <p v-else>Dieses Modell hat keine Diagrammkoordinaten. Wählen Sie eine Nachricht in der Liste.</p>
      <label class="process-message-search" for="bpmn-search">
        Nachricht oder BPMN-ID in diesem Modell suchen
        <input id="bpmn-search" v-model="search" type="search" maxlength="256" />
      </label>
      <ul class="bpmn-message-list">
        <li v-for="row in filtered" :key="row.elementId">
          <button
            class="button secondary"
            :aria-pressed="selectedId === row.elementId"
            :disabled="disabled"
            @click="select(row.elementId)"
          >
            {{ row.label }} · {{ labels[row.direction] }} · {{ row.elementId }}
          </button>
        </li>
      </ul>
      <p v-if="!filtered.length">Keine auswählbaren Nachrichten gefunden.</p>
      <details class="process-model-identity">
        <summary>Modellidentität und Zuordnung</summary>
        <p>
          SHA-256:
          <code>{{ model.sha256 }}</code>
        </p>
        <p>
          BPMN-IDs und Anzeigenamen sind keine automatisch gültigen FIT-Connect-Kennungen. Die Demo verwendet
          ausdrücklich hinterlegte Testkennungen. Bei eigenen Modellen müssen Sie die vereinbarten Kennungen
          prüfen oder ergänzen.
        </p>
        <label class="checkbox-label">
          <input v-model="remember" type="checkbox" :disabled="disabled" @change="persist" />
          Kennungszuordnung für diesen Modell-Fingerabdruck lokal merken
        </label>
        <div class="client-actions">
          <button class="button secondary" @click="download">Zuordnung als JSON exportieren</button>
          <FileDropInput
            id="bpmn-mapping-file"
            label="Zuordnung importieren"
            accept=".json,application/json"
            :disabled="disabled"
            @files="importMapping"
          >
            JSON, höchstens 256 KiB. Der Modell-Fingerabdruck muss passen.
          </FileDropInput>
        </div>
      </details>
      <section v-if="selected" class="tool-section" aria-labelledby="process-selection-title">
        <h3 id="process-selection-title" ref="selectionHeading" tabindex="-1">
          Ausgewählte Nachricht: {{ selected.label }}
        </h3>
        <dl>
          <dt>BPMN-Element-ID</dt>
          <dd>
            <code>{{ selected.elementId }}</code>
          </dd>
          <dt>BPMN-Nachrichtenreferenz</dt>
          <dd>
            <code>{{ selected.bpmnMessageId }}</code>
          </dd>
          <template v-if="selected.sourceId">
            <dt>Fluss</dt>
            <dd>{{ selected.sourceId }} → {{ selected.targetId }}</dd>
          </template>
        </dl>
        <form @submit.prevent="apply">
          <fieldset :disabled="disabled">
            <legend>Vereinbarte FIT-Connect-Zuordnung</legend>
            <div class="client-fields">
              <label for="bpmn-model-id">
                FIT-Connect-Modellkennung
                <input id="bpmn-model-id" v-model="modelId" required maxlength="1024" />
              </label>
              <label for="bpmn-message-id">
                FIT-Connect-Nachrichtenkennung
                <input id="bpmn-message-id" v-model="messageId" required maxlength="1024" />
              </label>
              <label for="bpmn-schema">
                Schemahinweis (optional)
                <input id="bpmn-schema" v-model="schemaUri" maxlength="4096" />
              </label>
              <label for="bpmn-mime">
                Format des Schemahinweises
                <select id="bpmn-mime" v-model="mimeType">
                  <option value="application/json">JSON</option>
                  <option value="application/xml">XML</option>
                </select>
              </label>
            </div>
            <button class="button secondary" type="submit">Kennungszuordnung übernehmen</button>
          </fieldset>
        </form>
        <p v-if="mappingDirty" role="status">
          Die eingegebenen Kennungen sind noch nicht übernommen. Bitte die Zuordnung bestätigen, bevor Sie
          nach Empfängern suchen.
        </p>
        <p v-if="currentMapping && !mappingDirty">
          Diese Auswahl steht auch beim Antworten auf eine geprüfte Einreichung bereit. Der angebotene
          Antwortkanal und seine Schemata bleiben maßgeblich.
        </p>
        <form @submit.prevent="discover()">
          <fieldset :disabled="disabled || !connected || !currentMapping || mappingDirty">
            <legend>Passende Empfänger für eine Prozess-Einreichung</legend>
            <label for="bpmn-region">
              Region
              <input id="bpmn-region" v-model="region" required pattern="DE[0-9]{0,12}" maxlength="14" />
              <small>DE für bundesweit oder eine vereinbarte Regionalkennung.</small>
            </label>
            <button class="button" type="submit">Passende Prozess-Destinations suchen</button>
          </fieldset>
        </form>
        <p v-if="!connected">
          Die lokale Modellansicht funktioniert ohne Anmeldung. Empfängersuche und Prozessversand benötigen
          eine v3-Sitzung.
        </p>
      </section>
      <section v-if="page" class="tool-section" aria-labelledby="process-results-title">
        <h3 id="process-results-title">Passende Destinations ({{ page.totalCount }})</h3>
        <p>
          Der Suchdienst liefert öffentliche Destination IDs. Beim Übernehmen werden die Angebote erneut
          geladen. Die Versandprüfung bleibt ein eigener Schritt.
        </p>
        <article v-for="row in page.destinations" :key="row.destinationId" class="tool-section">
          <h4>
            <code>{{ row.destinationId }}</code>
          </h4>
          <ul>
            <li v-for="schema in row.schemas" :key="`${schema.schemaUri}/${schema.mimeType}`">
              {{ schema.mimeType }} · {{ schema.schemaUri }}
            </li>
          </ul>
          <button class="button secondary" :disabled="disabled" @click="send(row)">
            Als Prozess-Einreichung vorbereiten
          </button>
        </article>
        <p v-if="!page.destinations.length">
          Keine passenden öffentlichen Empfänger gefunden. Berechtigungen und Angebote der gewünschten
          Destination prüfen.
        </p>
        <div class="client-actions">
          <button
            class="button secondary"
            :disabled="disabled || page.offset === 0"
            @click="discover(page.offset - 20)"
          >
            Vorherige Seite
          </button>
          <button
            class="button secondary"
            :disabled="
              disabled || page.offset + page.destinations.length >= page.totalCount || page.offset >= 10000
            "
            @click="discover(page.offset + 20)"
          >
            Nächste Seite
          </button>
        </div>
      </section>
    </template>
  </section>
</template>
