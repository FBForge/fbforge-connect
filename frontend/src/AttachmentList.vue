<script setup>
import { canPreview } from './submission-preview.js';
defineProps({ parts: { type: Array, default: () => [] }, disabled: Boolean });
defineEmits(['inspect', 'download']);
const size = (bytes) => `${(bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KiB`;
</script>
<template>
  <section class="document-attachments" aria-label="Anlagen">
    <h3>
      Anlagen
      <span class="small-note">({{ parts.length }})</span>
    </h3>
    <p v-if="!parts.length" class="small-note">Keine Anlagen vorhanden.</p>
    <ul v-else class="application-attachment-list">
      <li v-for="part in parts" :key="part.contentId">
        <div>
          <strong>{{ part.fileName || 'Anlage' }}</strong>
          <p v-if="part.description">{{ part.description }}</p>
          <p>{{ part.mimeType }} · {{ size(part.totalBytes) }}</p>
        </div>
        <div class="client-actions">
          <button
            v-if="canPreview(part)"
            class="button secondary"
            type="button"
            :disabled="disabled"
            @click="$emit('inspect', part)"
          >
            Ansehen
          </button>
          <button
            class="button secondary"
            type="button"
            :disabled="disabled"
            @click="$emit('download', part)"
          >
            Original herunterladen
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
