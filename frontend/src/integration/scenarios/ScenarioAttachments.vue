<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import FileDropInput from '../../FileDropInput.vue';
import { attachmentsFromFiles, requireAttachmentBudget } from './attachments.ts';
import type { Message, Scenario } from './types.ts';
const props = defineProps<{ message: Message; scenario: Scenario; disabled: boolean }>();
const emit = defineEmits<{ update: [value: Message['attachments']]; busy: [value: boolean] }>();
const replacement = ref<number | null>(null),
  pending = ref(false),
  error = ref(''),
  notice = ref('');
let generation = 0;
watch(
  () => props.message,
  () => {
    generation++;
    replacement.value = null;
    error.value = '';
    notice.value = '';
  },
);
onBeforeUnmount(() => {
  generation++;
});
async function files(value: File[]) {
  if (pending.value || props.disabled) return;
  const current = ++generation,
    message = props.message;
  pending.value = true;
  emit('busy', true);
  error.value = '';
  notice.value = '';
  try {
    const next = await attachmentsFromFiles(value, message.attachments, replacement.value);
    requireAttachmentBudget(props.scenario, message, next);
    if (generation !== current || props.message !== message) return;
    emit('update', next);
    replacement.value = null;
    notice.value = 'Erwartete Anlagen aktualisiert. Prüfen Sie auch die Anlagenverweise in den Fachdaten.';
  } catch (cause) {
    if (generation === current)
      error.value =
        cause instanceof Error && cause.message === 'test_attachment_duplicate'
          ? 'Dieser Dateiname ist bereits vorhanden. Ersetzen Sie die vorhandene Anlage oder wählen Sie einen anderen Namen.'
          : 'Die Anlage konnte nicht übernommen werden. Pro Datei sind höchstens 4 MiB und pro Test insgesamt 8 MiB möglich. Prüfen Sie Dateinamen und Dateiformat.';
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
function remove(index: number) {
  emit(
    'update',
    props.message.attachments.filter((_, i) => i !== index),
  );
  notice.value = 'Anlage entfernt. Prüfen Sie auch die Anlagenverweise in den Fachdaten.';
}
</script>
<template>
  <details>
    <summary>Anlagen bearbeiten ({{ message.attachments.length }})</summary>
    <p class="small-note">
      Diese Dateien gehören zum erwarteten Inhalt. Der Virenscan erfolgt beim Senden oder Empfangen.
    </p>
    <ul v-if="message.attachments.length" class="scenario-library-list">
      <li v-for="(attachment, index) in message.attachments" :key="attachment.fileName">
        <div>
          <strong>{{ attachment.fileName }}</strong>
          <p class="small-note">
            {{ attachment.mimeType }} · {{ Math.floor((attachment.base64.length * 3) / 4) }} Bytes
          </p>
        </div>
        <div class="client-actions">
          <button
            class="button secondary"
            :disabled="disabled || pending"
            :aria-label="`Ersetzen: ${attachment.fileName}`"
            @click="replacement = index"
          >
            Ersetzen
          </button>
          <button
            class="button secondary"
            :disabled="disabled || pending"
            :aria-label="`Entfernen: ${attachment.fileName}`"
            @click="remove(index)"
          >
            Entfernen
          </button>
        </div>
      </li>
    </ul>
    <template v-if="replacement !== null">
      <p>Ersetzen: {{ message.attachments[replacement]?.fileName }}</p>
      <FileDropInput
        id="scenario-replace-file"
        label="Ersatzdatei auswählen"
        :disabled="disabled || pending"
        @files="files"
      />
      <button class="button secondary" :disabled="disabled || pending" @click="replacement = null">
        Ersetzen abbrechen
      </button>
    </template>
    <FileDropInput
      v-else
      id="scenario-add-files"
      label="Erwartete Anlagen hinzufügen"
      multiple
      :disabled="disabled || pending"
      @files="files"
    />
    <p v-if="pending" role="status">Anlagen werden eingelesen …</p>
    <p v-if="notice" role="status" class="small-note">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>
