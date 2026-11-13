<script setup>
import SchemaIdentifierFile from '../SchemaIdentifierFile.vue';
const props = defineProps({
  modelValue: Object,
  prefix: String,
  contextKey: String,
  session: Object,
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const channels = [
  ['eMail', 'E-Mail'],
  ['deMail', 'De-Mail'],
  ['elster', 'ELSTER-Transfer'],
  ['idBundDeMailbox', 'DeutschlandID-Bürgerpostfach'],
  ['fink', 'FINK (veraltet)'],
];
function change(key, value) {
  if (props.disabled) return;
  const next = JSON.parse(JSON.stringify(props.modelValue || {}));
  if (value === null) delete next[key];
  else next[key] = value;
  emit('update:modelValue', Object.keys(next).length ? next : null);
}
function standards(values) {
  change('fitConnect', values.length ? { processStandards: [...new Set(values)] } : null);
}
</script>
<template>
  <label :for="`${prefix}-replies`">
    Unterstützte Antwortschemata (optional)
    <input
      :id="`${prefix}-replies`"
      :disabled="disabled"
      :value="modelValue?.fitConnect?.processStandards?.join(', ') || ''"
      @input="
        standards(
          $event.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      "
    />
    <small>
      Vereinbarte Schemakennungen für FIT-Connect-Antworten, mit Komma getrennt. Leer entfernt nur den
      FIT-Connect-Antwortkanal.
    </small>
  </label>
  <SchemaIdentifierFile
    :session="session"
    :id="`${prefix}-reply-file`"
    :context-key="JSON.stringify([contextKey, modelValue])"
    :disabled="disabled || (modelValue?.fitConnect?.processStandards?.length || 0) >= 16"
    label="Unterstütztes Antwortschema aus JSON-Datei ergänzen"
    @select="standards([...(modelValue?.fitConnect?.processStandards || []), $event])"
  />
  <details>
    <summary>Weitere Antwortkanäle</summary>
    <p class="small-note">
      Angebot der empfangenden Stelle. FBForge Connect versendet Antworten über FIT-Connect. Andere Kanäle
      werden hier nur konfiguriert.
    </p>
    <template v-for="[key, label] in channels" :key="key">
      <label class="checkbox-label">
        <input
          type="checkbox"
          :disabled="disabled"
          :checked="Boolean(modelValue?.[key])"
          @change="
            change(
              key,
              $event.target.checked ? (key === 'idBundDeMailbox' ? { useStatusMonitor: false } : {}) : null,
            )
          "
        />
        {{ label }}
      </label>
      <label v-if="key === 'eMail' && modelValue?.eMail" class="checkbox-label">
        <input
          type="checkbox"
          :disabled="disabled"
          :checked="modelValue.eMail.usePgp || false"
          @change="change('eMail', { usePgp: $event.target.checked })"
        />
        PGP-Verschlüsselung unterstützen
      </label>
      <label v-if="key === 'idBundDeMailbox' && modelValue?.idBundDeMailbox" class="checkbox-label">
        <input
          type="checkbox"
          :disabled="disabled"
          :checked="modelValue.idBundDeMailbox.useStatusMonitor"
          @change="change('idBundDeMailbox', { useStatusMonitor: $event.target.checked })"
        />
        Statusmonitor der DeutschlandID nutzen
      </label>
    </template>
  </details>
</template>
