<script setup>
import SchemaSourceConsent from '../SchemaSourceConsent.vue';
import DraftDataPreview from '../DraftDataPreview.vue';
import FileDropInput from '../FileDropInput.vue';
const props = defineProps({ controller: Object, session: Object, visible: Boolean });
const {
  schema,
  mime,
  dataText,
  dataFile,
  localValidationSchemas,
  dataValidation,
  skipSchemaValidation,
  sendStep,
  allowExternalSchemas,
  schemaAccess,
  schemaDocument,
  exampleButton,
  schemaContext,
  schemaChoice,
  exampleNotice,
  schemaOptions,
  loadLabels,
  createExample,
  disabled,
  checkData,
  addValidationSchemas,
} = props.controller;
</script>
<template>
  <fieldset v-show="sendStep === 1" data-send-step="1" :disabled="disabled">
    <legend tabindex="-1">Fachdaten</legend>
    <div class="send-schema-selection">
      <div class="client-fields">
        <label for="send-schema">
          Fachdaten-Schema
          <select v-if="schemaOptions.length > 1" id="send-schema" v-model="schemaChoice">
            <option v-for="(item, index) in schemaOptions" :key="index" :value="index">
              {{ item.mimeType === 'application/json' ? 'JSON' : 'XML' }} · {{ item.schemaUri }}
            </option>
          </select>
          <output v-else id="send-schema">
            {{
              schema
                ? `${mime === 'application/json' ? 'JSON' : 'XML'} · ${schema}`
                : 'Keine unterstützten Fachdaten-Schemata ausgewählt.'
            }}
          </output>
          <small>Wird aus der gewählten Leistung beziehungsweise Prozessnachricht übernommen.</small>
        </label>
      </div>
      <button class="button secondary" type="button" :disabled="disabled || !schema" @click="loadLabels">
        Schema-Beschriftungen laden
      </button>
    </div>
    <SchemaSourceConsent
      ref="schemaAccess"
      id="send-schema-sources"
      v-model="allowExternalSchemas"
      :disabled="disabled"
      :context-key="schemaContext"
    />

    <div class="client-actions">
      <button
        ref="exampleButton"
        class="button secondary"
        type="button"
        :disabled="!schema"
        @click="createExample"
      >
        Fiktive Beispieldaten erzeugen
      </button>
    </div>
    <p v-if="exampleNotice" class="small-note" role="status">{{ exampleNotice }}</p>
    <DraftDataPreview
      :schema-document="schemaDocument"
      :schema-uri="schema"
      :text="dataText"
      :file="dataFile"
      :mime-type="mime"
      :context-key="schemaContext"
      :disabled="disabled"
      @request-schema="!schemaDocument && loadLabels()"
    >
      <label v-if="!dataFile" for="send-data">
        Inhalt
        <textarea id="send-data" v-model="dataText" rows="8" required spellcheck="false"></textarea>
      </label>
      <p v-else>
        {{ dataFile.name }} · {{ (dataFile.size / 1024).toFixed(1) }} KiB
        <button class="button secondary" type="button" @click="dataFile = null">Eingabefeld verwenden</button>
      </p>
    </DraftDataPreview>
    <FileDropInput
      id="send-data-file"
      label="Fachdaten aus Datei (optional)"
      accept=".json,.xml,application/json,application/xml,text/xml"
      :disabled="disabled"
      @files="(files) => (dataFile = files[0] || null)"
    >
      Ohne Datei wird der Inhalt aus dem Eingabefeld verwendet.
    </FileDropInput>
    <div class="send-schema-validation">
      <h3>Fachdaten prüfen</h3>
      <p>
        JSON wird gegen das ausgewählte JSON-Schema geprüft, XML gegen die aufgelösten XSDs. Vor dem Versand
        läuft diese Prüfung automatisch.
      </p>
      <button class="button secondary" type="button" :disabled="disabled || !schema" @click="checkData">
        Fachdaten gegen Schema prüfen
      </button>
      <p v-if="dataValidation" class="status-badge ok" role="status">Fachdaten entsprechen dem Schema.</p>
      <p v-else class="small-note">
        Noch kein aktuelles Prüfergebnis. Änderungen an Inhalt, Schema oder Empfänger machen die Prüfung
        erneut erforderlich.
      </p>
    </div>
    <details class="data-schema-options">
      <summary>Lokale Schemata und technische Optionen</summary>
      <FileDropInput
        id="send-validation-schemas"
        label="Lokale Prüfschemata hinzufügen"
        accept=".json,.xsd,application/json,application/xml,text/xml"
        multiple
        :disabled="disabled"
        @files="addValidationSchemas"
      />
      <div v-for="item in localValidationSchemas" :key="item.id" class="client-fields">
        <label :for="`send-local-schema-${item.id}`">
          Schema-URI für {{ item.file.name }}
          <input
            :id="`send-local-schema-${item.id}`"
            v-model="item.uri"
            type="text"
            maxlength="4096"
            :disabled="disabled"
          />
        </label>
        <button
          class="button secondary"
          type="button"
          :disabled="disabled"
          @click="localValidationSchemas = localValidationSchemas.filter((entry) => entry.id !== item.id)"
        >
          Prüfschema entfernen
        </button>
      </div>
      <p class="small-note">
        Bei JSON wird die $id übernommen. Die Kennung muss zum gewählten Schema passen. Für XSD-Imports können
        Sie weitere Dateien und deren Schema-URIs hinterlegen. Maximal 2 MiB pro Datei.
      </p>
      <label class="checkbox-label">
        <input v-model="skipSchemaValidation" type="checkbox" :disabled="disabled" />
        Für einen bewussten Negativtest ohne Fachdaten-Schemaprüfung senden
      </label>
      <p v-if="skipSchemaValidation" class="small-note">
        Die Fachdaten werden vor dem Versand nicht gegen das Schema geprüft. Das SDK prüft weiterhin das
        Format und das Empfängerangebot.
      </p>
    </details>
  </fieldset>
</template>
