<script setup>
import { reactive, toRefs } from 'vue';
import { demoSchemas, downloadDemoSchema } from '../demo-data.js';
import SchemaIdentifierFile from '../SchemaIdentifierFile.vue';
const props = defineProps({ controller: Object });
const {
  kind,
  wizardStep,
  disabled,
  addressing,
  service,
  model,
  message,
  regions,
  schema,
  mime,
  replySchema,
} = toRefs(reactive(props.controller));
</script>
<template>
  <fieldset v-if="kind === 'A'" v-show="wizardStep === 1" data-setup-step="1" :disabled="disabled">
    <legend>Empfangene Fachdaten festlegen</legend>
    <p>
      Das Schema beschreibt die Struktur Ihrer Testdaten. Verwenden Sie die Kennung aus Ihrer
      Testkonfiguration. Eine Destination kann später um weitere Angebote ergänzt werden.
    </p>
    <div class="client-fields">
      <label for="setup-addressing">
        Adressierung
        <select id="setup-addressing" v-model="addressing">
          <option value="service">Über eine Verwaltungsleistung</option>
          <option value="process">Über eine v3-Prozessnachricht</option>
        </select>
      </label>
      <label v-if="addressing === 'service'" for="setup-service">
        Leistungsschlüssel (LeiKa)
        <input
          id="setup-service"
          v-model="service"
          required
          maxlength="512"
          pattern="([0-9]{14}|urn:de:fim:leika:leistung:[0-9]{14})"
        />
        <small>
          14 Ziffern oder die vollständige LeiKa-URN. Der vorbelegte Wert dient nur einem fiktiven Testfall.
        </small>
      </label>
      <template v-else>
        <label for="setup-model">
          Prozessmodell-ID
          <input id="setup-model" v-model="model" required maxlength="1024" />
        </label>
        <label for="setup-message">
          Nachrichten-ID
          <input id="setup-message" v-model="message" required maxlength="1024" />
        </label>
      </template>
      <label for="setup-regions">
        Zuständigkeitsgebiet
        <input id="setup-regions" v-model="regions" required maxlength="1024" />
        <small>
          „DE“ für einen bundesweiten Test oder den Regionalschlüssel. Mehrere Gebiete mit Komma trennen.
        </small>
      </label>
      <div>
        <button
          type="button"
          class="button secondary"
          @click="
            schema = demoSchemas.application.schemaUri;
            mime = 'application/json';
            replySchema = demoSchemas.reply.schemaUri;
          "
        >
          Mitgelieferte TEST-Schemata einsetzen
        </button>
        <p class="small-note">
          Fiktives Antrags- und Antwortschema für einen ersten Test. Kein amtliches FIM-/XÖV-Schema. Im
          Test-Client ohne externe Schemafreigabe nutzbar.
        </p>
        <div class="client-actions">
          <button type="button" class="button secondary" @click="downloadDemoSchema('application')">
            Antragsschema herunterladen
          </button>
          <button type="button" class="button secondary" @click="downloadDemoSchema('reply')">
            Antwortschema herunterladen
          </button>
        </div>
      </div>
      <label for="setup-schema">
        Schema-Kennung / URI
        <input
          id="setup-schema"
          v-model="schema"
          required
          maxlength="4096"
          placeholder="https://… oder urn:…"
        />
      </label>
      <label for="setup-mime">
        Datenformat
        <select id="setup-mime" v-model="mime">
          <option value="application/json">JSON</option>
          <option value="application/xml">XML</option>
        </select>
      </label>
      <label v-if="addressing === 'service'" for="setup-reply-schema">
        Schema für Antworten (optional)
        <input id="setup-reply-schema" v-model="replySchema" maxlength="4096" />
        <small>Eintragen, wenn der Testantrag Antworten über FIT-Connect anbieten soll.</small>
      </label>
      <SchemaIdentifierFile
        v-if="addressing === 'service'"
        id="setup-reply-file"
        :context-key="`${session?.sessionId}/${addressing}/${service}`"
        :disabled="disabled"
        label="Antwortschema-Kennung aus JSON-Datei übernehmen"
        @select="(uri) => (replySchema = uri)"
      />
    </div>
  </fieldset>
</template>
