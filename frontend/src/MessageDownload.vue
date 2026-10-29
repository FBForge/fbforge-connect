<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { invoke } from './native.js';
import { downloadMessage } from './message-export.js';
import { errorMessage } from './diagnostics.js';
import CopyValue from './CopyValue.vue';
const props = defineProps({ session: Object, source: Object, disabled: Boolean, blocked: Boolean });
const emit = defineEmits(['busy']);
const pending = ref(false),
  error = ref(''),
  saved = ref(null);
let generation = 0;
watch(
  () => `${props.session?.sessionId}/${JSON.stringify(props.source)}`,
  () => {
    generation++;
    saved.value = null;
    error.value = '';
  },
);
onBeforeUnmount(() => generation++);
async function download() {
  if (pending.value || props.disabled || props.blocked || !props.session) return;
  const session = { ...props.session },
    source = { ...props.source },
    stamp = generation;
  pending.value = true;
  emit('busy', true);
  error.value = '';
  saved.value = null;
  try {
    const result = await downloadMessage(invoke, session, source, () => stamp === generation);
    if (stamp === generation) saved.value = result;
  } catch (cause) {
    if (stamp === generation) error.value = errorMessage(cause);
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <div class="message-download">
    <button
      type="button"
      class="button secondary"
      :disabled="disabled || blocked || pending || !session"
      @click="download"
    >
      {{ pending ? 'Dateien werden gespeichert …' : 'Alle Dateien herunterladen' }}
    </button>
    <p v-if="blocked" class="small-note">
      Ein vollständiger Originaldownload ist wegen gesperrter Anlagen nicht möglich. Unauffällige Dateien
      können Sie einzeln speichern.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="saved" role="status" class="small-note">
      <p>{{ saved.fileCount }} Dateien gespeichert.</p>
      <CopyValue :value="saved.directory" label="Exportordner" />
    </div>
  </div>
</template>
<style scoped>
.message-download {
  flex-shrink: 0;
  margin-block: 16px;
  overflow-wrap: anywhere;
}
.message-download > .button {
  width: 100%;
}
</style>
