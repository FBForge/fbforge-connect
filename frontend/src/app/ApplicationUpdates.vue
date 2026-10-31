<script setup>
import { computed } from 'vue';
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean });
const emit = defineEmits(['check', 'download', 'install', 'cancel', 'automatic', 'manual']);
const ready = computed(() => props.state.configured && props.state.supported);
const progress = computed(() =>
  props.state.total ? Math.min(100, Math.round((props.state.downloaded / props.state.total) * 100)) : null,
);
const labels = {
  idle: 'Updates können manuell gesucht werden.',
  checking: 'Neue Versionen werden gesucht …',
  current: 'Keine neuere stabile Version verfügbar.',
  available: 'Eine neue Version ist verfügbar.',
  downloading: 'Update wird heruntergeladen und geprüft …',
  downloaded: 'Download und Signaturprüfung sind abgeschlossen.',
  installing: 'Installation wird vorbereitet …',
};
</script>
<template>
  <section class="tool-section application-updates" aria-labelledby="updates-title">
    <h2 id="updates-title">Aktualisierungen</h2>
    <p v-if="!state.supported">Integrierte Updates sind derzeit für Windows x64 verfügbar.</p>
    <p v-else-if="!state.configured">
      Updates sind in diesem Build noch nicht eingerichtet. Nutzen Sie den manuellen Download auf GitHub.
    </p>
    <template v-else>
      <label class="checkbox-label">
        <input
          type="checkbox"
          :checked="state.automatic"
          @change="emit('automatic', $event.target.checked)"
        />
        Beim Start automatisch nach Updates suchen
      </label>
      <p class="small-note">
        Die Suche kontaktiert GitHub. FIT-Connect-Zugangsdaten und Fachdaten werden nicht übertragen.
        Installation nur nach Ihrer Bestätigung.
      </p>
      <p role="status">
        {{ labels[state.phase] }}
        <strong v-if="state.version">Version {{ state.version }}</strong>
      </p>
      <details v-if="state.notes">
        <summary>Änderungen in dieser Version</summary>
        <p class="update-notes">{{ state.notes }}</p>
      </details>
      <div v-if="state.phase === 'downloading'" class="update-progress">
        <progress aria-label="Update-Download" :value="progress ?? undefined" max="100"></progress>
        <span>{{ progress === null ? 'Download läuft' : `${progress} %` }}</span>
      </div>
      <p v-if="state.phase === 'downloaded'" class="small-note">
        Speichern Sie offene Entwürfe vor der Installation. Anschließend wird die Anwendung beendet und der
        Installer gestartet. Gespeicherte Profile und Vorgänge bleiben erhalten.
      </p>
      <p v-if="busy" class="small-note">
        Eine Aktion läuft. Die Update-Installation ist währenddessen gesperrt.
      </p>
      <div class="client-actions">
        <button class="button secondary" :disabled="!ready || state.working" @click="emit('check')">
          Nach Updates suchen
        </button>
        <button
          v-if="state.phase === 'available'"
          class="button"
          :disabled="state.working"
          @click="emit('download')"
        >
          Update herunterladen
        </button>
        <button
          v-if="state.phase === 'downloaded'"
          class="button"
          :disabled="busy || state.working"
          @click="emit('install')"
        >
          Installieren und neu starten
        </button>
        <button v-if="state.phase === 'downloading'" class="button secondary" @click="emit('cancel')">
          Download abbrechen
        </button>
      </div>
    </template>
    <p v-if="state.error" class="action-notice error" role="alert">{{ state.error }}</p>
    <details v-if="state.code">
      <summary>Technischen Fehlercode anzeigen</summary>
      <code>{{ state.code }}</code>
    </details>
    <p><button class="button secondary" @click="emit('manual')">Manueller Download auf GitHub</button></p>
  </section>
</template>
<style scoped>
.application-updates {
  overflow-wrap: anywhere;
}
.update-notes {
  white-space: pre-wrap;
}
.update-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-block: 16px;
}
.update-progress progress {
  width: min(100%, 20rem);
  accent-color: var(--accent);
}
.client-actions {
  flex-wrap: wrap;
}
</style>
