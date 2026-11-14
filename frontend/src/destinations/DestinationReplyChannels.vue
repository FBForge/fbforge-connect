<script setup>
import { computed } from 'vue';
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
  ['idBundDeMailbox', 'BundID'],
  ['fitConnect', 'FIT-Connect'],
  ['elster', 'ELSTER'],
  ['eMail', 'E-Mail'],
  ['deMail', 'DE-Mail'],
  ['fink', 'FINK'],
];
const electronic = computed(() => channels.some(([key]) => Boolean(props.modelValue?.[key])));
function change(key, value) {
  if (props.disabled) return;
  const next = JSON.parse(JSON.stringify(props.modelValue || {}));
  if (value === null) delete next[key];
  else next[key] = value;
  emit('update:modelValue', Object.keys(next).length ? next : null);
}
function toggle(key, checked) {
  const value =
    key === 'fitConnect'
      ? { processStandards: [] }
      : key === 'idBundDeMailbox'
        ? { useStatusMonitor: false }
        : {};
  change(key, checked ? value : null);
}
function standards(values) {
  change('fitConnect', { processStandards: [...new Set(values)] });
}
</script>
<template>
  <fieldset class="reply-channels">
    <legend>Antwortkanäle</legend>
    <p class="small-note">
      Angebot der empfangenden Stelle. FBForge Connect versendet Antworten über FIT-Connect.
    </p>
    <div class="reply-channel postal-channel">
      <label class="checkbox-label">
        <input type="checkbox" :checked="!electronic" disabled :aria-describedby="`${prefix}-postal-note`" />
        Postweg
      </label>
      <small :id="`${prefix}-postal-note`">
        {{ electronic ? 'Wird durch die ausgewählten Kanäle ersetzt.' : 'Ohne elektronischen Antwortkanal.' }}
      </small>
    </div>
    <div
      v-for="[key, label] in channels"
      :key="key"
      class="reply-channel"
      :class="{ selected: Boolean(modelValue?.[key]) }"
    >
      <div class="reply-channel-heading">
        <label class="checkbox-label">
          <input
            type="checkbox"
            :disabled="disabled"
            :checked="Boolean(modelValue?.[key])"
            @change="toggle(key, $event.target.checked)"
          />
          {{ label }}
        </label>
        <label v-if="key === 'eMail' && modelValue?.eMail" class="checkbox-label channel-option">
          <input
            type="checkbox"
            :disabled="disabled"
            :checked="modelValue.eMail.usePgp || false"
            @change="change('eMail', { usePgp: $event.target.checked })"
          />
          PGP-verschlüsselt
        </label>
      </div>
      <div v-if="key === 'fitConnect' && modelValue?.fitConnect" class="channel-settings">
        <label :for="`${prefix}-replies`">
          Datenaustauschstandards
          <input
            :id="`${prefix}-replies`"
            :disabled="disabled"
            :value="modelValue.fitConnect.processStandards?.join(', ') || ''"
            :aria-describedby="`${prefix}-standards-note`"
            @input="
              standards(
                $event.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            "
          />
        </label>
        <small :id="`${prefix}-standards-note`">
          Mindestens eine vereinbarte Schema-URI angeben. Mehrere Kennungen mit Komma trennen.
        </small>
        <details>
          <summary>Standard aus JSON-Datei ergänzen</summary>
          <SchemaIdentifierFile
            :session="session"
            :id="`${prefix}-reply-file`"
            :context-key="JSON.stringify([contextKey, modelValue])"
            :disabled="disabled || (modelValue.fitConnect.processStandards?.length || 0) >= 16"
            label="Unterstütztes Antwortschema aus JSON-Datei ergänzen"
            @select="standards([...(modelValue.fitConnect.processStandards || []), $event])"
          />
        </details>
      </div>
      <label
        v-if="key === 'idBundDeMailbox' && modelValue?.idBundDeMailbox"
        class="checkbox-label channel-settings"
      >
        <input
          type="checkbox"
          :disabled="disabled"
          :checked="modelValue.idBundDeMailbox.useStatusMonitor"
          @change="change('idBundDeMailbox', { useStatusMonitor: $event.target.checked })"
        />
        Statusmonitor der BundID nutzen
      </label>
    </div>
  </fieldset>
</template>
<style scoped>
.reply-channels {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
}
.reply-channels > p {
  margin: 0 0 0.5rem;
}
.reply-channel {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.75rem;
  background: var(--surface);
  min-width: 0;
}
.reply-channel.selected {
  border-color: var(--status-info-line);
  background: var(--status-info-bg);
}
.reply-channel-heading,
.postal-channel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.5rem;
}
.reply-channel .checkbox-label {
  margin: 0;
  min-height: 28px;
}
.channel-option {
  margin-inline-start: auto !important;
}
.channel-settings {
  margin-block-start: 0.75rem !important;
  padding-inline-start: 1.75rem;
  min-width: 0;
}
.channel-settings details {
  margin-bottom: 0;
}
.postal-channel {
  background: var(--surface-soft);
  color: var(--muted);
}
@media (max-width: 700px) {
  .channel-option {
    margin-inline-start: 1.75rem !important;
  }
}
</style>
