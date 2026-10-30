<script setup>
import { inject, ref, computed, watch } from 'vue';
import { processWorkspaceKey } from '../process-context.js';
import { addProcessReply } from '../process-messages.js';
const props = defineProps({
  modelValue: { type: Array, required: true },
  disabled: Boolean,
  schemaUri: String,
  mimeType: String,
});
const emit = defineEmits(['update:modelValue']);
const workspace = inject(processWorkspaceKey, null);
const messages = computed(() => workspace?.messages?.value || []);
const selection = ref(''),
  modelId = ref(''),
  messageId = ref(''),
  error = ref(''),
  notice = ref('');
watch(messages, () => {
  selection.value = '';
  error.value = '';
});
watch(
  () => [props.schemaUri, props.mimeType],
  () => {
    error.value = '';
    notice.value = '';
  },
);
function add(candidate) {
  if (props.disabled) return;
  error.value = '';
  notice.value = '';
  try {
    emit('update:modelValue', addProcessReply(props.modelValue, candidate, props.schemaUri, props.mimeType));
    notice.value = 'Prozessantwort dem angebotenen Rückkanal hinzugefügt. Es wurde nichts versendet.';
  } catch (cause) {
    error.value =
      {
        process_message_invalid: 'Bitte gültige vereinbarte Modell- und Nachrichtenkennungen eintragen.',
        process_message_duplicate: 'Diese Prozessantwort ist bereits enthalten.',
        process_message_limit: 'Höchstens 16 Prozessantworten können angeboten werden.',
        process_schema_mismatch:
          'Der Schemahinweis dieser Modellnachricht passt nicht zum gewählten Antwortschema und Format.',
      }[cause.message] || 'Die Prozessantwort konnte nicht übernommen werden.';
  }
}
</script>
<template>
  <section aria-labelledby="process-replies-editor-title">
    <h4 id="process-replies-editor-title">Angebotene Prozessantworten (optional)</h4>
    <p>
      Wählen Sie übernommene Zuordnungen aus „Prozesse“ oder tragen Sie vereinbarte Kennungen ein. Die Liste
      bestimmt, welche Prozessantworten die Gegenstelle über diesen Rückkanal zurücksenden darf. Erfordert
      Metadatenversion 3.
    </p>
    <fieldset :disabled="disabled">
      <legend>Prozessantwort hinzufügen</legend>
      <template v-if="messages.length">
        <label for="offered-process-choice">
          Nachricht aus dem Prozessmodell
          <select id="offered-process-choice" v-model="selection">
            <option value="">Bitte auswählen</option>
            <option
              v-for="(row, index) in messages"
              :key="`${row.processModelId}/${row.messageId}`"
              :value="String(index)"
            >
              {{ row.label }} · {{ row.messageId }} · {{ row.processModelId }}
            </option>
          </select>
        </label>
        <button
          class="button secondary"
          type="button"
          :disabled="selection === '' || modelValue.length >= 16"
          @click="add(messages[Number(selection)])"
        >
          Prozessantwort aus Modell hinzufügen
        </button>
      </template>
      <p v-else class="small-note">
        Unter „Prozesse“ ein BPMN-Modell öffnen und die Kennungszuordnungen übernehmen, um dessen Nachrichten
        hier auszuwählen.
      </p>
      <details>
        <summary>Vereinbarte Kennungen selbst eintragen</summary>
        <div class="client-fields" @keydown.enter.prevent="add({ processModelId: modelId, messageId })">
          <label for="offered-model-id">
            FIT-Connect-Modellkennung
            <input id="offered-model-id" v-model="modelId" maxlength="1024" />
          </label>
          <label for="offered-message-id">
            FIT-Connect-Nachrichtenkennung
            <input id="offered-message-id" v-model="messageId" maxlength="1024" />
          </label>
        </div>
        <p class="small-note">
          Die Kennungen mit der Gegenstelle abstimmen. Ein Anzeigename erzeugt keine gültige
          Prozessvereinbarung.
        </p>
        <button
          class="button secondary"
          type="button"
          :disabled="modelValue.length >= 16"
          @click="add({ processModelId: modelId, messageId })"
        >
          Eingetragene Prozessantwort hinzufügen
        </button>
      </details>
      <ul>
        <li v-for="(row, index) in modelValue" :key="`${row.processModelId}/${row.messageId}`">
          <strong>{{ row.messageId }}</strong>
          · {{ row.processModelId }}
          <button
            class="button secondary"
            type="button"
            @click="
              emit(
                'update:modelValue',
                modelValue.filter((_, i) => i !== index),
              )
            "
          >
            Antwortnachricht {{ index + 1 }} entfernen
          </button>
        </li>
      </ul>
      <p v-if="!modelValue.length" class="small-note">
        Keine Prozessantworten angeboten. Fachliche Antworten sind weiterhin im gewählten Antwortschema
        möglich.
      </p>
    </fieldset>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
