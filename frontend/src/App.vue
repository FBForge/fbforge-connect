<script setup>
import { ref, computed, watch } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { invoke } from './native.js';
import { probeAdapter, errorMessage } from './diagnostics.js';
import { openSession, updateSession, resetsSessions } from './sessions.js';
import DestinationKeys from './DestinationKeys.vue';
import DestinationManager from './DestinationManager.vue';
import SubmissionSender from './SubmissionSender.vue';
import SubmissionBrowser from './SubmissionBrowser.vue';
import EventLogPanel from './EventLogPanel.vue';
import ReplyBrowser from './ReplyBrowser.vue';

const section = ref('Senden');
const apiVersion = ref('v2');
const theme = ref(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
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
const selected = computed(() => results.value[apiVersion.value]);
document.documentElement.dataset.theme = theme.value;
watch(apiVersion, () => { clientId.value = ''; clientSecret.value = ''; error.value = ''; });
watch(() => activeSession.value?.sessionId, () => { selectedDestination.value = ''; });
function fatal(cause) { sessions.value = {}; error.value = errorMessage(cause); }

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme.value;
}
function resourceBusy(value) { busy.value = value; pendingAction.value = value ? 'resource' : ''; }
function openEventLog(target) {
  apiVersion.value = target.apiVersion;
  section.value = 'Event Log';
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
    if (result.connected) sessions.value[key] = result;
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
</script>

<template>
  <a class="sr-only" href="#main">Zum Inhalt</a>
  <header class="site-header">
    <div class="nav">
      <div class="brand"><div class="brand-name"><strong>FIT-Connect Testclient</strong><span>Von FBForge · Integrationstests für Onlinedienste und Fachverfahren</span></div></div>
      <button class="theme-toggle" type="button" @click="toggleTheme">{{ theme === 'dark' ? 'Light Mode' : 'Dark Mode' }}</button>
      <nav class="nav-links" aria-label="Hauptnavigation">
        <button v-for="item in ['Senden', 'Empfangen', 'Event Log', 'Zustellpunkte']" :key="item" type="button"
          class="button" :class="{ secondary: section !== item }" :aria-current="section === item ? 'page' : undefined"
          @click="section = item">{{ item }}</button>
      </nav>
    </div>
  </header>
  <main id="main" class="page client-page">
    <div class="tool-section-heading"><div><h1>{{ section }}</h1><p>API v2 und v3 · ausschließlich FIT-Connect TEST</p></div><span class="status-badge info">In Entwicklung</span></div>
    <section class="tool-section connection-panel" aria-labelledby="session-title">
      <div class="tool-section-heading"><h2 id="session-title">Verbindung zu FIT-Connect TEST</h2><span class="status-badge" :class="activeSession ? 'ok' : 'info'">{{ activeSession ? `Verbunden · ${apiVersion}` : 'Nicht verbunden' }}</span></div>
      <p>Eine gemeinsame Verbindung für Senden, Empfangen, Event Log und Zustellpunktverwaltung. Die Berechtigungen bestimmen deine Zugangsdaten.</p>
      <label for="session-api">API-Version<select id="session-api" v-model="apiVersion" :disabled="busy"><option value="v2">API v2</option><option value="v3">API v3</option></select></label>
      <details :open="!activeSession"><summary>{{ activeSession ? 'Verbindung verwalten' : 'Verbindung herstellen' }}</summary>
      <form @submit.prevent="sessionAction('open')" autocomplete="off">
        <div class="client-fields">
          <label for="client-id">Client-ID<input id="client-id" v-model="clientId" type="text" maxlength="512" autocomplete="off" :disabled="busy" required></label>
          <label for="client-secret">Client-Secret<input id="client-secret" v-model="clientSecret" type="password" maxlength="8192" autocomplete="off" :disabled="busy" required><small>Wird nach der Übergabe aus dem Eingabefeld geleert und nicht dauerhaft gespeichert.</small></label>
        </div>
        <div class="client-actions">
          <button class="button" type="submit" :disabled="busy || !clientId.trim() || !clientSecret.trim()">{{ activeSession ? 'Mit anderen Zugangsdaten anmelden' : 'Bei TEST anmelden' }}</button>
          <button class="button secondary" type="button" :disabled="busy || !activeSession" @click="sessionAction('check')">Sitzung prüfen</button>
          <button class="button secondary" type="button" :disabled="busy || !activeSession" @click="sessionAction('close')">Abmelden</button>
        </div>
      </form>
      <p aria-live="polite" :aria-busy="['open', 'check', 'close'].includes(pendingAction)"><span class="status-badge" :class="activeSession ? 'ok' : 'info'">{{ ['open', 'check', 'close'].includes(pendingAction) ? 'Sitzungsaktion wird ausgeführt …' : activeSession ? 'Bei TEST angemeldet' : 'Für diese API nicht angemeldet' }}</span></p>
      <p>Tokens bleiben im lokalen Java-Kern. Die Sitzung bleibt beim Wechsel zwischen den Ansichten erhalten. Beim Prüfen wird ein gültiges Token wiederverwendet und bei Ablauf durch das SDK erneuert.</p>
      <p>Die Sitzungsprüfung prüft die OAuth-Anmeldung. Die Berechtigungen für einen Zustellpunkt werden beim jeweiligen Abruf oder Versand geprüft.</p>
      </details>
    </section>
    <p v-if="error" class="status-badge error" role="alert">{{ error }}</p>
    <SubmissionSender v-show="section === 'Senden'" :session="activeSession" :busy="busy" @busy="resourceBusy"
      @event-log="openEventLog"
      @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" />
    <DestinationManager v-show="section === 'Zustellpunkte'" :session="activeSession" :busy="busy" @busy="resourceBusy"
      @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" @changed="keyRevision++" />
    <DestinationKeys v-show="section === 'Empfangen'" :session="activeSession" :busy="busy" @busy="resourceBusy"
      @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)"
      @fatal="fatal" @destination="id => selectedDestination = id" @invalidate="keyRevision++" />
    <SubmissionBrowser v-show="section === 'Empfangen'" :session="activeSession" :busy="busy" :destination-id="selectedDestination" :key-revision="keyRevision" :receive-revision="submissionRevision" @receive-start="replyRevision++"
      @event-log="openEventLog"
      @busy="resourceBusy" @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" />
    <EventLogPanel v-show="section === 'Event Log'" :session="activeSession" :busy="busy" :target="eventTarget" :visible="section === 'Event Log'"
      @busy="resourceBusy" @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" />
    <ReplyBrowser v-show="section === 'Empfangen'" :session="activeSession" :busy="busy" :key-revision="keyRevision" :receive-revision="replyRevision" @receive-start="submissionRevision++" @busy="resourceBusy"
      @activity="event => addEvent(event.api, event.action, event.status, event.started, event.role)" @fatal="fatal" />
    <section class="tool-section" aria-labelledby="setup-title">
      <h2 id="setup-title">Lokalen SDK-Kern prüfen</h2>
      <p>Prüft die Desktop-Verbindung und beide getrennten Java-SDKs. Dafür werden keine Zugangsdaten benötigt und keine FIT-Connect-Anfragen gesendet.</p>
      <div class="client-fields">
        <label for="api-version">API-Version<select id="api-version" v-model="apiVersion" :disabled="busy"><option value="v2">API v2 · Java-SDK 3.5.2</option><option value="v3">API v3 · Java-SDK 4.0.0-rc.2</option></select><small>Die Auswahl bleibt ausdrücklich erhalten. Es gibt keinen automatischen Versionswechsel.</small></label>
        <div><strong>Umgebung</strong><p><span class="status-badge info">TEST</span></p><small>Produktive Umgebungen werden nicht angeboten.</small></div>
      </div>
      <div class="client-actions">
        <button class="button" type="button" :disabled="busy" @click="probe([apiVersion])">{{ pendingAction === 'probe' ? 'SDK wird geprüft …' : 'Ausgewählten SDK prüfen' }}</button>
        <button class="button secondary" type="button" :disabled="busy" @click="probe(['v2', 'v3'])">Beide SDKs prüfen</button>
      </div>
      <div aria-live="polite" :aria-busy="pendingAction === 'probe'">
        <p v-if="selected"><span class="status-badge ok">{{ selected.apiVersion }} lokal bereit</span> Java-SDK {{ selected.sdkVersion }} ist isoliert geladen. Der FIT-Connect-Zugriff ist damit noch nicht geprüft.</p>
      </div>
    </section>
    <section class="tool-section" aria-labelledby="events-title">
      <div class="tool-section-heading"><div><h2 id="events-title">Client-Aktivitäten</h2><p>SDK-Prüfungen und Sitzungsaktionen ohne Zugangsdaten oder Token-Inhalte</p></div><button class="button secondary" type="button" :disabled="!events.length || busy" @click="events = []">Liste leeren</button></div>
      <p v-if="!events.length">Noch keine Aktivitäten. Starte oben eine SDK-Prüfung.</p>
      <div v-else class="client-table support-table"><table><thead><tr><th>Zeit</th><th>API</th><th>Aktion</th><th>Ergebnis</th><th>Dauer</th></tr></thead><tbody><tr v-for="event in events" :key="event.id"><td>{{ event.time }}</td><td>{{ event.api }}</td><td>{{ event.action }}</td><td><span class="status-badge" :class="event.status === 'Erfolgreich' ? 'ok' : 'error'">{{ event.status }}</span></td><td>{{ event.duration }} ms</td></tr></tbody></table></div>
    </section>
  </main>
</template>
