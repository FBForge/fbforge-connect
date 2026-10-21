<script setup>
import {
  ref,
  shallowRef,
  provide,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  defineAsyncComponent,
} from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { invoke, diagnosticLog } from './native.js';
import {
  buildSupportReport,
  operationLabels,
  diagnosticContext,
  diagnosticResult,
} from './support-report.js';
import AppIcon from './AppIcon.vue';
import CopyValue from './CopyValue.vue';
import DocumentationLink from './DocumentationLink.vue';
import { createSchemaSourceAccess, schemaSourceAccessKey } from './schema-source-access.js';
import StartWorkspace from './StartWorkspace.vue';
import appLogo from './assets/test-client.png';
import { productName, productBrand, productEdition, productPurpose } from './product.js';
import FileDropInput from './FileDropInput.vue';
import packageInfo from '../../package.json';
import licenseText from '../../LICENSE?raw';
import bpmnLicense from '../../licenses/bpmn-js.txt?raw';
import apacheLicense from '../../licenses/Apache-2.0.txt?raw';
import pdfLicense from '../../licenses/pdfjs-NOTICE.txt?raw';
import { probeAdapter, errorMessage } from './diagnostics.js';
import { openSession, updateSession, resetsSessions } from './sessions.js';
import ProfileEditor from './ProfileEditor.vue';
import KeyInventory from './KeyInventory.vue';
import ProfileDefaults from './ProfileDefaults.vue';
import DestinationKeys from './DestinationKeys.vue';
const ProcessWorkspace = defineAsyncComponent(() => import('./ProcessWorkspace.vue'));
import { processWorkspaceKey } from './process-context.js';
import DestinationManager from './DestinationManager.vue';
import SubmissionSender from './SubmissionSender.vue';
import SubmissionBrowser from './SubmissionBrowser.vue';
import EventLogPanel from './EventLogPanel.vue';
import CaseWorkspace from './CaseWorkspace.vue';
const ApplicationHelp = defineAsyncComponent(() => import('./ApplicationHelp.vue'));
const TestTools = defineAsyncComponent(() => import('./TestTools.vue'));
const testDraft = shallowRef(null);
const toolsOpened = ref(false);
const receiveTarget = shallowRef(null);
function reopenCase(record) {
  receiveTab.value = 'submissions';
  selectedDestination.value = record.destinationId;
  receiveTarget.value = { ...record, requestId: crypto.randomUUID() };
  void navigate('Empfangen');
}
import ReplyBrowser from './ReplyBrowser.vue';
import {
  listProfiles,
  openSavedProfile,
  forgetProfile,
  profileStatus,
  saveProfileState,
  exportProfileBackup,
  importProfileBackup,
  importProfileBackupFile,
  getProfileDefaults,
} from './profiles.js';
import { createCaseWorkspace, caseWorkspaceKey } from './case-context.js';

const caseRecords = shallowRef([]);
const caseWorkspace = createCaseWorkspace((records) => {
  caseRecords.value = records;
});
provide(caseWorkspaceKey, caseWorkspace);
const processDraft = shallowRef(null),
  processContext = shallowRef(null),
  processSelection = shallowRef(null);
provide(processWorkspaceKey, {
  selection: processSelection,
  showContext: (context) => {
    processContext.value = { ...context, requestId: crypto.randomUUID() };
    void navigate('Prozesse');
  },
});
const section = ref('Start');
const apiVersion = ref('v3');
let savedTheme;
try {
  savedTheme = localStorage.getItem('fit-connect.theme');
} catch {
  /* Optional appearance preference. */
}
const theme = ref(
  ['light', 'dark'].includes(savedTheme)
    ? savedTheme
    : matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
);
const busy = ref(false);
const pendingAction = ref('');
const error = ref('');
const results = ref({});
const events = ref([]);
// Retain the native wire value for compatibility. It grants no permissions.
const role = 'online-service';
const clientId = ref('');
const clientSecret = ref('');
const rememberProfile = ref(false),
  profileName = ref(''),
  profiles = shallowRef([]),
  storageStatus = shallowRef(null),
  profileError = ref(''),
  profileNotice = ref(''),
  forgetCandidate = shallowRef(null),
  forgetDialog = ref(null);
const sessions = ref({});
const selectedDestination = ref('');
const destinationSetup = ref(null);
const defaultDestinations = shallowRef(null);
const keyRevision = ref(0);
const submissionRevision = ref(0),
  replyRevision = ref(0);
const eventTarget = ref(null);
const activeSession = computed(() => sessions.value[apiVersion.value]);
provide(
  schemaSourceAccessKey,
  createSchemaSourceAccess(() => activeSession.value),
);
document.documentElement.dataset.theme = theme.value;
watch(apiVersion, () => {
  clientId.value = '';
  clientSecret.value = '';
  error.value = '';
});
watch(
  () => activeSession.value?.sessionId,
  () => {
    selectedDestination.value = '';
    defaultDestinations.value = null;
    storageStatus.value = null;
    void refreshStorageStatus();
  },
);
function fatal(cause) {
  sessions.value = {};
  caseWorkspace.clear();
  error.value = errorMessage(cause);
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme.value;
  try {
    localStorage.setItem('fit-connect.theme', theme.value);
  } catch {
    /* Appearance remains usable without storage. */
  }
}
function resourceBusy(value) {
  busy.value = value;
  pendingAction.value = value ? 'resource' : '';
}
function openEventLog(target) {
  apiVersion.value = target.apiVersion;
  navigate('Event Log');
  eventTarget.value = { ...target, requestId: crypto.randomUUID() };
}
function addEvent(api, action, status, started, role = '—') {
  void refreshStorageStatus();
  events.value = [
    {
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('de-DE'),
      api,
      role,
      action,
      status,
      duration: Math.round(performance.now() - started),
    },
    ...events.value,
  ].slice(0, 100);
}
async function sessionAction(action) {
  if (busy.value) return;
  if ((await receiveBrowser.value?.confirmLeave()) === false || busy.value) return;
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
    const result =
      action === 'open'
        ? await openSession(
            invoke,
            version,
            selectedRole,
            credentials.clientId,
            credentials.clientSecret,
            rememberProfile.value ? { profileId: crypto.randomUUID(), name: profileName.value.trim() } : null,
          )
        : await updateSession(invoke, current, action === 'check');
    if (result.connected) {
      sessions.value[key] = result;
      if (action === 'open') {
        connectionDialog.value?.close();
        void refreshProfiles();
      }
    }
  } catch (cause) {
    status = 'Fehlgeschlagen';
    const code = typeof cause === 'string' ? cause : cause?.message;
    if (
      current &&
      (['engine_busy', 'invalid_credentials', 'invalid_input', 'desktop_required', 'vault_pending'].includes(
        code,
      ) ||
        (action !== 'open' && code?.startsWith('vault_')))
    )
      sessions.value[key] = current;
    if (resetsSessions(cause)) sessions.value = {};
    error.value = errorMessage(cause);
  } finally {
    credentials.clientId = '';
    credentials.clientSecret = '';
    addEvent(
      version,
      { open: 'TEST-Anmeldung', check: 'Sitzung prüfen', close: 'Abmelden' }[action],
      status,
      started,
      selectedRole === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
    );
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
  } finally {
    busy.value = false;
    pendingAction.value = '';
  }
}
const version = packageInfo.version;
const navigation = [
  {
    name: 'Start',
    icon: 'home',
    description: 'Verbinden Sie Ihren TEST-Zugang und wählen Sie die passende Aufgabe.',
  },
  {
    name: 'Senden',
    icon: 'send',
    description: 'Einreichungen mit Fachdaten und Anlagen vorbereiten und an TEST übermitteln.',
  },
  {
    name: 'Empfangen',
    icon: 'receive',
    description: 'Einreichungen abrufen, lokal entschlüsseln und technisch prüfen.',
  },
  {
    name: 'Vorgänge',
    icon: 'cases',
    description: 'Gesendete und empfangene Anträge, Antworten und Anlagen lokal wieder öffnen.',
  },
  {
    name: 'Destinations',
    group: 'Test und Verwaltung',
    icon: 'destinations',
    description: 'Eigene Destinations ansehen und über API v3 verwalten.',
  },
  {
    name: 'Prozesse',
    group: 'Test und Verwaltung',
    icon: 'process',
    description: 'BPMN-Nachrichten auswählen und passende TEST-Prozess-Destinations finden.',
  },
  {
    name: 'Event Log',
    group: 'Test und Verwaltung',
    icon: 'history',
    description: 'Den Verlauf von Vorgängen, Einreichungen und Antworten nachvollziehen.',
  },
  {
    name: 'Testwerkzeuge',
    group: 'Test und Verwaltung',
    icon: 'tools',
    description: 'Testfälle lokal wiederverwenden und Änderungen an JSON-Schemata und XSDs vergleichen.',
  },
  {
    name: 'Hilfe',
    group: 'Hilfe und Anwendung',
    icon: 'help',
    description: 'Anleitungen und Beispiele auf der FBForge-Website.',
  },
  {
    name: 'Diagnose',
    group: 'Hilfe und Anwendung',
    icon: 'diagnostics',
    description: 'Lokale Komponenten prüfen und einen technischen Bericht für die Fehleranalyse speichern.',
  },
  {
    name: 'Info',
    group: 'Hilfe und Anwendung',
    icon: 'info',
    description: 'Programmversion, Funktionsumfang und Lizenzinformationen.',
  },
];
const navigationGroups = ['Arbeitsbereich', 'Test und Verwaltung', 'Hilfe und Anwendung'].map((name) => ({
  name,
  items: navigation.filter((item) => (item.group || 'Arbeitsbereich') === name),
}));
const currentView = computed(() => navigation.find((item) => item.name === section.value));
const receiveTab = ref('submissions'),
  receiveBrowser = ref(null);
watch(
  () => activeSession.value?.sessionId,
  () => {
    receiveTab.value = 'submissions';
  },
);
async function selectReceiveTab(value) {
  if (busy.value || receiveTab.value === value) return;
  if (receiveTab.value === 'submissions' && !(await receiveBrowser.value?.confirmLeave())) return;
  receiveTab.value = value;
}
async function changeApi(event) {
  const selected = event.target.value;
  event.target.value = apiVersion.value;
  if (busy.value || !['v2', 'v3'].includes(selected) || selected === apiVersion.value) return;
  if ((await receiveBrowser.value?.confirmLeave()) === false || busy.value) return;
  apiVersion.value = selected;
}
async function receiveTabKey(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const target =
    event.key === 'Home'
      ? 'submissions'
      : event.key === 'End'
        ? 'replies'
        : receiveTab.value === 'submissions'
          ? 'replies'
          : 'submissions';
  await selectReceiveTab(target);
  await nextTick();
  document.getElementById(`receive-tab-${receiveTab.value}`)?.focus();
}
const workspace = ref(null),
  viewHeading = ref(null),
  connectionDialog = ref(null),
  licenseDialog = ref(null);
const dependencyDialog = ref(null);
const frontendLicenses = ref('');
async function showDependencyLicenses() {
  dependencyDialog.value.showModal();
  frontendLicenses.value = 'Lizenztexte werden geladen.';
  try {
    frontendLicenses.value = (await import('../../licenses/frontend.txt?raw')).default;
  } catch {
    frontendLicenses.value =
      'Die zusätzlichen Lizenztexte konnten nicht geladen werden. Bitte erneut öffnen.';
  }
}
const scrollPositions = new Map();
async function navigate(name) {
  if (section.value === name) return;
  scrollPositions.set(section.value, workspace.value?.scrollTop || 0);
  section.value = name;
  if (name === 'Testwerkzeuge') toolsOpened.value = true;
  await nextTick();
  if (workspace.value) workspace.value.scrollTop = scrollPositions.get(name) || 0;
  viewHeading.value?.focus({ preventScroll: true });
}
function beginTask(name) {
  if (name === 'Empfangen') receiveTab.value = 'submissions';
  void navigate(name);
  if (!activeSession.value) showConnection();
}
function openTestDraft(value) {
  testDraft.value = { ...value, requestId: crypto.randomUUID() };
  beginTask('Senden');
}
let connectionOpener;
function showConnection() {
  connectionOpener = document.activeElement;
  void refreshProfiles();
  if (!connectionDialog.value?.open) connectionDialog.value?.showModal();
}
function connectionClosed() {
  clientId.value = '';
  clientSecret.value = '';
  nextTick(() => {
    if (connectionOpener?.isConnected && connectionOpener.checkVisibility()) connectionOpener.focus();
    else viewHeading.value?.focus({ preventScroll: true });
  });
}
function closeConnection() {
  if (!['open', 'check', 'close'].includes(pendingAction.value)) connectionDialog.value?.close();
}
async function refreshProfiles() {
  if (!isTauri()) return;
  try {
    profiles.value = await listProfiles(invoke);
    profileError.value = '';
  } catch (cause) {
    profileError.value = errorMessage(cause);
  }
}
async function refreshStorageStatus() {
  const active = activeSession.value;
  if (!isTauri() || !active) return;
  try {
    const status = await profileStatus(invoke, active.sessionId);
    if (activeSession.value?.sessionId !== active.sessionId) return;
    storageStatus.value = status;
    if (status.saved && defaultDestinations.value === null) {
      const defaults = await getProfileDefaults(invoke, active);
      if (activeSession.value?.sessionId === active.sessionId) {
        defaultDestinations.value = defaults;
        if (!selectedDestination.value && defaults?.receiverDestination)
          selectedDestination.value = defaults.receiverDestination;
      }
    }
  } catch {
    /* A failed status read must not change a completed FIT-Connect operation. */
  }
}
async function connectProfile(profile, restoreKeys) {
  if (busy.value) return;
  if ((await receiveBrowser.value?.confirmLeave()) === false || busy.value) return;
  busy.value = true;
  pendingAction.value = 'open';
  error.value = '';
  clientId.value = '';
  clientSecret.value = '';
  delete sessions.value[profile.apiVersion];
  const started = performance.now();
  let status = 'Erfolgreich';
  try {
    const connected = await openSavedProfile(invoke, profile, restoreKeys);
    apiVersion.value = connected.apiVersion;
    sessions.value[connected.apiVersion] = connected;
    connectionDialog.value?.close();
    keyRevision.value++;
    await refreshStorageStatus();
  } catch (cause) {
    status = 'Fehlgeschlagen';
    error.value = errorMessage(cause);
    if (resetsSessions(cause)) sessions.value = {};
  } finally {
    busy.value = false;
    pendingAction.value = '';
    addEvent(profile.apiVersion, 'Mit gespeichertem Profil anmelden', status, started);
  }
}
async function backupProfile(profile) {
  if (busy.value) return;
  busy.value = true;
  profileError.value = '';
  profileNotice.value = '';
  try {
    const saved = await exportProfileBackup(invoke, profile.profileId);
    if (saved)
      profileNotice.value =
        'Geschützte Sicherung gespeichert. Sie benötigt dasselbe Windows-Benutzerkonto und dessen Windows-Schutzschlüssel.';
  } catch (cause) {
    profileError.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}
async function restoreProfileBackup(files = null) {
  if (busy.value) return;
  busy.value = true;
  profileError.value = '';
  profileNotice.value = '';
  try {
    const profile = Array.isArray(files)
      ? await importProfileBackupFile(invoke, files[0])
      : await importProfileBackup(invoke);
    if (profile) {
      await refreshProfiles();
      profileNotice.value =
        'Profil wiederhergestellt. Beim Verbinden werden Anmeldung und Schlüsselzuordnungen neu geprüft.';
    }
  } catch (cause) {
    profileError.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}
async function askRemoveProfile(profile) {
  if (busy.value) return;
  forgetCandidate.value = profile;
  await nextTick();
  forgetDialog.value?.showModal();
}
async function removeProfile(profile) {
  if (busy.value || !profile) return;
  busy.value = true;
  try {
    await forgetProfile(invoke, profile.profileId);
    await refreshProfiles();
    await refreshStorageStatus();
  } catch (cause) {
    profileError.value = errorMessage(cause);
  } finally {
    busy.value = false;
    forgetDialog.value?.close();
    forgetCandidate.value = null;
  }
}
async function retryProfileSave() {
  if (busy.value || !activeSession.value) return;
  busy.value = true;
  try {
    await saveProfileState(invoke, activeSession.value);
    await refreshStorageStatus();
  } catch (cause) {
    profileError.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}
const trace = ref(diagnosticLog.snapshot());
let unsubscribe, downloadUrl, downloadTimer;
function preventFileNavigation(event) {
  event.preventDefault();
}
onMounted(() => {
  window.addEventListener('dragover', preventFileNavigation);
  window.addEventListener('drop', preventFileNavigation);
  unsubscribe = diagnosticLog.subscribe((entries) => {
    trace.value = entries;
  });
});
function clearDownload() {
  clearTimeout(downloadTimer);
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
}
onBeforeUnmount(() => {
  window.removeEventListener('dragover', preventFileNavigation);
  window.removeEventListener('drop', preventFileNavigation);
  unsubscribe?.();
  clearDownload();
});
const reportJson = computed(() =>
  JSON.stringify(
    buildSupportReport({
      version,
      selectedApi: apiVersion.value,
      probes: results.value,
      entries: trace.value,
    }),
    null,
    2,
  ),
);
function exportReport() {
  clearDownload();
  downloadUrl = URL.createObjectURL(new Blob([reportJson.value], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `FBForge-Connect-Diagnose-${version}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  downloadTimer = setTimeout(clearDownload, 30000);
}
function clearHistory() {
  events.value = [];
  diagnosticLog.clear();
}
</script>

<template>
  <a class="skip-link" href="#main">Zum Arbeitsbereich</a>
  <div class="desktop-shell" @dragover.prevent @drop.prevent>
    <header class="app-topbar">
      <div class="app-brand">
        <img class="app-mark" :src="appLogo" alt="" width="34" height="34" />
        <div>
          <strong>{{ productBrand }}</strong>
          <span>{{ productEdition }}</span>
        </div>
      </div>
      <div class="topbar-context">
        <span class="environment-tag">TEST</span>
        <span class="build-tag">{{ version }}</span>
      </div>
      <div class="topbar-actions">
        <label class="api-picker" for="session-api">
          <span>API</span>
          <select
            id="session-api"
            :value="apiVersion"
            :disabled="busy"
            aria-label="API-Version"
            @change="changeApi"
          >
            <option value="v3">v3</option>
            <option value="v2">v2</option>
          </select>
        </label>
        <button class="connection-button" type="button" @click="showConnection">
          <span class="connection-dot" :class="{ connected: activeSession }" aria-hidden="true"></span>
          {{ activeSession ? 'Verbunden' : 'Verbinden' }}
          <AppIcon name="connection" />
        </button>
        <button
          class="icon-button"
          type="button"
          :aria-label="theme === 'dark' ? 'Helles Design verwenden' : 'Dunkles Design verwenden'"
          @click="toggleTheme"
        >
          <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" />
        </button>
      </div>
    </header>
    <aside class="app-sidebar" aria-label="Bereichsauswahl">
      <nav class="app-navigation" aria-label="Hauptnavigation">
        <div
          v-for="(group, index) in navigationGroups"
          :key="group.name"
          :class="{ 'nav-utilities': index > 0 }"
          role="group"
          :aria-label="group.name"
        >
          <p class="nav-caption">{{ group.name }}</p>
          <button
            v-for="item in group.items"
            :key="item.name"
            type="button"
            class="nav-item"
            :title="item.name"
            :aria-current="section === item.name ? 'page' : undefined"
            @click="navigate(item.name)"
          >
            <AppIcon :name="item.icon" />
            <span>{{ item.name }}</span>
          </button>
        </div>
      </nav>
      <div class="sidebar-note">
        <span class="environment-tag">TEST</span>
        <p>Integrationstests für Verwaltung und Integratoren</p>
      </div>
    </aside>
    <div class="app-workspace">
      <div class="workspace-heading">
        <div>
          <h1 ref="viewHeading" tabindex="-1">{{ section }}</h1>
          <p>{{ currentView.description }}</p>
        </div>
        <DocumentationLink
          v-if="
            ['Senden', 'Empfangen', 'Event Log', 'Destinations', 'Prozesse', 'Testwerkzeuge'].includes(
              section,
            )
          "
          :topic="
            {
              Senden: 'send',
              Empfangen: 'receive',
              'Event Log': 'events',
              Destinations: 'destinations',
              Prozesse: 'processes',
              Testwerkzeuge: 'tools',
            }[section]
          "
        >
          Anleitung
        </DocumentationLink>
      </div>
      <main id="main" ref="workspace" class="workspace-scroll" tabindex="-1" aria-label="Arbeitsbereich">
        <div class="workspace-content">
          <div
            v-if="
              !activeSession &&
              !['Start', 'Diagnose', 'Info', 'Prozesse', 'Hilfe', 'Testwerkzeuge'].includes(section)
            "
            class="connection-notice"
          >
            <AppIcon name="connection" />
            <div>
              <strong>Mit FIT-Connect TEST verbinden</strong>
              <p>
                Mit Ihren TEST-Zugangsdaten stehen Ihnen die Funktionen Ihrer Berechtigungen zur Verfügung.
              </p>
            </div>
            <button type="button" class="button secondary" @click="showConnection">
              Verbindung herstellen
            </button>
          </div>
          <p v-if="error" class="status-badge error" role="alert">{{ error }}</p>
          <StartWorkspace
            v-if="section === 'Start'"
            :session="activeSession"
            :api-version="apiVersion"
            :busy="busy"
            @connect="showConnection"
            @navigate="navigate"
            @task="beginTask"
          />
          <SubmissionSender
            @cases="navigate('Vorgänge')"
            :visible="section === 'Senden'"
            :default-source="defaultDestinations?.sourceDestination || ''"
            :process-draft="processDraft"
            :test-draft="testDraft"
            v-show="section === 'Senden'"
            :session="activeSession"
            :busy="busy"
            @busy="resourceBusy"
            @event-log="openEventLog"
            @activity="(event) => addEvent(event.api, event.action, event.status, event.started, event.role)"
            @fatal="fatal"
          />
          <ProcessWorkspace
            v-show="section === 'Prozesse'"
            :visible="section === 'Prozesse'"
            :session="activeSession"
            :busy="busy"
            :context="processContext"
            @send="
              (value) => {
                processDraft = value;
                navigate('Senden');
              }
            "
            @busy="resourceBusy"
            @activity="(event) => addEvent(event.api, event.action, event.status, event.started, event.role)"
            @fatal="fatal"
          />
          <DestinationManager
            v-show="section === 'Destinations'"
            :session="activeSession"
            :busy="busy"
            @busy="resourceBusy"
            @activity="(event) => addEvent(event.api, event.action, event.status, event.started, event.role)"
            @fatal="fatal"
            @changed="keyRevision++"
            @receive="
              (id) => {
                selectedDestination = id;
                keyRevision++;
                navigate('Empfangen');
              }
            "
          />
          <div
            v-show="section === 'Empfangen'"
            class="receive-tabs"
            role="tablist"
            aria-label="Eingang"
            @keydown="receiveTabKey"
          >
            <button
              v-for="tab in [
                { id: 'submissions', title: 'Einreichungen' },
                { id: 'replies', title: 'Antworten' },
              ]"
              :id="`receive-tab-${tab.id}`"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="receiveTab === tab.id"
              :aria-controls="`receive-panel-${tab.id}`"
              :tabindex="receiveTab === tab.id ? 0 : -1"
              :disabled="busy"
              @click="selectReceiveTab(tab.id)"
            >
              {{ tab.title }}
            </button>
          </div>
          <div
            v-show="section === 'Empfangen' && receiveTab === 'submissions'"
            id="receive-panel-submissions"
            role="tabpanel"
            aria-labelledby="receive-tab-submissions"
          >
            <DestinationKeys
              ref="destinationSetup"
              :default-destination="defaultDestinations?.receiverDestination || ''"
              v-show="section === 'Empfangen'"
              :session="activeSession"
              :busy="busy"
              @busy="resourceBusy"
              @activity="
                (event) => addEvent(event.api, event.action, event.status, event.started, event.role)
              "
              @fatal="fatal"
              @destination="(id) => (selectedDestination = id)"
              @invalidate="keyRevision++"
            />
            <SubmissionBrowser
              ref="receiveBrowser"
              @setup="destinationSetup?.showSetup()"
              :target="receiveTarget"
              v-show="section === 'Empfangen'"
              :session="activeSession"
              :busy="busy"
              :destination-id="selectedDestination"
              :key-revision="keyRevision"
              :receive-revision="submissionRevision"
              @receive-start="replyRevision++"
              @event-log="openEventLog"
              @busy="resourceBusy"
              @activity="
                (event) => addEvent(event.api, event.action, event.status, event.started, event.role)
              "
              @fatal="fatal"
            />
          </div>
          <CaseWorkspace
            v-show="section === 'Vorgänge'"
            :session="activeSession"
            :busy="busy"
            :visible="section === 'Vorgänge'"
            @busy="resourceBusy"
            @event-log="openEventLog"
            @receive="reopenCase"
          />
          <ApplicationHelp v-if="section === 'Hilfe'" />
          <TestTools
            v-if="toolsOpened"
            v-show="section === 'Testwerkzeuge'"
            :busy="busy"
            @send="openTestDraft"
          />
          <EventLogPanel
            :known-targets="caseRecords"
            v-show="section === 'Event Log'"
            :session="activeSession"
            :busy="busy"
            :target="eventTarget"
            :visible="section === 'Event Log'"
            @busy="resourceBusy"
            @activity="(event) => addEvent(event.api, event.action, event.status, event.started, event.role)"
            @fatal="fatal"
          />
          <div
            v-show="section === 'Empfangen' && receiveTab === 'replies'"
            id="receive-panel-replies"
            role="tabpanel"
            aria-labelledby="receive-tab-replies"
          >
            <ReplyBrowser
              @event-log="openEventLog"
              v-show="section === 'Empfangen'"
              :session="activeSession"
              :busy="busy"
              :key-revision="keyRevision"
              :receive-revision="replyRevision"
              @receive-start="submissionRevision++"
              @busy="resourceBusy"
              @activity="
                (event) => addEvent(event.api, event.action, event.status, event.started, event.role)
              "
              @fatal="fatal"
            />
          </div>
          <div v-show="section === 'Diagnose'" class="diagnostic-view">
            <section class="tool-section" aria-labelledby="setup-title">
              <div class="tool-section-heading">
                <div>
                  <h2 id="setup-title">Lokaler Anwendungskern</h2>
                  <p>Ohne Zugangsdaten und ohne Anfragen an FIT-Connect.</p>
                </div>
                <button class="button" type="button" :disabled="busy" @click="probe(['v2', 'v3'])">
                  {{ pendingAction === 'probe' ? 'Prüfung läuft …' : 'Komponenten prüfen' }}
                </button>
              </div>
              <div class="adapter-cards">
                <div v-for="api in ['v3', 'v2']" :key="api" class="adapter-card">
                  <strong>API {{ api }}</strong>
                  <span>Java-SDK {{ api === 'v3' ? '4.0.0-rc.2' : '3.5.2' }}</span>
                  <span class="status-badge" :class="results[api] ? 'ok' : 'info'">
                    {{ results[api] ? 'Lokal bereit' : 'Noch nicht geprüft' }}
                  </span>
                </div>
              </div>
              <p class="small-note" aria-live="polite" :aria-busy="pendingAction === 'probe'">
                Die lokale Prüfung bestätigt das Laden der Komponenten. Anmeldung und Berechtigungen für
                Destinations werden separat geprüft.
              </p>
            </section>
            <section class="tool-section" aria-labelledby="report-title">
              <div class="tool-section-heading">
                <div>
                  <h2 id="report-title">Technischer Diagnosebericht</h2>
                  <p>Version, TEST-Umgebung und die letzten {{ trace.length }} protokollierten Aufrufe.</p>
                </div>
                <button class="button secondary" type="button" :disabled="busy" @click="exportReport">
                  Diagnosebericht speichern
                </button>
              </div>
              <p>
                Der Bericht enthält nur festgelegte technische Angaben: Aktion, API, Zeitpunkt, Dauer und
                freigegebene Fehlercodes. Zugangsdaten, Kennungen, Schlüssel, Dateinamen und
                Einreichungsinhalte werden nicht aufgenommen. Er wird lokal gespeichert und nicht automatisch
                versendet.
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
                    Die letzten 100 technischen Aufrufe dieser Sitzung. Fehlercodes können Sie direkt am
                    Eintrag öffnen.
                  </p>
                </div>
                <button
                  class="button secondary"
                  type="button"
                  :disabled="busy || (!events.length && !trace.length)"
                  @click="clearHistory"
                >
                  Verlauf leeren
                </button>
              </div>
              <p v-if="!trace.length" class="empty-state">
                Noch keine technischen Aufrufe. Starten Sie eine Komponentenprüfung oder melden Sie sich bei
                TEST an.
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
          <div v-show="section === 'Info'" class="info-view">
            <section class="tool-section app-info" aria-labelledby="about-title">
              <img class="app-mark large" :src="appLogo" alt="" width="64" height="64" />
              <div>
                <p class="workspace-eyebrow">Desktop-Anwendung</p>
                <h2 id="about-title">{{ productName }}</h2>
                <p>Version {{ version }} · Alpha 1</p>
                <p>{{ productPurpose }}.</p>
              </div>
            </section>
            <section class="tool-section" aria-labelledby="scope-title">
              <h2 id="scope-title">Aktueller Funktionsumfang</h2>
              <dl class="info-facts">
                <dt>Umgebung</dt>
                <dd>Ausschließlich FIT-Connect TEST</dd>
                <dt>Austausch</dt>
                <dd>
                  Senden, Empfangen, lokale Entschlüsselung und technische Fachdatenprüfung über API v2 und v3
                </dd>
                <dt>Verwaltung</dt>
                <dd>Vorhandene eigene Destinations ansehen. Änderungen und Bulk-Edit über API v3</dd>
                <dt>Entwicklungsstand</dt>
                <dd>
                  Alpha 1 für Integrationstests. Installation und Verhalten auf Ihren Zielgeräten vor dem
                  Einsatz prüfen.
                </dd>
              </dl>
            </section>
            <section class="tool-section" aria-labelledby="license-title">
              <h2 id="license-title">Lizenz und Einordnung</h2>
              <p>Unabhängiges Projekt. Kein offizielles Produkt der FITKO.</p>
              <p>Diese Anwendung steht unter der European Union Public Licence 1.2 (EUPL-1.2).</p>
              <button type="button" class="button secondary" @click="licenseDialog.showModal()">
                Lizenztext anzeigen
              </button>
              <button type="button" class="button secondary" @click="showDependencyLicenses">
                Drittanbieter-Lizenzen anzeigen
              </button>
            </section>
          </div>
        </div>
      </main>
    </div>
    <div v-if="storageStatus?.error" class="storage-warning" role="alert">
      Schlüsselbestand noch nicht gesichert. Bitte unter „Verbinden“ erneut sichern.
    </div>
    <footer class="app-statusbar">
      <span class="status-connection">
        <span class="connection-dot" :class="{ connected: activeSession }" aria-hidden="true"></span>
        {{ busy ? 'Aktion läuft …' : activeSession ? 'Bei TEST angemeldet' : 'Nicht verbunden' }}
      </span>
      <span>TEST · API {{ apiVersion }}</span>
      <button type="button" @click="navigate('Diagnose')">{{ trace.length }} technische Aufrufe</button>
    </footer>
  </div>
  <dialog
    ref="connectionDialog"
    class="tool-dialog connection-dialog"
    aria-labelledby="session-title"
    @cancel.prevent="closeConnection"
    @close="connectionClosed"
  >
    <div class="tool-section-heading">
      <div>
        <p class="workspace-eyebrow">FIT-Connect TEST · API {{ apiVersion }}</p>
        <h2 id="session-title">Verbindung verwalten</h2>
      </div>
      <button
        class="icon-button"
        type="button"
        :disabled="['open', 'check', 'close'].includes(pendingAction)"
        aria-label="Verbindungsdialog schließen"
        @click="closeConnection"
      >
        <AppIcon name="close" />
      </button>
    </div>
    <p>
      Die Verbindung gilt für alle Arbeitsbereiche. Ihre Zugangsdaten bestimmen die verfügbaren Funktionen.
    </p>
    <p>
      <span class="status-badge" :class="activeSession ? 'ok' : 'info'">
        {{
          ['open', 'check', 'close'].includes(pendingAction)
            ? 'Sitzungsaktion wird ausgeführt …'
            : activeSession
              ? 'Bei TEST angemeldet'
              : 'Nicht verbunden'
        }}
      </span>
    </p>
    <p v-if="error" role="alert" class="status-badge error">{{ error }}</p>
    <section v-if="activeSession" class="connection-identity" aria-labelledby="connection-identity-title">
      <h3 id="connection-identity-title">
        {{
          profiles.find((profile) => profile.profileId === storageStatus?.profileId)?.name ||
          'Aktuelle TEST-Verbindung'
        }}
      </h3>
      <p>
        API {{ activeSession.apiVersion }} ·
        {{ storageStatus?.saved ? 'Geschütztes Profil' : 'Nur in dieser Sitzung' }}
      </p>
      <p v-if="activeSession.clientId">
        <strong>Client-ID</strong>
        <CopyValue :value="activeSession.clientId" label="Client-ID" />
      </p>
    </section>
    <form @submit.prevent="sessionAction('open')" autocomplete="off">
      <div class="client-fields">
        <label for="client-id">
          Client-ID
          <input
            id="client-id"
            v-model="clientId"
            type="text"
            maxlength="512"
            autocomplete="off"
            :disabled="busy"
            required
          />
        </label>
        <label for="client-secret">
          Client-Secret
          <input
            id="client-secret"
            v-model="clientSecret"
            type="password"
            maxlength="8192"
            autocomplete="off"
            :disabled="busy"
            required
          />
        </label>
      </div>
      <label class="checkbox-label">
        <input v-model="rememberProfile" type="checkbox" :disabled="busy" />
        Zugangsdaten und Testschlüssel auf diesem Windows-Benutzerkonto geschützt speichern
      </label>
      <label v-if="rememberProfile" for="profile-name">
        Profilname
        <input
          id="profile-name"
          v-model="profileName"
          maxlength="80"
          required
          :disabled="busy"
          placeholder="Zum Beispiel: Testarbeitsplatz Bauamt"
        />
      </label>
      <p class="small-note">
        Ohne Speichern gelten Zugangsdaten und Schlüssel nur für diese Sitzung. Mit Speichern bleiben auch
        Antwortschlüssel für spätere Replies erhalten. Windows schützt sie für Ihr Benutzerkonto.
        Zugangstokens werden nicht gespeichert. Das Secret wird nach der Übergabe aus dem Eingabefeld geleert.
      </p>
      <div class="client-actions">
        <button class="button" type="submit" :disabled="busy || !clientId.trim() || !clientSecret.trim()">
          {{ activeSession ? 'Mit anderen Zugangsdaten anmelden' : 'Bei TEST anmelden' }}
        </button>
        <button
          v-if="activeSession"
          class="button secondary"
          type="button"
          :disabled="busy || !activeSession"
          @click="sessionAction('check')"
        >
          Sitzung prüfen
        </button>
        <button
          v-if="activeSession"
          class="button secondary"
          type="button"
          :disabled="busy || !activeSession"
          @click="sessionAction('close')"
        >
          Abmelden
        </button>
      </div>
    </form>
    <section v-if="profiles.length" aria-labelledby="saved-profiles-title">
      <h3 id="saved-profiles-title">Gespeicherte TEST-Profile</h3>
      <ul class="send-history-list">
        <li v-for="profile in profiles" :key="profile.profileId">
          <div>
            <strong>{{ profile.name }}</strong>
            <p v-if="profile.available">
              <strong>Client-ID</strong>
              <CopyValue :value="profile.clientId" label="Client-ID" />
            </p>
            <p>
              {{
                profile.available
                  ? `${profile.apiVersion} · ${profile.keyCount} gespeicherte Schlüssel / Antwortkanäle`
                  : 'Unter diesem Benutzerkonto nicht lesbar'
              }}
            </p>
            <div class="client-actions">
              <button
                type="button"
                class="button"
                :disabled="busy || !profile.available"
                @click="connectProfile(profile, true)"
              >
                Mit Profil verbinden
              </button>
              <button
                v-if="profile.keyCount"
                type="button"
                class="button secondary"
                :disabled="busy || !profile.available"
                @click="connectProfile(profile, false)"
              >
                Nur Zugangsdaten verwenden
              </button>
              <ProfileEditor
                :profile="profile"
                :busy="busy"
                @fatal="fatal"
                @busy="resourceBusy"
                @updated="
                  refreshProfiles();
                  profileNotice = 'Profil gespeichert. Ein neues Secret gilt bei der nächsten Anmeldung.';
                "
              />
              <button
                type="button"
                class="button secondary"
                :disabled="busy || !profile.available"
                @click="backupProfile(profile)"
              >
                Geschützte Sicherung exportieren
              </button>
              <button
                type="button"
                class="button secondary"
                :disabled="busy"
                @click="askRemoveProfile(profile)"
              >
                Gespeichertes Profil entfernen
              </button>
            </div>
          </div>
        </li>
      </ul>
      <p class="small-note">
        „Nur Zugangsdaten verwenden“ öffnet eine Sitzung ohne gespeicherte Schlüssel und verändert deren
        Sicherung nicht.
      </p>
    </section>
    <ProfileDefaults
      v-if="storageStatus?.saved && defaultDestinations"
      :session="activeSession"
      :defaults="defaultDestinations"
      :busy="busy"
      @busy="resourceBusy"
      @fatal="fatal"
      @saved="
        (value) => {
          defaultDestinations = value;
        }
      "
    />
    <KeyInventory
      :session="activeSession"
      :busy="busy"
      @busy="resourceBusy"
      @fatal="fatal"
      @invalidate="
        keyRevision++;
        refreshProfiles();
        refreshStorageStatus();
      "
    />
    <details class="profile-backup">
      <summary>Geschützte Profilsicherung importieren</summary>
      <p>
        Eine Sicherung enthält Zugangsdaten und Schlüssel verschlüsselt mit Windows-Benutzerschutz. Sie ist
        kein Passwort-Export für andere Benutzerkonten oder Rechner. Bereits vorhandene Profile werden beim
        Import nicht überschrieben.
      </p>
      <button type="button" class="button secondary" :disabled="busy" @click="restoreProfileBackup">
        Geschützte Sicherung importieren
      </button>
      <FileDropInput
        id="profile-backup-file"
        label="Geschützte Profildatei"
        accept=".fctest-profile"
        :disabled="busy"
        @files="restoreProfileBackup"
      >
        Höchstens 8 MiB verschlüsselte Profildaten. Das ursprüngliche Windows-Benutzerkonto wird benötigt.
      </FileDropInput>
    </details>
    <p v-if="profileNotice" role="status">{{ profileNotice }}</p>
    <p v-if="profileError" role="alert">{{ profileError }}</p>
    <p v-if="storageStatus?.profileId" class="small-note">
      {{
        storageStatus.saved
          ? 'Diese Sitzung speichert Zugangsdaten und Schlüssel geschützt im gewählten Profil.'
          : 'Der aktuelle Schlüsselbestand konnte nicht gesichert werden. Bitte die Anwendung geöffnet lassen und erneut speichern.'
      }}
    </p>
    <button
      v-if="storageStatus?.error"
      type="button"
      class="button secondary"
      :disabled="busy"
      @click="retryProfileSave"
    >
      Schlüsselbestand erneut sichern
    </button>
    <p v-if="activeSession" class="small-note">
      Eine Sitzungsprüfung prüft die OAuth-Anmeldung. Zugriffsrechte werden beim jeweiligen Abruf geprüft.
    </p>
  </dialog>
  <dialog
    v-if="forgetCandidate"
    ref="forgetDialog"
    class="tool-dialog"
    aria-labelledby="forget-profile-title"
    @cancel.prevent="forgetCandidate = null"
  >
    <h2 id="forget-profile-title">Gespeichertes Profil entfernen?</h2>
    <p>
      „{{ forgetCandidate.name }}“ und seine gespeicherten Schlüssel werden von diesem Rechner entfernt.
      Aktuell geladene Sitzungsschlüssel bleiben bis zum Abmelden verfügbar.
    </p>
    <p>
      Dauerhaft gespeicherte Vorgangskopien dieses Profils werden ebenfalls gelöscht. Sitzungskopien bleiben
      bis zum Beenden der Anwendung erhalten.
    </p>
    <p>
      Ohne weitere Sicherung können spätere Antworten und bereits verschlüsselte Nachrichten unter Umständen
      nicht mehr entschlüsselt werden.
    </p>
    <div class="client-actions">
      <button
        type="button"
        class="button secondary"
        autofocus
        :disabled="busy"
        @click="forgetCandidate = null"
      >
        Abbrechen
      </button>
      <button type="button" class="button" :disabled="busy" @click="removeProfile(forgetCandidate)">
        Profil und gespeicherte Schlüssel entfernen
      </button>
    </div>
  </dialog>
  <dialog ref="dependencyDialog" class="tool-dialog license-dialog" aria-labelledby="dependency-title">
    <h2 id="dependency-title">Drittanbieter-Komponenten und Lizenzen</h2>
    <button class="button secondary" @click="dependencyDialog.close()">Schließen</button>
    <p>
      Lizenz- und Urheberrechtshinweise der mitgelieferten Komponenten und PDF-Schriftarten. Die Lizenz der
      Anwendung können Sie separat unter „Lizenztext anzeigen“ lesen.
    </p>
    <pre
      >{{ bpmnLicense }}

{{ apacheLicense }}
{{ pdfLicense }}

{{ frontendLicenses }}</pre>
  </dialog>
  <dialog ref="licenseDialog" class="tool-dialog license-dialog" aria-labelledby="license-dialog-title">
    <div class="tool-section-heading">
      <h2 id="license-dialog-title">European Union Public Licence 1.2</h2>
      <button
        type="button"
        class="icon-button"
        aria-label="Lizenztext schließen"
        @click="licenseDialog.close()"
      >
        <AppIcon name="close" />
      </button>
    </div>
    <pre>{{ licenseText }}</pre>
  </dialog>
</template>
