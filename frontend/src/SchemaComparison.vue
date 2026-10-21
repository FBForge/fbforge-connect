<script setup>
import { ref, shallowRef, computed, nextTick, onBeforeUnmount } from 'vue';
import FileDropInput from './FileDropInput.vue';
import { compareSchemas, comparisonError, COMPARISON_BYTES } from './schema-comparison.js';
import { downloadLocal } from './local-download.js';
const before = shallowRef(null),
  after = shallowRef(null),
  result = shallowRef(null);
const format = ref('json'),
  error = ref(''),
  busy = ref(false),
  query = ref(''),
  heading = ref(null);
let revision = 0;
const rows = computed(
  () =>
    result.value?.changes.filter((row) =>
      `${row.path} ${row.reason}`.toLocaleLowerCase('de').includes(query.value.toLocaleLowerCase('de')),
    ) || [],
);
async function load(files, side) {
  const stamp = ++revision;
  error.value = '';
  busy.value = true;
  result.value = null;
  try {
    const file = files[0];
    if (file.size > COMPARISON_BYTES) throw new Error('schema_comparison_limit');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (stamp !== revision) return;
    (side === 'before' ? before : after).value = { name: file.name, text };
    if (!before.value || !after.value) format.value = text.trimStart().startsWith('<') ? 'xsd' : 'json';
  } catch (cause) {
    if (stamp === revision) error.value = comparisonError(cause);
  } finally {
    if (stamp === revision) busy.value = false;
  }
}
async function compare() {
  if (busy.value || !before.value || !after.value) return;
  error.value = '';
  result.value = null;
  query.value = '';
  try {
    result.value = compareSchemas(before.value.text, after.value.text, format.value);
    await nextTick();
    heading.value?.focus();
    heading.value?.scrollIntoView({ block: 'start' });
  } catch (cause) {
    error.value = comparisonError(cause);
  }
}
function demo() {
  revision++;
  busy.value = false;
  format.value = 'json';
  before.value = {
    name: 'antrag-v1.schema.json',
    text: JSON.stringify({
      type: 'object',
      properties: { vorname: { type: 'string' }, status: { enum: ['offen', 'fertig'] } },
    }),
  };
  after.value = {
    name: 'antrag-v2.schema.json',
    text: JSON.stringify({
      type: 'object',
      required: ['vorname'],
      properties: {
        vorname: { type: 'string', minLength: 1 },
        status: { enum: ['fertig'] },
        referenz: { type: 'string' },
      },
    }),
  };
  void compare();
}
onBeforeUnmount(() => revision++);
const show = (value) => (value === null ? 'Nicht vorhanden' : JSON.stringify(value, null, 2));
</script>
<template>
  <section class="tool-section" aria-labelledby="schema-comparison-title">
    <h2 id="schema-comparison-title">Schema-Versionen vergleichen</h2>
    <p>
      Wählen Sie die bisherige und die neue Version. Der Vergleich läuft lokal und zeigt geänderte Felder und
      Regeln. Es werden keine externen Quellen geladen.
    </p>
    <div class="client-fields">
      <div>
        <FileDropInput
          id="compare-before"
          label="Bisheriges Schema"
          accept=".json,.xsd,application/json,application/xml,text/xml"
          :disabled="busy"
          @files="load($event, 'before')"
        />
        <p v-if="before" class="small-note">{{ before.name }}</p>
      </div>
      <div>
        <FileDropInput
          id="compare-after"
          label="Neues Schema"
          accept=".json,.xsd,application/json,application/xml,text/xml"
          :disabled="busy"
          @files="load($event, 'after')"
        />
        <p v-if="after" class="small-note">{{ after.name }}</p>
      </div>
      <label for="compare-format">
        Schemaformat
        <select id="compare-format" v-model="format" :disabled="busy" @change="result = null">
          <option value="json">JSON Schema</option>
          <option value="xsd">XML Schema (XSD)</option>
        </select>
      </label>
    </div>
    <p class="small-note">
      Maximal 512 KiB pro Datei. ZIP-Archive bitte vorher lokal entpacken. Bei XSD werden die ausgewählten
      Dateien verglichen, Imports und Includes bleiben als Verweise sichtbar.
    </p>
    <div class="client-actions">
      <button class="button" type="button" :disabled="busy || !before || !after" @click="compare">
        Schemata vergleichen
      </button>
      <button class="button secondary" type="button" :disabled="busy" @click="demo">
        Fiktiven Beispielvergleich öffnen
      </button>
    </div>
    <p v-if="busy" role="status">Schemadatei wird gelesen …</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="result" class="schema-comparison-result">
      <h3 ref="heading" class="comparison-result-heading" tabindex="-1">
        {{
          result.changes.length
            ? `${result.changes.length} Strukturänderungen`
            : 'Keine Strukturunterschiede gefunden'
        }}
      </h3>
      <p>
        {{ result.counts.added }} hinzugefügt, {{ result.counts.removed }} entfernt,
        {{ result.counts.changed }} geändert.
      </p>
      <p class="small-note">{{ result.note }}</p>
      <div class="client-actions">
        <button
          class="button secondary"
          type="button"
          @click="downloadLocal(JSON.stringify(result, null, 2), 'schema-vergleich.json')"
        >
          Vergleich speichern
        </button>
      </div>
      <label v-if="result.changes.length" for="comparison-search">
        Feld oder Änderung suchen
        <input id="comparison-search" v-model="query" type="search" />
      </label>
      <p v-if="result.changes.length && !rows.length">
        Keine passenden Änderungen.
        <button type="button" class="button secondary" @click="query = ''">Suche zurücksetzen</button>
      </p>
      <ul class="schema-change-list">
        <li v-for="row in rows" :key="row.path">
          <h4>{{ row.reason }}</h4>
          <code>{{ row.path }}</code>
          <details>
            <summary>Bisherige und neue Regeln anzeigen</summary>
            <div class="client-fields">
              <div>
                <h5>Bisher</h5>
                <pre tabindex="0">{{ show(row.before) }}</pre>
              </div>
              <div>
                <h5>Neu</h5>
                <pre tabindex="0">{{ show(row.after) }}</pre>
              </div>
            </div>
          </details>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.comparison-result-heading {
  scroll-margin-block-start: 16px;
}
</style>
