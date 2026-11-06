<script setup>
import AppIcon from '../AppIcon.vue';
defineProps({ update: Object, environment: String, section: String, connected: Boolean, error: String });
const emit = defineEmits(['update', 'dismiss', 'connect']);
</script>
<template>
  <div
    v-if="update.version && !update.dismissed && section !== 'Einstellungen'"
    class="connection-notice"
    role="status"
  >
    <div>
      <strong>FBForge Connect {{ update.version }} ist verfügbar.</strong>
      <p>Aktualisieren Sie die Anwendung, wenn Ihre aktuelle Arbeit abgeschlossen ist.</p>
    </div>
    <button class="button secondary" @click="emit('update')">Update ansehen</button>
    <button class="button secondary" @click="emit('dismiss')">Später</button>
  </div>
  <p v-if="environment === 'PROD'" class="environment-warning" role="status">
    <strong>PROD · Produktivbetrieb</strong>
    Sie arbeiten mit echten Daten. Prüfen Sie vor jeder Aktion Destination und Inhalt.
  </p>
  <p v-else-if="environment === 'STAGE'" class="environment-warning" role="status">
    <strong>STAGE</strong>
    V-PKI-Zertifikate und Zugangsdaten dieser Umgebung sind erforderlich.
  </p>
  <div
    v-if="
      !connected &&
      !['Start', 'Diagnose', 'Einstellungen', 'Prozesse', 'Hilfe', 'Testwerkzeuge', 'Virenscan'].includes(
        section,
      )
    "
    class="connection-notice"
  >
    <AppIcon name="connection" />
    <div>
      <strong>Mit FIT-Connect verbinden</strong>
      <p>
        Mit Ihren Zugangsdaten für {{ environment }} stehen Ihnen die Funktionen Ihrer Berechtigungen zur
        Verfügung.
      </p>
    </div>
    <button type="button" class="button secondary" @click="emit('connect')">Verbindung herstellen</button>
  </div>
  <p v-if="error" class="status-badge error" role="alert">{{ error }}</p>
</template>
