<script setup>
import { computed } from 'vue';
const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: Boolean,
  prefix: { type: String, default: 'offer' },
});
const emit = defineEmits(['update:modelValue']);
const groups = [
  { key: 'publicServices', label: 'Leistungen', schema: 'submissionSchemas' },
  { key: 'processMessages', label: 'Prozessnachrichten', schema: 'schemas' },
];
const total = computed(
  () => props.modelValue.publicServices.length + props.modelValue.processMessages.length,
);
function update(action) {
  if (props.disabled) return;
  const next = JSON.parse(JSON.stringify(props.modelValue));
  action(next);
  emit('update:modelValue', next);
}
function set(group, index, key, value) {
  update((next) => (next[group][index][key] = value));
}
function add(group) {
  update((next) =>
    next[group].push(
      group === 'publicServices'
        ? {
            identifier: '',
            regions: ['DE'],
            submissionSchemas: [{ schemaUri: '', mimeType: 'application/json' }],
          }
        : {
            processModelId: '',
            messageId: '',
            regions: ['DE'],
            schemas: [{ schemaUri: '', mimeType: 'application/json' }],
          },
    ),
  );
}
function schema(group, index, key, schemaIndex, field, value) {
  update((next) => (next[group][index][key][schemaIndex][field] = value));
}
const csv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
</script>
<template>
  <fieldset :disabled="disabled">
    <legend>Unterstützte Leistungen und Prozessnachrichten ({{ total }})</legend>
    <p>
      Leistungen verwenden einen LeiKa-Schlüssel. Prozessnachrichten verwenden die vereinbarte Modell- und
      Nachrichtenkennung. Schemata beschreiben die erwarteten Fachdaten. Ihre Kennungen müssen mit dem
      sendenden System übereinstimmen.
    </p>
    <section v-for="group in groups" :key="group.key">
      <h4>{{ group.label }}</h4>
      <article v-for="(row, index) in modelValue[group.key]" :key="index" class="tool-section">
        <h5>{{ group.label }} · {{ index + 1 }}</h5>
        <div class="client-fields">
          <label v-if="group.key === 'publicServices'" :for="`${prefix}-${group.key}-${index}-id`">
            Leistungskennung (LeiKa-URN)
            <input
              :id="`${prefix}-${group.key}-${index}-id`"
              :value="row.identifier"
              required
              maxlength="512"
              placeholder="urn:de:fim:leika:leistung:…"
              @input="set(group.key, index, 'identifier', $event.target.value)"
            />
          </label>
          <template v-else>
            <label :for="`${prefix}-${index}-model`">
              FIT-Connect-Modellkennung
              <input
                :id="`${prefix}-${index}-model`"
                :value="row.processModelId"
                required
                maxlength="1024"
                @input="set(group.key, index, 'processModelId', $event.target.value)"
              />
            </label>
            <label :for="`${prefix}-${index}-message`">
              FIT-Connect-Nachrichtenkennung
              <input
                :id="`${prefix}-${index}-message`"
                :value="row.messageId"
                required
                maxlength="1024"
                @input="set(group.key, index, 'messageId', $event.target.value)"
              />
            </label>
          </template>
          <label :for="`${prefix}-${group.key}-${index}-regions`">
            Regionen
            <input
              :id="`${prefix}-${group.key}-${index}-regions`"
              :value="row.regions.join(', ')"
              required
              maxlength="1056"
              @input="set(group.key, index, 'regions', csv($event.target.value))"
            />
            <small>DE für bundesweit. Weitere Regionalkennungen mit Komma trennen.</small>
          </label>
        </div>
        <div v-for="(item, schemaIndex) in row[group.schema]" :key="schemaIndex" class="client-fields">
          <label :for="`${prefix}-${group.key}-${index}-schema-${schemaIndex}`">
            Fachdatenschema {{ schemaIndex + 1 }}
            <input
              :id="`${prefix}-${group.key}-${index}-schema-${schemaIndex}`"
              :value="item.schemaUri"
              required
              maxlength="4096"
              @input="schema(group.key, index, group.schema, schemaIndex, 'schemaUri', $event.target.value)"
            />
            <small>Vereinbarte HTTPS- oder URN-Kennung. Keine lokale Dateiangabe.</small>
          </label>
          <label :for="`${prefix}-${group.key}-${index}-mime-${schemaIndex}`">
            Datenformat
            <select
              :id="`${prefix}-${group.key}-${index}-mime-${schemaIndex}`"
              :value="item.mimeType"
              @change="schema(group.key, index, group.schema, schemaIndex, 'mimeType', $event.target.value)"
            >
              <option value="application/json">JSON</option>
              <option value="application/xml">XML</option>
            </select>
          </label>
          <button
            v-if="row[group.schema].length > 1"
            type="button"
            class="button secondary"
            @click="update((next) => next[group.key][index][group.schema].splice(schemaIndex, 1))"
          >
            Schema {{ schemaIndex + 1 }} entfernen
          </button>
        </div>
        <button
          type="button"
          class="button secondary"
          :disabled="row[group.schema].length >= 16"
          @click="
            update((next) =>
              next[group.key][index][group.schema].push({ schemaUri: '', mimeType: 'application/json' }),
            )
          "
        >
          Weiteres Schema
        </button>
        <label v-if="group.key === 'publicServices'" :for="`${prefix}-${index}-replies`">
          Unterstützte Antwortschemata (optional)
          <input
            :id="`${prefix}-${index}-replies`"
            :value="row.replyChannels?.fitConnect?.processStandards?.join(', ') || ''"
            maxlength="8192"
            @input="
              set(
                group.key,
                index,
                'replyChannels',
                $event.target.value.trim()
                  ? { fitConnect: { processStandards: csv($event.target.value) } }
                  : null,
              )
            "
          />
          <small>
            Vereinbarte Schemakennungen für FIT-Connect-Antworten, mit Komma getrennt. Leer bedeutet keinen
            angebotenen Antwortkanal.
          </small>
        </label>
        <button
          type="button"
          class="button secondary"
          @click="update((next) => next[group.key].splice(index, 1))"
        >
          {{ group.key === 'publicServices' ? 'Leistung' : 'Prozessnachricht' }} {{ index + 1 }} entfernen
        </button>
      </article>
      <button
        type="button"
        class="button secondary"
        :disabled="modelValue[group.key].length >= 32"
        @click="add(group.key)"
      >
        {{ group.key === 'publicServices' ? 'Leistung' : 'Prozessnachricht' }} hinzufügen
      </button>
    </section>
  </fieldset>
</template>
