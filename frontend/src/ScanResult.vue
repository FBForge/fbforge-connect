<script setup>
import { computed } from 'vue';
const props = defineProps({
  status: String,
  warnings: Array,
  attachments: { type: Array, default: () => [] },
  outgoing: Boolean,
  pending: Boolean,
});
const result = computed(() =>
  props.pending
    ? 'pending'
    : props.status ||
      (props.warnings?.includes('MALWARE_ATTACHMENT_BLOCKED')
        ? 'blocked'
        : props.warnings?.includes('MALWARE_SCAN_PASSED')
          ? 'passed'
          : props.warnings?.includes('MALWARE_SCAN_NOT_CONFIGURED')
            ? 'not_configured'
            : 'unknown'),
);
const tone = computed(() =>
  result.value === 'passed' ? 'ok' : ['blocked', 'not_configured'].includes(result.value) ? 'warn' : 'info',
);
const labels = {
  pending: 'Inhalte werden entschlüsselt und geprüft',
  passed: 'Virenscan abgeschlossen · kein Fund',
  blocked: 'Virenscan hat Anlagen gesperrt',
  not_configured: 'Kein Virenscan durchgeführt',
  unknown: 'Kein bestätigtes Virenscan-Ergebnis',
};
</script>
<template>
  <section class="scan-status" aria-label="Virenscan dieser Nachricht">
    <div>
      <p role="status">
        <span class="status-badge" :class="tone">{{ labels[result] }}</span>
      </p>
      <p v-if="result === 'passed'" class="small-note">
        {{
          outgoing
            ? 'Fachdaten und alle Anlagen geprüft. Vor dem Versand wird erneut geprüft.'
            : 'Metadaten, Fachdaten und alle verfügbaren Anlagen wurden geprüft.'
        }}
      </p>
      <p v-else-if="result === 'pending'" class="small-note">
        Entschlüsselung, Integrität, Schema und Virenscan werden verarbeitet. Es liegt noch keine
        Scan-Freigabe vor.
      </p>
      <p v-else-if="result === 'not_configured'" class="small-note">
        Die Dateien wurden nicht auf Schadsoftware geprüft. Sie können den Virenscan in der Navigation
        einrichten.
      </p>
      <ul v-if="['passed', 'blocked'].includes(result) && attachments.length" class="scan-file-list">
        <li v-for="part in attachments" :key="part.contentId || part.fileName">
          {{ part.fileName || 'Anlage' }}
          <span>Geprüft · kein Fund</span>
        </li>
      </ul>
      <p v-if="result === 'passed' && !attachments.length" class="small-note">Keine Anlagen vorhanden.</p>
    </div>
  </section>
</template>
<style scoped>
.scan-file-list {
  padding: 0;
  list-style: none;
  margin: 12px 0 0;
}
.scan-file-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  justify-content: space-between;
  padding-block: 6px;
  border-top: 1px solid var(--line);
  overflow-wrap: anywhere;
}
.scan-file-list span {
  color: var(--status-ok-ink);
  font-size: 12px;
}
</style>
