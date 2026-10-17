<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import StructuredData from './StructuredData.vue';
import PdfPreview from './PdfPreview.vue';

const props = defineProps({
  preview: Object,
  schemaDocument: String,
  schemaUri: String,
  schemaStatus: String,
});
const emit = defineEmits(['close']);
const dialog = ref(null);
const format = computed(() => props.preview.format || (props.preview.json ? 'json' : null));
onMounted(() => {
  dialog.value.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
});
</script>

<template>
  <dialog
    ref="dialog"
    class="tool-dialog submission-preview-dialog submission-preview"
    aria-labelledby="content-preview-title"
    @cancel.prevent="emit('close')"
    @close="emit('close')"
  >
    <div class="tool-section-heading">
      <div>
        <h2 id="content-preview-title">Lokale Vorschau</h2>
        <p>{{ preview.filename }}</p>
      </div>
      <button class="button secondary" type="button" autofocus @click="emit('close')">
        Vorschau schließen
      </button>
    </div>
    <p>{{ preview.notice }}</p>
    <StructuredData
      v-if="preview.kind === 'text' && format"
      :text="preview.rawText"
      :format="format"
      :schema-document="schemaDocument"
      :schema-uri="schemaUri"
      :schema-status="schemaStatus"
    />
    <PdfPreview v-else-if="preview.kind === 'pdf'" :bytes="preview.bytes" />
    <pre v-else-if="preview.kind === 'text'">{{ preview.text }}</pre>
    <img v-else-if="preview.kind === 'image'" :src="preview.url" :alt="preview.filename" />
    <p class="small-note">
      {{
        preview.footer ||
        'Inhalte und Verweise werden nicht ausgeführt. HTML, SVG und Office-Dateien bleiben ausschließlich als Download verfügbar.'
      }}
    </p>
  </dialog>
</template>
