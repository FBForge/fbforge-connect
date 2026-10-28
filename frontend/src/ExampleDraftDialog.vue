<script setup>
import { ref, shallowRef, watch, nextTick, onBeforeUnmount, useId } from 'vue';
import XmlMessageChoice from './XmlMessageChoice.vue';
import { useExampleMessages } from './use-example-messages.js';
import { generateExample } from './generate-example.js';
import { errorMessage } from './diagnostics.js';
const props = defineProps({ contextKey: String });
const dialog = ref(null),
  request = shallowRef(null),
  pending = ref(false),
  error = ref('');
const { roots, selection, requestedRoot, choose: select, reset } = useExampleMessages();
const id = useId();
let resolve,
  revision = 0;
function finish(value = null) {
  revision++;
  dialog.value?.close();
  resolve?.(value);
  resolve = null;
  request.value = null;
  pending.value = false;
  error.value = '';
  reset();
}
watch(
  () => props.contextKey,
  () => finish(),
  { flush: 'sync' },
);
onBeforeUnmount(() => finish());
async function choose(options) {
  finish();
  // Reject unavailable packages before opening a chooser or replacing any input.
  select(options.source, options.mimeType, options.uri);
  request.value = options;
  const result = new Promise((done) => {
    resolve = done;
  });
  await nextTick();
  if (!request.value) return result;
  dialog.value.showModal();
  dialog.value.querySelector('select, button')?.focus();
  return result;
}
async function apply() {
  if (pending.value || (roots.value.length && !requestedRoot.value)) return;
  const stamp = revision,
    options = request.value;
  pending.value = true;
  error.value = '';
  try {
    const draft = await generateExample(options.source, options.mimeType, options.uri, requestedRoot.value);
    if (stamp === revision) finish(draft);
  } catch (cause) {
    if (stamp === revision) error.value = errorMessage(cause);
  } finally {
    if (stamp === revision) pending.value = false;
  }
}
defineExpose({ choose });
</script>
<template>
  <dialog
    ref="dialog"
    class="tool-dialog example-draft-dialog"
    :aria-labelledby="`${id}-title`"
    @cancel.prevent="finish()"
  >
    <template v-if="request">
      <h2 :id="`${id}-title`">Fiktive Beispieldaten</h2>
      <p>
        Erzeugen Sie einen Testentwurf aus dem gewählten Schema. Prüfen Sie anschließend die fachlichen
        Angaben und Anlagenverweise.
      </p>
      <XmlMessageChoice :id="`${id}-message`" v-model="selection" :roots="roots" :disabled="pending" />
      <p v-if="request.replacing" class="example-replace-notice">
        Beim Übernehmen werden Ihr bisheriger Inhalt und eine ausgewählte Fachdaten-Datei im Entwurf ersetzt.
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="pending" role="status">Beispieldaten werden erzeugt …</p>
      <div class="client-actions">
        <button class="button secondary" type="button" @click="finish()">Abbrechen</button>
        <button
          class="button"
          type="button"
          :disabled="pending || Boolean(roots.length && !requestedRoot)"
          @click="apply"
        >
          Beispieldaten übernehmen
        </button>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.example-draft-dialog {
  width: min(760px, calc(100vw - 40px));
}
</style>
