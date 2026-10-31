<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import StructuredData from './StructuredData.vue';
import { createPreview, disposePreview } from './submission-preview.js';
const props = defineProps({
  text: String,
  file: Object,
  mimeType: String,
  contextKey: String,
  disabled: Boolean,
  schemaDocument: String,
  schemaUri: String,
});
const emit = defineEmits(['request-schema']);
const preview = ref(null),
  loading = ref(false),
  notice = ref('');
let revision = 0,
  alive = true;
function close() {
  revision++;
  disposePreview(preview.value);
  preview.value = null;
  notice.value = '';
}
watch(
  [() => props.text, () => props.file, () => props.mimeType, () => props.contextKey, () => props.schemaUri],
  close,
  { flush: 'sync' },
);
onBeforeUnmount(() => {
  alive = false;
  close();
});
function revealInvalid(event) {
  close();
  nextTick(() => event.target.focus());
}
async function open() {
  if (loading.value || props.disabled) return;
  close();
  const stamp = revision;
  const file = props.file,
    text = props.text || '',
    mimeType = props.mimeType || 'application/json';
  if ((file && file.size > 2 * 1024 * 1024) || (!file && text.length > 2 * 1024 * 1024)) {
    notice.value =
      'Die lokale Vorschau ist auf 2 MiB begrenzt. Die Datei wird für den Versand nicht verändert.';
    return;
  }
  loading.value = true;
  emit('request-schema');
  let bytes;
  try {
    bytes = file ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(text);
    const value = await createPreview(bytes, {
      filename: file?.name || (mimeType.includes('xml') ? 'Fachdaten.xml' : 'Fachdaten.json'),
      mimeType,
    });
    if (!alive || stamp !== revision) {
      disposePreview(value);
      return;
    }
    preview.value = value;
  } catch {
    if (alive && stamp === revision)
      notice.value =
        'Die lokale Vorschau konnte nicht erstellt werden. Die Versanddaten wurden nicht verändert.';
  } finally {
    bytes?.fill(0);
    loading.value = false;
  }
}
</script>
<template>
  <div class="draft-data-preview" @invalid.capture="revealInvalid">
    <div class="application-modes" role="group" aria-label="Fachdaten bearbeiten oder lesen">
      <button type="button" class="button secondary" :aria-pressed="!preview" @click="close">
        Bearbeiten
      </button>
      <button
        type="button"
        class="button secondary"
        :aria-pressed="Boolean(preview)"
        :disabled="disabled || loading || (!file && !text)"
        @click="open"
      >
        {{ loading ? 'Vorschau wird geladen …' : 'Formularansicht' }}
      </button>
    </div>
    <slot name="schema-actions" />
    <div v-show="!preview" class="draft-data-editor"><slot /></div>
    <p v-if="notice" class="small-note" role="status">{{ notice }}</p>
    <div v-if="preview" class="draft-inline-preview" aria-label="Lokale Fachdatenansicht">
      <StructuredData
        v-if="preview.kind === 'text' && preview.format"
        :text="preview.rawText"
        :format="preview.format"
        :schema-document="schemaDocument"
        :schema-uri="schemaUri"
      />
      <p v-else role="status">{{ preview.notice }}</p>
    </div>
  </div>
</template>
