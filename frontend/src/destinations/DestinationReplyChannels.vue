<script setup>
import { computed, nextTick } from 'vue';
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
  change('fitConnect', { processStandards: values });
}
const standardId = (index) => `${props.prefix}-replies${index ? `-${index}` : ''}`;
async function addStandard() {
  const values = props.modelValue?.fitConnect?.processStandards || [];
  if (props.disabled || values.length >= 16) return;
  standards([...values, '']);
  await nextTick();
  document.getElementById(standardId(values.length))?.focus();
}
function updateStandard(index, value) {
  standards(props.modelValue.fitConnect.processStandards.map((entry, i) => (i === index ? value : entry)));
}
async function removeStandard(index) {
  const values = props.modelValue.fitConnect.processStandards.filter((_, i) => i !== index);
  standards(values);
  await nextTick();
  document
    .getElementById(
      values.length ? standardId(Math.min(index, values.length - 1)) : `${props.prefix}-standard-add`,
    )
    ?.focus();
}
function importStandard(uri) {
  standards([...new Set([...(props.modelValue.fitConnect.processStandards || []).filter(Boolean), uri])]);
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
        <p class="reply-standards-title">Datenaustauschstandards</p>
        <div
          v-for="(uri, index) in modelValue.fitConnect.processStandards || []"
          :key="index"
          class="reply-standard-row"
        >
          <label :for="standardId(index)">
            Standard {{ index + 1 }}
            <input
              :id="standardId(index)"
              data-reply-standard
              :disabled="disabled"
              :value="uri"
              :aria-describedby="`${prefix}-standards-note`"
              @input="updateStandard(index, $event.target.value)"
            />
          </label>
          <button
            class="button secondary"
            type="button"
            :disabled="disabled"
            :aria-label="`Standard ${index + 1} entfernen`"
            @click="removeStandard(index)"
          >
            Entfernen
          </button>
        </div>
        <button
          :id="`${prefix}-standard-add`"
          class="button secondary"
          type="button"
          :disabled="disabled || (modelValue.fitConnect.processStandards?.length || 0) >= 16"
          @click="addStandard"
        >
          <span aria-hidden="true">＋</span>
          Standard hinzufügen
        </button>
        <small :id="`${prefix}-standards-note`">
          Je Standard eine vereinbarte Schema-URI. Für FIT-Connect ist mindestens ein Standard erforderlich.
        </small>
        <details>
          <summary>Standard aus JSON-Datei ergänzen</summary>
          <SchemaIdentifierFile
            :session="session"
            :id="`${prefix}-reply-file`"
            :context-key="JSON.stringify([contextKey, modelValue])"
            :disabled="disabled || (modelValue.fitConnect.processStandards?.length || 0) >= 16"
            label="Unterstütztes Antwortschema aus JSON-Datei ergänzen"
            @select="importStandard"
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
.reply-standards-title {
  margin: 0;
  font-weight: 600;
}
.reply-standard-row {
  display: flex;
  align-items: end;
  gap: 0.5rem;
}
.reply-standard-row label {
  flex: 1;
  min-width: 0;
  margin: 0;
}
.reply-standard-row input {
  width: 100%;
}
.reply-standard-row .button {
  flex-shrink: 0;
}
.channel-settings:has(.reply-standards-title) {
  display: grid;
  gap: 0.75rem;
}
.channel-settings details {
  margin-bottom: 0;
}
.postal-channel {
  background: var(--surface-soft);
  color: var(--muted);
}
@media (max-width: 700px) {
  .reply-standard-row {
    flex-wrap: wrap;
  }
  .reply-standard-row label {
    flex-basis: 12rem;
  }
  .channel-option {
    margin-inline-start: 1.75rem !important;
  }
}
</style>
