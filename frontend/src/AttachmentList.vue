<script setup>
import { useId } from 'vue';
import { canPreview } from './submission-preview.js';
import { attachmentScanStatus } from './scanner-report.js';
defineProps({ parts: { type: Array, default: () => [] }, warnings: Array, disabled: Boolean });
defineEmits(['inspect', 'download']);
const size = (bytes) => `${(bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KiB`;
const id = useId();
</script>
<template>
  <section class="document-attachments" aria-label="Anlagen">
    <h3>
      Anlagen
      <span class="small-note">({{ parts.length }})</span>
    </h3>
    <p v-if="!parts.length" class="small-note">Keine Anlagen vorhanden.</p>
    <ul v-else class="application-attachment-list" aria-label="Anlagenliste" tabindex="0">
      <li v-for="(part, index) in parts" :key="part.contentId">
        <div>
          <strong :id="`${id}-${index}`">{{ part.fileName || 'Anlage' }}</strong>
          <p v-if="part.description">{{ part.description }}</p>
          <p>{{ part.mimeType }} · {{ size(part.totalBytes) }}</p>
          <p class="attachment-scan-result">
            <span class="status-badge" :class="attachmentScanStatus(warnings) === 'passed' ? 'ok' : 'warn'">
              <span v-if="attachmentScanStatus(warnings) === 'passed'" aria-hidden="true">✓</span>
              {{
                attachmentScanStatus(warnings) === 'passed'
                  ? 'Virenscan: kein Fund'
                  : attachmentScanStatus(warnings) === 'not_configured'
                    ? 'Nicht auf Schadsoftware geprüft'
                    : 'Kein bestätigter Virenscan'
              }}
            </span>
          </p>
        </div>
        <div class="client-actions">
          <button
            v-if="canPreview(part)"
            class="button secondary"
            type="button"
            :aria-describedby="`${id}-${index}`"
            :disabled="disabled"
            @click="$emit('inspect', part)"
          >
            Ansehen
          </button>
          <button
            class="button secondary"
            type="button"
            :aria-describedby="`${id}-${index}`"
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
