<script setup>
import { ref, computed } from 'vue';
import FileDropInput from '../FileDropInput.vue';
import CopyValue from '../CopyValue.vue';
import { downloadLocal } from '../local-download.js';
import {
  channelTemplate,
  createChannelSchema,
  readChannelFile,
  CHANNEL_FIELD_TYPES,
} from '../channel-schemas.js';
defineProps({ disabled: Boolean });
const definition = ref(channelTemplate()),
  statuses = ref(definition.value.statuses.join('\n'));
const error = ref(''),
  notice = ref(''),
  reading = ref(false);
const result = computed(() => {
  try {
    return createChannelSchema({
      ...definition.value,
      statuses: statuses.value
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
  } catch {
    return null;
  }
});
const typeLabels = {
  string: 'Text',
  integer: 'Ganze Zahl',
  number: 'Zahl',
  boolean: 'Ja/Nein',
  date: 'Datum',
  'date-time': 'Datum und Uhrzeit',
  'string-array': 'Textliste',
};
function template(kind) {
  definition.value = channelTemplate(kind);
  statuses.value = definition.value.statuses.join('\n');
  error.value = '';
  notice.value = '';
}
function add() {
  if (definition.value.fields.length >= 32) return;
  let n = 1;
  while (definition.value.fields.some((f) => f.name === `feld${n}`)) n++;
  definition.value.fields.push({ name: `feld${n}`, title: 'Eigene Angabe', type: 'string', required: false });
}
async function load(files) {
  if (reading.value) return;
  reading.value = true;
  error.value = '';
  try {
    definition.value = await readChannelFile(files[0], true);
    statuses.value = definition.value.statuses.join('\n');
    notice.value = 'Schemaentwurf lokal geladen.';
  } catch {
    error.value =
      'Dieser Entwurf ist ungültig oder zu groß. Bitte einen unveränderten FBForge-Connect-Schemaentwurf auswählen.';
  } finally {
    reading.value = false;
  }
}
async function save(kind) {
  if (!result.value) return;
  const name = {
    schema: 'antwort.schema.json',
    example: 'antwort.beispiel.json',
    draft: 'antwort.entwurf.json',
  }[kind];
  const saved = await downloadLocal(
    JSON.stringify(result.value[kind], null, 2),
    name,
    kind === 'schema' ? 'application/schema+json' : 'application/json',
  );
  if (!saved) return;
  notice.value =
    'Datei gespeichert oder an den Browser übergeben. Für den Austausch Schema-Kennung und Definition mit der Gegenstelle abstimmen.';
}
</script>
<template>
  <section class="tool-section" aria-labelledby="channel-designer-title">
    <h2 id="channel-designer-title">Antwortschema erstellen</h2>
    <p>
      Fachliche Statusmitteilungen und Nachforderungen definieren. Der Assistent arbeitet lokal. Eine
      Statusmeldung ersetzt keine technische FIT-Connect-Annahme oder -Ablehnung.
    </p>
    <details>
      <summary>Vorlage oder gespeicherten Entwurf öffnen</summary>
      <p>Eine Vorlage ersetzt die aktuellen Eingaben. Exportieren Sie einen vorhandenen Entwurf vorher.</p>
      <div class="client-actions">
        <button class="button secondary" :disabled="disabled || reading" @click="template('status')">
          Vorlage Statusmitteilung
        </button>
        <button class="button secondary" :disabled="disabled || reading" @click="template('request')">
          Vorlage Nachforderung
        </button>
      </div>
      <FileDropInput
        id="channel-draft"
        label="Schemaentwurf öffnen"
        accept=".json,application/json"
        :disabled="disabled || reading"
        @files="load"
      >
        FBForge-Connect-Entwurf, höchstens 2 MiB. Beliebige bestehende JSON-Schemas werden hier nicht
        umgeschrieben.
      </FileDropInput>
    </details>
    <fieldset :disabled="disabled || reading">
      <legend>Schema definieren</legend>
      <div class="client-fields">
        <label for="channel-uri">
          Schema-Kennung mit Version
          <input id="channel-uri" v-model="definition.schemaUri" maxlength="4096" required />
          <small>
            HTTPS-URI oder vereinbarte URN. Für inkompatible Änderungen eine neue Kennung verwenden.
          </small>
        </label>
        <label for="channel-title">
          Bezeichnung
          <input id="channel-title" v-model="definition.title" maxlength="160" required />
        </label>
      </div>
      <div class="client-fields">
        <label for="channel-description">
          Beschreibung
          <textarea
            id="channel-description"
            v-model="definition.description"
            maxlength="2000"
            rows="2"
          ></textarea>
        </label>
        <label for="channel-statuses">
          Erlaubte fachliche Statuswerte
          <textarea
            id="channel-statuses"
            v-model="statuses"
            rows="4"
            maxlength="1100"
            spellcheck="false"
          ></textarea>
          <small>
            Ein Wert pro Zeile, maximal 16. Kleinbuchstaben, Ziffern, Bindestrich und Unterstrich. Das Feld
            „status“ ist immer erforderlich.
          </small>
        </label>
      </div>
      <article v-for="(field, index) in definition.fields" :key="index" class="schema-field">
        <h3>Angabe {{ index + 1 }}</h3>
        <div class="client-fields">
          <label :for="`channel-name-${index}`">
            JSON-Feldname
            <input :id="`channel-name-${index}`" v-model="field.name" maxlength="64" required />
          </label>
          <label :for="`channel-label-${index}`">
            Beschriftung
            <input :id="`channel-label-${index}`" v-model="field.title" maxlength="160" required />
          </label>
          <label :for="`channel-type-${index}`">
            Datentyp
            <select :id="`channel-type-${index}`" v-model="field.type">
              <option v-for="type in CHANNEL_FIELD_TYPES" :key="type" :value="type">
                {{ typeLabels[type] }}
              </option>
            </select>
          </label>
        </div>
        <div class="client-actions">
          <label class="checkbox-label">
            <input v-model="field.required" type="checkbox" />
            Pflichtangabe
          </label>
          <button class="button secondary" @click="definition.fields.splice(index, 1)">
            Angabe {{ index + 1 }} entfernen
          </button>
        </div>
      </article>
      <button class="button secondary" :disabled="definition.fields.length >= 32" @click="add">
        Angabe hinzufügen
      </button>
    </fieldset>
    <p v-if="!result" role="alert">
      Bitte Kennung, Bezeichnung, eindeutige Feldnamen und Statuswerte prüfen. Bis zu 32 Angaben sind möglich.
      „status“ ist reserviert.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="result">
      <h3>Schema exportieren</h3>
      <CopyValue label="Schema-Kennung" :value="result.schema.$id" />
      <div class="client-actions">
        <button class="button" :disabled="disabled || reading" @click="save('schema')">
          JSON-Schema herunterladen
        </button>
        <button class="button secondary" :disabled="disabled || reading" @click="save('example')">
          Fiktives Beispiel herunterladen
        </button>
        <button class="button secondary" :disabled="disabled || reading" @click="save('draft')">
          Schemaentwurf speichern
        </button>
      </div>
      <details>
        <summary>Antwortschema mit der Gegenstelle verwenden</summary>
        <ol>
          <li>
            Schema und fiktives Beispiel exportieren. Den Entwurf zusätzlich speichern, um ihn später
            weiterzubearbeiten.
          </li>
          <li>
            Beim Empfänger die Kennung als unterstütztes Antwortschema der Leistung hinterlegen. In
            „Destinations“ kann die Kennung aus der Schemadatei übernommen werden. Änderungen werden separat
            bestätigt.
          </li>
          <li>
            Der Sender lädt die aktualisierten Leistungen und wählt dieses Antwortschema für den Antwortkanal.
            Für Prozessantworten zusätzlich die vereinbarten Nachrichtenkennungen anbieten.
          </li>
          <li>
            Die Schema-Datei beiden Seiten lokal bereitstellen oder selbst unter der vereinbarten
            HTTPS-Adresse veröffentlichen. Eine URN ist eine Kennung und keine Downloadadresse. FIT-Connect
            erhält die Kennung, nicht automatisch diese Datei.
          </li>
        </ol>
        <p>
          Beim Antworten das passende lokale Antwortschema importieren und den Inhalt prüfen. Empfangene
          Antworten mit derselben Definition prüfen. Es werden keine Destinations automatisch geändert und
          keine Nachrichten versendet.
        </p>
      </details>
      <details>
        <summary>JSON-Schema ansehen</summary>
        <pre class="channel-schema-source" data-testid="channel-schema">{{
          JSON.stringify(result.schema, null, 2)
        }}</pre>
      </details>
      <details>
        <summary>Fiktives Beispiel ansehen</summary>
        <pre class="channel-schema-source" data-testid="channel-example">{{
          JSON.stringify(result.example, null, 2)
        }}</pre>
      </details>
    </template>
  </section>
</template>
<style scoped>
.schema-field {
  border-top: 1px solid var(--line);
  padding-block: 12px;
}
.schema-field h3 {
  margin: 0;
  font-size: 1rem;
}
.schema-field .client-fields {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(8rem, 0.6fr);
}
.schema-field .client-actions {
  margin-block: 4px;
}
@media (max-width: 650px) {
  .schema-field .client-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}

.channel-schema-source {
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
