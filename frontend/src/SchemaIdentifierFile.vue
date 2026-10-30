<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import FileDropInput from './FileDropInput.vue';
import { readChannelFile } from './channel-schemas.js';
const props = defineProps({
  id: { type: String, required: true },
  disabled: Boolean,
  contextKey: String,
  label: { type: String, default: 'JSON-Schema-Kennung aus Datei übernehmen' },
});
const emit = defineEmits(['select']);
const error = ref(''),
  reading = ref(false);
let revision = 0;
watch([() => props.disabled, () => props.contextKey], () => revision++, { flush: 'sync' });
onBeforeUnmount(() => revision++);
async function select(files) {
  if (props.disabled || reading.value) return;
  const stamp = ++revision;
  reading.value = true;
  error.value = '';
  try {
    const uri = await readChannelFile(files[0]);
    if (stamp === revision && !props.disabled) emit('select', uri);
  } catch {
    if (stamp === revision)
      error.value = 'Eine gültige JSON-Objektschemadatei mit HTTPS- oder URN-$id auswählen (maximal 2 MiB).';
  } finally {
    reading.value = false;
  }
}
</script>
<template>
  <div>
    <FileDropInput
      :id="id"
      :label="label"
      accept=".json,application/schema+json,application/json"
      :disabled="disabled || reading"
      @files="select"
    >
      Nur die Kennung wird übernommen. Die Datei wird weder hochgeladen noch veröffentlicht. Eigene
      Definitionen erstellen Sie unter „Testwerkzeuge → Kanalschemas“.
    </FileDropInput>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
