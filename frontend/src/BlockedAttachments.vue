<script setup>
defineProps({ items: { type: Array, default: () => [] } });
</script>
<template>
  <section v-if="items.length" class="action-notice warning" aria-label="Gesperrte Anlagen">
    <h3>{{ items.length }} Anlage(n) durch den Virenscan gesperrt</h3>
    <p>
      Diese Dateien sind nicht zum Öffnen oder Herunterladen freigegeben. Unauffällige Inhalte bleiben lesbar.
    </p>
    <ul>
      <li v-for="item in items" :key="item.attachmentId">
        <strong>{{ item.fileName || 'Anlage' }}</strong>
        ·
        <code>{{ item.attachmentId }}</code>
      </li>
    </ul>
    <p class="small-note">
      Eine Annahme mit Anlagenproblemen bestätigt die gesamte Nachricht. Benötigte Anlagen müssen
      gegebenenfalls erneut angefordert werden.
    </p>
  </section>
</template>
