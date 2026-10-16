<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { invoke, diagnosticLog } from './native.js';
import { buildSupportReport, operationLabels } from './support-report.js';
import AppIcon from './AppIcon.vue';
import packageInfo from '../../package.json';
import licenseText from '../../LICENSE?raw';
import { probeAdapter, errorMessage } from './diagnostics.js';
import { openSession, updateSession, resetsSessions } from './sessions.js';
import DestinationKeys from './DestinationKeys.vue';
import DestinationManager from './DestinationManager.vue';
import SubmissionSender from './SubmissionSender.vue';
import SubmissionBrowser from './SubmissionBrowser.vue';
import EventLogPanel from './EventLogPanel.vue';
import ReplyBrowser from './ReplyBrowser.vue';

const section = ref('Senden');
const apiVersion = ref('v3');
let savedTheme;
try { savedTheme = localStorage.getItem('fit-connect.theme'); } catch { /* Optional appearance preference. */ }
const theme = ref(['light', 'dark'].includes(savedTheme) ? savedTheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const busy = ref(false);
const pendingAction = ref('');
const error = ref('');
const results = ref({});
const events = ref([]);
// Retain the native wire value for compatibility. It grants no permissions.
const role = 'online-service';
const clientId = ref('');
const clientSecret = ref('');
const sessions = ref({});
const selectedDestination = ref('');
const keyRevision = ref(0);
const submissionRevision = ref(0), replyRevision = ref(0);
const eventTarget = ref(null);
const activeSession = computed(() => sessions.value[apiVersion.value]);
document.documentElement.dataset.theme = theme.value;
watch(apiVersion, () => { clientId.value = ''; clientSecret.value = ''; error.value = ''; });
watch(() => activeSession.value?.sessionId, () => { selectedDestination.value = ''; });
function fatal(cause) { sessions.value = {}; error.value = errorMessage(cause); }

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme.value;
  try { localStorage.setItem('fit-connect.theme', theme.value); } catch { /* Appearance remains usable without storage. */ }
}
function resourceBusy(value) { busy.value = value; pendingAction.value = value ? 'resource' : ''; }
function openEventLog(target) {
  apiVersion.value = target.apiVersion;
  navigate('Event Log');
  eventTarget.value = { ...target, requestId: crypto.randomUUID() };
}
function addEvent(api, action, status, started, role = '—') {
  events.value = [{ id: crypto.randomUUID(), time: new Date().toLocaleTimeString('de-DE'),
    api, role, action, status, duration: Math.round(performance.now() - started) }, ...events.value].slice(0, 100);
}
async function sessionAction(action) {
  if (busy.value) return;
  busy.value = true;
  pendingAction.value = action;
  error.value = '';
  const version = apiVersion.value;
  const selectedRole = role;
  const key = version;
  const current = sessions.value[key];
  const credentials = { clientId: clientId.value, clientSecret: clientSecret.value };
  clientSecret.value = '';
  if (action === 'open') clientId.value = '';
  const started = performance.now();
  let status = 'Erfolgreich';
  try {
    if (!isTauri()) throw new Error('desktop_required');
    delete sessions.value[key];
    const result = action === 'open'
      ? await openSession(invoke, version, selectedRole, credentials.clientId, credentials.clientSecret)
      : await updateSession(invoke, current, action === 'check');
    if (result.connected) {
      sessions.value[key] = result;
      if (action === 'open') connectionDialog.value?.close();
    }
  } catch (cause) {
    status = 'Fehlgeschlagen';
    const code = typeof cause === 'string' ? cause : cause?.message;
    if (current && ['engine_busy', 'invalid_credentials', 'desktop_required'].includes(code)) sessions.value[key] = current;
    if (resetsSessions(cause)) sessions.value = {};
    error.value = errorMessage(cause);
  } finally {
    credentials.clientId = '';
    credentials.clientSecret = '';
    addEvent(version, ({ open: 'TEST-Anmeldung', check: 'Sitzung prüfen', close: 'Abmelden' })[action], status, started,
      selectedRole === 'online-service' ? 'Onlinedienst' : 'Fachverfahren');
    busy.value = false;
    pendingAction.value = '';
  }
}
async function probe(versions) {
  if (busy.value) return;
  busy.value = true;
  pendingAction.value = 'probe';
  error.value = '';
  try {
    for (const version of versions) {
      delete results.value[version];
      const started = performance.now();
      let status = 'Erfolgreich';
      try {
        if (!isTauri()) throw new Error('desktop_required');
        results.value[version] = await probeAdapter(invoke, version);
      } catch (cause) {
        status = 'Fehlgeschlagen';
        error.value = errorMessage(cause);
        if (resetsSessions(cause)) sessions.value = {};
      }
      addEvent(version, 'SDK lokal laden', status, started);
    }
  } finally { busy.value = false; pendingAction.value = ''; }
}
const version = packageInfo.version;
const navigation = [
  { name: 'Senden', icon: 'send', description: 'Einreichungen mit Fachdaten und Anlagen vorbereiten und an TEST übermitteln.' },
  { name: 'Empfangen', icon: 'receive', description: 'Einreichungen abrufen, lokal entschlüsseln und technisch prüfen.' },
  { name: 'Event Log', icon: 'events', description: 'Signierte Ereignisse einer Einreichung prüfen und nachvollziehen.' },
  { name: 'Zustellpunkte', icon: 'destinations', description: 'Eigene Zustellpunkte ansehen und über API v3 verwalten.' },
  { name: 'Diagnose', icon: 'diagnostics', description: 'Lokale Komponenten prüfen und einen technischen Bericht für die Fehleranalyse speichern.' },
  { name: 'Info', icon: 'info', description: 'Programmversion, Funktionsumfang und Lizenzinformationen.' },
];
const currentView = computed(() => navigation.find(item => item.name === section.value));
const workspace = ref(null), viewHeading = ref(null), connectionDialog = ref(null), licenseDialog = ref(null);
const scrollPositions = new Map();
async function navigate(name) {
  if (section.value === name) return;
  scrollPositions.set(section.value, workspace.value?.scrollTop || 0);
  section.value = name;
  await nextTick();
  if (workspace.value) workspace.value.scrollTop = scrollPositions.get(name) || 0;
  viewHeading.value?.focus({ preventScroll: true });
}
function showConnection() { if (!connectionDialog.value?.open) connectionDialog.value?.showModal(); }
function closeConnection() { if (!['open', 'check', 'close'].includes(pendingAction.value)) connectionDialog.value?.close(); }
const trace = ref(diagnosticLog.snapshot());
let unsubscribe, downloadUrl, downloadTimer;
onMounted(() => { unsubscribe = diagnosticLog.subscribe(entries => { trace.value = entries; }); });
function clearDownload() { clearTimeout(downloadTimer); if (downloadUrl) URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
onBeforeUnmount(() => { unsubscribe?.(); clearDownload(); });
const reportJson = computed(() => JSON.stringify(buildSupportReport({ version, selectedApi: apiVersion.value, probes: results.value, entries: trace.value }), null, 2));
function exportReport() {
  clearDownload();
  downloadUrl = URL.createObjectURL(new Blob([reportJson.value], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = downloadUrl; link.download = `FIT-Connect-Diagnose-${version}.json`;
  document.body.append(link); link.click(); link.remove(); downloadTimer = setTimeout(clearDownload, 30000);
}
function clearHistory() { events.value = []; diagnosticLog.clear(); }
</script>

<template>
  <a class="skip-link" href="#main">Zum Arbeitsbereich</a>
  <div class="desktop-shell">
    <header class="app-topbar">
      <div class="app-brand"><span class="app-mark" aria-hidden="true">F<span>↔</span></span><div><strong>FIT-Connect</strong><span>Integrationsclient</span></div></div>
      <div class="topbar-context"><span class="environment-tag">TEST</span><span class="build-tag">Alpha · {{ version }}</span></div>
      <div class="topbar-actions">
        <label class="api-picker" for="session-api"><span>API</span><select id="session-api" v-model="apiVersion" :disabled="busy"><option value="v3">v3</option><option value="v2">v2</option></select></label>
        <button class="connection-button" type="button" @click="showConnection"><span class="connection-dot" :class="{ connected: activeSession }" aria-hidden="true"></span>{{ activeSession ? 'Verbunden' : 'Verbinden' }}<AppIcon name="connection" /></button>
        <button class="icon-button" type="button" :aria-label="theme === 'dark' ? 'Helles Design verwenden' : 'Dunkles Design verwenden'" @click="toggleTheme"><AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" /></button>
      </div>
    </header>
    <aside class="app-sidebar" aria-label="Bereichsauswahl">
      <nav class="app-navigation" aria-label="Hauptnavigation">
        <p class="nav-caption">Arbeitsbereich</p>
        <button v-for="item in navigation.slice(0, 4)" :key="item.name" type="button" class="nav-item" :title="item.name" :aria-current="section === item.name ? 'page' : undefined" @click="navigate(item.name)"><AppIcon :name="item.icon" /><span>{{ item.name }}</span></button>
        <div class="nav-utilities"><p class="nav-caption">Anwendung</p>
          <button v-for="item in navigation.slice(4)" :key="item.name" type="button" class="nav-item" :title="item.name" :aria-current="section === item.name ? 'page' : undefined" @click="navigate(item.name)"><AppIcon :name="item.icon" /><span>{{ item.name }}</span></button>
        </div>
      </nav>
      <div class="sidebar-note"><span class="environment-tag">TEST</span><p>Integrationstests für Verwaltung und Integratoren</p></div>
    </aside>
    <div class="app-workspace">
      <div class="workspace-heading"><div><p class="workspace-eyebrow">{{ section === 'Info' || section === 'Diagnose' ? 'Anwendung' : 'Arbeitsbereich' }}</p><h1 ref="viewHeading" tabindex="-1">{{ section }}</h1><p>{{ currentView.description }}</p></div></div>
      <main id="main" ref="workspace" class="workspace-scroll" tabindex="-1" aria-label="Arbeitsbereich">
        <div class="workspace-content">
          <div v-if="!activeSession && !['Diagnose', 'Info'].includes(section)" class="connection-notice"><AppIcon name="connection" /><div><strong>Mit FIT-Connect TEST verbinden</strong><p>Mit deinen TEST-Zugangsdaten stehen dir die Funktionen deiner Berechtigungen zur Verfügung.</p></div><button type="button" class="button secondary" @click="showConnection">Verbindung herstellen</button></div>
          <p v-if="error" class="status-badge error" role="alert">{{ error }}</p>
          <SubmissionSender v-show="section === 'Senden'" :session="activeSession" :busy="busy" @busy="resourceBusy" @event-log="openEventLog" @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" />
          <DestinationManager v-show="section === 'Zustellpunkte'" :session="activeSession" :busy="busy" @busy="resourceBusy" @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" @changed="keyRevision++" />
          <DestinationKeys v-show="section === 'Empfangen'" :session="activeSession" :busy="busy" @busy="resourceBusy" @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" @destination="id => selectedDestination = id" @invalidate="keyRevision++" />
          <SubmissionBrowser v-show="section === 'Empfangen'" :session="activeSession" :busy="busy" :destination-id="selectedDestination" :key-revision="keyRevision" :receive-revision="submissionRevision" @receive-start="replyRevision++" @event-log="openEventLog" @busy="resourceBusy" @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" />
          <EventLogPanel v-show="section === 'Event Log'" :session="activeSession" :busy="busy" :target="eventTarget" :visible="section === 'Event Log'" @busy="resourceBusy" @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" />
          <ReplyBrowser v-show="section === 'Empfangen'" :session="activeSession" :busy="busy" :key-revision="keyRevision" :receive-revision="replyRevision" @receive-start="submissionRevision++" @busy="resourceBusy" @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" />
          <div v-show="section === 'Diagnose'" class="diagnostic-view">
            <section class="tool-section" aria-labelledby="setup-title">
              <div class="tool-section-heading"><div><h2 id="setup-title">Lokaler Anwendungskern</h2><p>Ohne Zugangsdaten und ohne Anfragen an FIT-Connect.</p></div><button class="button" type="button" :disabled="busy" @click="probe(['v2', 'v3'])">{{ pendingAction === 'probe' ? 'Prüfung läuft …' : 'Komponenten prüfen' }}</button></div>
              <div class="adapter-cards"><div v-for="api in ['v3', 'v2']" :key="api" class="adapter-card"><strong>API {{ api }}</strong><span>Java-SDK {{ api === 'v3' ? '4.0.0-rc.2' : '3.5.2' }}</span><span class="status-badge" :class="results[api] ? 'ok' : 'info'">{{ results[api] ? 'Lokal bereit' : 'Noch nicht geprüft' }}</span></div></div>
              <p class="small-note" aria-live="polite" :aria-busy="pendingAction === 'probe'">Die lokale Prüfung bestätigt das Laden der Komponenten. Anmeldung und Zustellpunktberechtigungen werden separat geprüft.</p>
            </section>
            <section class="tool-section" aria-labelledby="report-title">
              <div class="tool-section-heading"><div><h2 id="report-title">Technischer Diagnosebericht</h2><p>Version, TEST-Umgebung und die letzten {{ trace.length }} protokollierten Aufrufe.</p></div><button class="button secondary" type="button" :disabled="busy" @click="exportReport">Diagnosebericht speichern</button></div>
              <p>Der Bericht enthält nur festgelegte technische Angaben: Aktion, API, Zeitpunkt, Dauer und freigegebene Fehlercodes. Zugangsdaten, Kennungen, Schlüssel, Dateinamen und Einreichungsinhalte werden nicht aufgenommen. Er wird lokal gespeichert und nicht automatisch versendet.</p>
              <details><summary>Berichtsinhalt vor dem Speichern ansehen</summary><pre class="report-preview">{{ reportJson }}</pre></details>
            </section>
            <section class="tool-section" aria-labelledby="trace-title">
              <div class="tool-section-heading"><div><h2 id="trace-title">Technische Aufrufe</h2><p>Bis zu 100 Aufrufe dieser Programmsitzung. Eine Antwort bestätigt noch keinen fachlichen Abschluss.</p></div><button class="button secondary" type="button" :disabled="busy || (!events.length && !trace.length)" @click="clearHistory">Verlauf leeren</button></div>
              <p v-if="!trace.length" class="empty-state">Noch keine technischen Aufrufe. Starte eine Komponentenprüfung oder melde dich bei TEST an.</p>
              <div v-else class="client-table"><table class="submission-result-table"><thead><tr><th scope="col">Zeit</th><th scope="col">Aktion / API</th><th scope="col">Ergebnis</th><th scope="col">Dauer</th></tr></thead><tbody><tr v-for="(entry, index) in trace" :key="index"><td data-label="Zeit">{{ new Date(entry.time).toLocaleTimeString('de-DE') }}</td><td data-label="Aktion / API">{{ operationLabels[entry.command] }} · {{ entry.apiVersion || '—' }}</td><td data-label="Ergebnis"><span class="status-badge" :class="entry.result === 'rejected' || ['failed', 'uncertain', 'partial', 'conflict'].includes(entry.state) ? 'warn' : 'info'">{{ entry.code || entry.state || (entry.result === 'returned' ? 'Antwort erhalten' : 'Fehlgeschlagen') }}</span></td><td data-label="Dauer">{{ entry.durationMs }} ms</td></tr></tbody></table></div>
              <details v-if="events.length"><summary>Client-Aktivitäten ({{ events.length }})</summary><ul class="activity-list"><li v-for="event in events" :key="event.id"><span>{{ event.time }} · {{ event.api }} · {{ event.action }}</span><strong>{{ event.status }}</strong></li></ul></details>
            </section>
          </div>
          <div v-show="section === 'Info'" class="info-view">
            <section class="tool-section app-info" aria-labelledby="about-title"><div class="app-mark large" aria-hidden="true">F<span>↔</span></div><div><p class="workspace-eyebrow">Desktop-Anwendung</p><h2 id="about-title">FIT-Connect Integrationsclient</h2><p>Version {{ version }} · Alpha-Entwicklung</p><p>Für Integrationstests von Onlinediensten und Fachverfahren mit FIT-Connect.</p></div></section>
            <section class="tool-section" aria-labelledby="scope-title"><h2 id="scope-title">Aktueller Funktionsumfang</h2><dl class="info-facts"><dt>Umgebung</dt><dd>Ausschließlich FIT-Connect TEST</dd><dt>Austausch</dt><dd>Senden, Empfangen, lokale Entschlüsselung und technische Fachdatenprüfung über API v2 und v3</dd><dt>Verwaltung</dt><dd>Vorhandene eigene Zustellpunkte ansehen; Änderungen und Bulk-Edit über API v3</dd><dt>Entwicklungsstand</dt><dd>Die Live-Abnahme gegen TEST und die Installation auf einem frischen Windows-System sind noch offen.</dd></dl></section>
            <section class="tool-section" aria-labelledby="license-title"><h2 id="license-title">Lizenz und Einordnung</h2><p>Unabhängiges Projekt. Kein offizielles Produkt von FITKO.</p><p>Diese Anwendung steht unter der European Union Public Licence 1.2 (EUPL-1.2).</p><button type="button" class="button secondary" @click="licenseDialog.showModal()">Lizenztext anzeigen</button></section>
          </div>
        </div>
      </main>
    </div>
    <footer class="app-statusbar"><span class="status-connection"><span class="connection-dot" :class="{ connected: activeSession }" aria-hidden="true"></span>{{ busy ? 'Aktion läuft …' : activeSession ? 'Bei TEST angemeldet' : 'Nicht verbunden' }}</span><span>TEST · API {{ apiVersion }}</span><button type="button" @click="navigate('Diagnose')">{{ trace.length }} technische Aufrufe</button></footer>
  </div>
  <dialog ref="connectionDialog" class="tool-dialog connection-dialog" aria-labelledby="session-title" @cancel.prevent="closeConnection" @close="clientId = ''; clientSecret = ''">
    <div class="tool-section-heading"><div><p class="workspace-eyebrow">FIT-Connect TEST · API {{ apiVersion }}</p><h2 id="session-title">Verbindung verwalten</h2></div><button class="icon-button" type="button" :disabled="['open', 'check', 'close'].includes(pendingAction)" aria-label="Verbindungsdialog schließen" @click="closeConnection"><AppIcon name="close" /></button></div>
    <p>Die Verbindung gilt für alle Arbeitsbereiche. Die Berechtigungen bestimmen deine Zugangsdaten.</p>
    <p><span class="status-badge" :class="activeSession ? 'ok' : 'info'">{{ ['open', 'check', 'close'].includes(pendingAction) ? 'Sitzungsaktion wird ausgeführt …' : activeSession ? 'Bei TEST angemeldet' : 'Nicht verbunden' }}</span></p>
    <p v-if="error" role="alert" class="status-badge error">{{ error }}</p>
    <form @submit.prevent="sessionAction('open')" autocomplete="off">
      <div class="client-fields"><label for="client-id">Client-ID<input id="client-id" v-model="clientId" type="text" maxlength="512" autocomplete="off" :disabled="busy" required></label><label for="client-secret">Client-Secret<input id="client-secret" v-model="clientSecret" type="password" maxlength="8192" autocomplete="off" :disabled="busy" required></label></div>
      <p class="small-note">Zugangsdaten werden nicht dauerhaft gespeichert. Das Secret wird nach der Übergabe und beim Schließen aus dem Eingabefeld geleert. Tokens verbleiben im lokalen Anwendungskern.</p>
      <div class="client-actions"><button class="button" type="submit" :disabled="busy || !clientId.trim() || !clientSecret.trim()">{{ activeSession ? 'Mit anderen Zugangsdaten anmelden' : 'Bei TEST anmelden' }}</button><button class="button secondary" type="button" :disabled="busy || !activeSession" @click="sessionAction('check')">Sitzung prüfen</button><button class="button secondary" type="button" :disabled="busy || !activeSession" @click="sessionAction('close')">Abmelden</button></div>
    </form>
    <p v-if="activeSession" class="small-note">Eine Sitzungsprüfung prüft die OAuth-Anmeldung. Zugriffsrechte werden beim jeweiligen Abruf geprüft.</p>
  </dialog>
  <dialog ref="licenseDialog" class="tool-dialog license-dialog" aria-labelledby="license-dialog-title"><div class="tool-section-heading"><h2 id="license-dialog-title">European Union Public Licence 1.2</h2><button type="button" class="icon-button" aria-label="Lizenztext schließen" @click="licenseDialog.close()"><AppIcon name="close" /></button></div><pre>{{ licenseText }}</pre></dialog>
</template>
