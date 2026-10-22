<script setup>
import { useEnvironment } from './environments.js';
const environment = useEnvironment();
import AppIcon from './AppIcon.vue';
import DocumentationLink from './DocumentationLink.vue';

defineProps({ session: Object, busy: Boolean, apiVersion: String });
const emit = defineEmits(['connect', 'navigate', 'task']);
const tasks = [
  {
    id: 'send',
    title: 'Fachverfahren testen',
    purpose: 'FBForge Connect sendet. Ihr Fachverfahren empfängt.',
    description: 'Fachdaten und Anlagen vorbereiten und nach Ihrer Bestätigung an FIT-Connect senden.',
    destination: 'Senden',
    icon: 'send',
  },
  {
    id: 'receive',
    title: 'Onlinedienst testen',
    purpose: 'Ihr Onlinedienst sendet. FBForge Connect empfängt.',
    description: 'Einreichungen abrufen, Inhalte prüfen, Anlagen ansehen und bei Bedarf antworten.',
    destination: 'Empfangen',
    icon: 'receive',
  },
];
</script>

<template>
  <div class="start-workspace">
    <section class="start-task-section" aria-labelledby="start-tasks-title">
      <p class="start-eyebrow">IHRE AUFGABE</p>
      <h2 id="start-tasks-title">Was möchten Sie testen?</h2>
      <p class="start-description">FBForge Connect übernimmt die passende Gegenstelle für Ihren Test.</p>
      <div class="start-tasks">
        <div v-for="task in tasks" :key="task.id" class="start-task">
          <AppIcon :name="task.icon" />
          <button
            type="button"
            class="start-task-button"
            :aria-describedby="`start-${task.id}-purpose start-${task.id}-description`"
            @click="emit('task', task.destination)"
          >
            <strong>{{ task.title }}</strong>
          </button>
          <span :id="`start-${task.id}-purpose`" class="start-task-purpose">{{ task.purpose }}</span>
          <span :id="`start-${task.id}-description`">{{ task.description }}</span>
          <span class="start-task-action" aria-hidden="true">Test beginnen →</span>
        </div>
      </div>
    </section>

    <section class="start-connection tool-section" aria-labelledby="start-connection-title">
      <div>
        <p class="start-eyebrow">IHR FIT-CONNECT-ZUGANG</p>
        <h2 id="start-connection-title">
          {{ session ? 'Bereit für Ihren Integrationstest' : 'Ihr Zugang ist noch nicht verbunden' }}
        </h2>
        <p v-if="session">
          Sie sind bei FIT-Connect {{ environment }} über API {{ apiVersion }} angemeldet. Die verfügbaren
          Aktionen richten sich nach Ihren Berechtigungen.
        </p>
        <p v-else>
          Wählen Sie eine Testaufgabe. Falls nötig, öffnet sich die Anmeldung. Sie können Ihren Zugang auch
          direkt verbinden. Das Speichern von Zugangsdaten ist optional.
        </p>
      </div>
      <button type="button" class="button" :disabled="busy" @click="emit('connect')">
        <AppIcon name="connection" />
        {{ session ? 'Verbindung verwalten' : 'Verbindung herstellen' }}
      </button>
    </section>

    <section class="tool-section start-followup" aria-labelledby="start-followup-title">
      <div>
        <p class="start-eyebrow">ERGEBNISSE</p>
        <h2 id="start-followup-title">Ergebnisse wiederfinden</h2>
        <p>Lokale Kopien stehen unter Vorgänge. Im Event Log prüfen Sie den Übertragungsverlauf.</p>
      </div>
      <div class="client-actions">
        <button type="button" class="button secondary" @click="emit('navigate', 'Vorgänge')">
          Vorgänge öffnen
        </button>
        <button type="button" class="button secondary" @click="emit('navigate', 'Event Log')">
          Event Log öffnen
        </button>
      </div>
    </section>

    <section class="start-resources" aria-labelledby="start-resources-title">
      <h2 id="start-resources-title">Hilfe und weitere Werkzeuge</h2>
      <div class="client-actions">
        <DocumentationLink topic="start">Schritt-für-Schritt-Anleitung</DocumentationLink>
        <button type="button" class="button secondary" @click="emit('navigate', 'Prozesse')">
          BPMN-Modell öffnen
        </button>
        <button type="button" class="button secondary" @click="emit('navigate', 'Destinations')">
          Eigene Destinations verwalten
        </button>
      </div>
      <p class="small-note">
        Nutzen Sie für Tests fiktive Daten. In PROD werden Nachrichten tatsächlich zugestellt. Die
        Startansicht führt keine Übertragung aus.
      </p>
    </section>
  </div>
</template>

<style scoped>
.start-workspace {
  display: grid;
  gap: 24px;
}
.start-connection,
.start-followup {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.start-connection > div,
.start-followup > div {
  min-width: 0;
}
.start-connection > button {
  flex-shrink: 0;
}
.start-eyebrow {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 650;
  letter-spacing: 0.05em;
}
.start-description {
  margin-top: 8px;
  color: var(--muted);
}
.start-tasks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 20px;
}
.start-task {
  position: relative;
  cursor: pointer;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  text-align: left;
  overflow-wrap: anywhere;
}
.start-task-button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}
.start-task-button::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
}
.start-task-button:focus-visible {
  outline: none;
}
.start-task-button:focus-visible::after {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.start-task:hover {
  border-color: var(--accent);
}
.start-task > .app-icon {
  width: 28px;
  height: 28px;
  color: var(--accent);
}
.start-task strong {
  font-size: 1.25rem;
}
.start-task > span:not(.start-task-action) {
  color: var(--muted);
  line-height: 1.7;
}
.start-task .start-task-purpose {
  color: var(--ink);
  font-weight: 600;
}
.start-task-action {
  margin-top: auto;
  padding-top: 8px;
  color: var(--accent);
  font-weight: 600;
}
.start-followup .client-actions {
  margin: 0;
}
.start-resources h2 {
  font-size: 1.125rem;
}
@media (max-width: 900px) {
  .start-connection,
  .start-followup {
    flex-direction: column;
    align-items: flex-start;
  }
}
@media (max-width: 650px) {
  .start-tasks {
    grid-template-columns: 1fr;
  }
}
</style>
