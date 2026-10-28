<script setup>
import { operationLabels, diagnosticContext, diagnosticResult } from '../support-report.js';
defineProps({
  busy: Boolean,
  pendingAction: String,
  results: Object,
  trace: Array,
  events: Array,
  reportJson: String,
});
const emit = defineEmits(['probe', 'export', 'clear']);
</script>
<template>
  <div class="diagnostic-view">
    <section class="tool-section" aria-labelledby="setup-title">
      <div class="tool-section-heading">
        <div>
          <h2 id="setup-title">Lokaler Anwendungskern</h2>
          <p>Ohne Zugangsdaten und ohne Anfragen an FIT-Connect.</p>
        </div>
        <button class="button" type="button" :disabled="busy" @click="emit('probe')">
          {{ pendingAction === 'probe' ? 'Prüfung läuft …' : 'Komponenten prüfen' }}
        </button>
      </div>
      <div class="adapter-cards">
        <div v-for="api in ['v3', 'v2']" :key="api" class="adapter-card">
          <strong>API {{ api }}</strong>
          <span>Java-SDK {{ api === 'v3' ? '4.0.0' : '3.5.2' }}</span>
          <span class="status-badge" :class="results[api] ? 'ok' : 'info'">
            {{ results[api] ? 'Lokal bereit' : 'Noch nicht geprüft' }}
          </span>
        </div>
      </div>
      <p class="small-note" aria-live="polite" :aria-busy="pendingAction === 'probe'">
        Die lokale Prüfung bestätigt das Laden der Komponenten. Anmeldung und Berechtigungen für Destinations
        werden separat geprüft.
      </p>
    </section>
    <section class="tool-section" aria-labelledby="report-title">
      <div class="tool-section-heading">
        <div>
          <h2 id="report-title">Technischer Diagnosebericht</h2>
          <p>Version, gewählte Umgebung und die letzten {{ trace.length }} protokollierten Aufrufe.</p>
        </div>
        <button class="button secondary" type="button" :disabled="busy" @click="emit('export')">
          Diagnosebericht speichern
        </button>
      </div>
      <p>
        Der Bericht enthält nur festgelegte technische Angaben: Aktion, API, Zeitpunkt, Dauer und freigegebene
        Fehlercodes. Zugangsdaten, Kennungen, Schlüssel, Dateinamen und Einreichungsinhalte werden nicht
        aufgenommen. Er wird lokal gespeichert und nicht automatisch versendet.
      </p>
      <details>
        <summary>Berichtsinhalt vor dem Speichern ansehen</summary>
        <pre class="report-preview">{{ reportJson }}</pre>
      </details>
    </section>
    <section class="tool-section" aria-labelledby="trace-title">
      <div class="tool-section-heading">
        <div>
          <h2 id="trace-title">Technische Aufrufe</h2>
          <p>
            Die letzten 100 technischen Aufrufe dieser Sitzung. Fehlercodes können Sie direkt am Eintrag
            öffnen.
          </p>
        </div>
        <button
          class="button secondary"
          type="button"
          :disabled="busy || (!events.length && !trace.length)"
          @click="emit('clear')"
        >
          Verlauf leeren
        </button>
      </div>
      <p v-if="!trace.length" class="empty-state">
        Noch keine technischen Aufrufe. Starten Sie eine Komponentenprüfung oder melden Sie sich an.
      </p>
      <div v-else class="client-table">
        <table class="submission-result-table">
          <thead>
            <tr>
              <th scope="col">Zeit</th>
              <th scope="col">Aktion</th>
              <th scope="col">Kontext</th>
              <th scope="col">Ergebnis</th>
              <th scope="col">Dauer</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, index) in trace" :key="index">
              <td data-label="Zeit">{{ new Date(entry.time).toLocaleTimeString('de-DE') }}</td>
              <td data-label="Aktion">{{ operationLabels[entry.command] }}</td>
              <td data-label="Kontext">{{ diagnosticContext(entry) }}</td>
              <td data-label="Ergebnis">
                <span class="status-badge" :class="diagnosticResult(entry).tone">
                  {{ diagnosticResult(entry).label }}
                </span>
                <details v-if="entry.code" class="trace-details">
                  <summary>Fehlercode anzeigen</summary>
                  <code>{{ entry.code }}</code>
                </details>
              </td>
              <td data-label="Dauer">
                {{ entry.durationMs === null ? 'Nicht erfasst' : `${entry.durationMs} ms` }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <details v-if="events.length">
        <summary>Client-Aktivitäten ({{ events.length }})</summary>
        <ul class="activity-list">
          <li v-for="event in events" :key="event.id">
            <span>{{ event.time }} · {{ event.api }} · {{ event.action }}</span>
            <strong>{{ event.status }}</strong>
          </li>
        </ul>
      </details>
    </section>
  </div>
</template>
