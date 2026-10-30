<script setup>
import {
  ref,
  shallowRef,
  provide,
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  defineAsyncComponent,
} from 'vue';
import { environmentKey } from './environments.js';
import { useEnvironmentSwitch } from './app/useEnvironmentSwitch.js';
import { useDiagnostics } from './app/useDiagnostics.js';
import { useWindowTitle } from './app/useWindowTitle.js';
import { useTheme } from './app/useTheme.ts';
import { useConnections } from './app/useConnections.js';
import { useCaseReopening } from './app/useCaseReopening.js';
import { useReceiveTabs } from './app/useReceiveTabs.js';
import { useApplicationUpdates } from './app/useApplicationUpdates.js';
import { navigation } from './app/navigation.js';
import ConnectionDialog from './app/ConnectionDialog.vue';
import DiagnosticsView from './app/DiagnosticsView.vue';
import InfoView from './app/InfoView.vue';
import { provideScannerMonitor } from './app/useScannerMonitor.js';
import ScannerActivity from './app/ScannerActivity.vue';
import SaveFeedback from './app/SaveFeedback.vue';
import AppIcon from './AppIcon.vue';
import ApplicationChrome from './app/ApplicationChrome.vue';
import WorkspaceHeading from './app/WorkspaceHeading.vue';
import { createSchemaSourceAccess, schemaSourceAccessKey } from './schema-source-access.js';
import StartWorkspace from './StartWorkspace.vue';
import { version } from '../../package.json';
import { errorMessage } from './diagnostics.js';
import DestinationKeys from './DestinationKeys.vue';
const ProcessWorkspace = defineAsyncComponent(() => import('./ProcessWorkspace.vue'));
import { processWorkspaceKey, createProcessWorkspace } from './process-context.js';
import DestinationManager from './DestinationManager.vue';
import SubmissionSender from './SubmissionSender.vue';
import SubmissionBrowser from './SubmissionBrowser.vue';
import EventLogPanel from './EventLogPanel.vue';
import CaseWorkspace from './CaseWorkspace.vue';
const ApplicationHelp = defineAsyncComponent(() => import('./ApplicationHelp.vue'));
const MalwareScannerSettings = defineAsyncComponent(() => import('./integration/MalwareScannerSettings.vue'));
const TestTools = defineAsyncComponent(() => import('./TestTools.vue'));
const testDraft = shallowRef(null);
const toolsOpened = ref(false),
  scannerOpened = ref(false);
const receiveTarget = shallowRef(null);
import ReplyBrowser from './ReplyBrowser.vue';
import { createCaseWorkspace, caseWorkspaceKey } from './case-context.js';
const caseRecords = shallowRef([]);
const caseWorkspace = createCaseWorkspace((records) => (caseRecords.value = records));
provide(caseWorkspaceKey, caseWorkspace);
const processDraft = shallowRef(null),
  processContext = shallowRef(null);
const processWorkspace = createProcessWorkspace((context) => {
  processContext.value = { ...context, requestId: crypto.randomUUID() };
  void navigate('Prozesse');
});
const processSelection = processWorkspace.selection;
provide(processWorkspaceKey, processWorkspace);
const section = ref('Start');
const apiVersion = ref('v3');
const environment = ref('TEST');
useWindowTitle(environment);
provide(environmentKey, environment);
const { theme, preference, setPreference } = useTheme();
const destinationSetup = ref(null);
const keyRevision = ref(0);
const submissionRevision = ref(0),
  replyRevision = ref(0);
const eventTarget = ref(null);
const connections = useConnections({
  apiVersion,
  environment,
  beforeChange: () => receiveBrowser.value?.confirmLeave(),
  focusFallback: () => viewHeading.value?.focus({ preventScroll: true }),
  profileOpened: () => keyRevision.value++,
  addEvent: (...args) => diagnostics.addEvent(...args),
});
const {
  busy,
  pendingAction,
  error,
  sessions,
  activeSession,
  selectedDestination,
  defaultDestinations,
  storageStatus,
  refreshStorageStatus,
  showConnection,
} = connections;
provideScannerMonitor(activeSession);
provide(
  schemaSourceAccessKey,
  createSchemaSourceAccess(() => activeSession.value),
);
function fatal(cause) {
  sessions.value = {};
  caseWorkspace.clear();
  error.value = errorMessage(cause);
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
const diagnostics = useDiagnostics({
  version,
  environment,
  apiVersion,
  busy,
  pendingAction,
  error,
  sessions,
  refreshStorageStatus,
});
const { results, events, trace, reportJson, addEvent, probe, exportReport, clearHistory } = diagnostics;
function recordActivity(event) {
  addEvent(event.api, event.action, event.status, event.started, event.role);
}
const currentView = computed(() => navigation.find((item) => item.name === section.value));
const receiveBrowser = ref(null);
const { receiveTab, selectReceiveTab, receiveTabKey } = useReceiveTabs({
  activeSession,
  busy,
  receiveBrowser,
});
const reopenCase = useCaseReopening({ receiveTab, selectedDestination, receiveTarget, navigate });
const updates = useApplicationUpdates({ busy, receiveBrowser, sessions, fatal });
const changeEnvironment = useEnvironmentSwitch({
  busy,
  environment,
  receiveBrowser,
  sessions,
  connections,
  caseWorkspace,
  testDraft,
  receiveTarget,
  processDraft,
  processContext,
  processSelection,
  eventTarget,
  destinationSetup,
  diagnostics,
  clearHistory,
  error,
  navigate,
});
async function changeApi(event) {
  const selected = event.target.value;
  event.target.value = apiVersion.value;
  await connections.changeApi(selected);
}
const workspace = ref(null),
  viewHeading = ref(null);
const scrollPositions = new Map();
async function navigate(name) {
  if (section.value === name) return;
  scrollPositions.set(section.value, workspace.value?.scrollTop || 0);
  section.value = name;
  if (name === 'Testwerkzeuge') toolsOpened.value = true;
  if (name === 'Virenscan') scannerOpened.value = true;
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
function preventFileNavigation(event) {
  event.preventDefault();
}
onMounted(() => {
  window.addEventListener('dragover', preventFileNavigation);
  window.addEventListener('drop', preventFileNavigation);
});
onBeforeUnmount(() => {
  window.removeEventListener('dragover', preventFileNavigation);
  window.removeEventListener('drop', preventFileNavigation);
});
</script>
<template>
  <a class="skip-link" href="#main">Zum Arbeitsbereich</a>
  <div class="desktop-shell" :inert="updates.installing.value" @dragover.prevent @drop.prevent>
    <ApplicationChrome
      :api-version="apiVersion"
      :busy="busy"
      :active-session="activeSession"
      :theme="theme"
      :theme-preference="preference"
      :section="section"
      :version="version"
      @api="changeApi"
      @environment="changeEnvironment"
      @connection="showConnection"
      @theme="setPreference"
      @navigate="navigate"
    />
    <div class="app-workspace">
      <WorkspaceHeading ref="viewHeading" :section="section" :description="currentView.description" />
      <main id="main" ref="workspace" class="workspace-scroll" tabindex="-1" aria-label="Arbeitsbereich">
        <div :key="environment" class="workspace-content">
          <div
            v-if="updates.state.value.version && !updates.state.value.dismissed && section !== 'Info'"
            class="connection-notice"
            role="status"
          >
            <div>
              <strong>FBForge Connect {{ updates.state.value.version }} ist verfügbar.</strong>
              <p>Aktualisieren Sie die Anwendung, wenn Ihre aktuelle Arbeit abgeschlossen ist.</p>
            </div>
            <button class="button secondary" @click="navigate('Info')">Update ansehen</button>
            <button class="button secondary" @click="updates.controller.dismiss()">Später</button>
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
              !activeSession &&
              !['Start', 'Diagnose', 'Info', 'Prozesse', 'Hilfe', 'Testwerkzeuge', 'Virenscan'].includes(
                section,
              )
            "
            class="connection-notice"
          >
            <AppIcon name="connection" />
            <div>
              <strong>Mit FIT-Connect verbinden</strong>
              <p>
                Mit Ihren Zugangsdaten für {{ environment }} stehen Ihnen die Funktionen Ihrer Berechtigungen
                zur Verfügung.
              </p>
            </div>
            <button type="button" class="button secondary" @click="showConnection">
              Verbindung herstellen
            </button>
          </div>
          <p v-if="error" class="status-badge error" role="alert">{{ error }}</p>
          <SaveFeedback />
          <ScannerActivity
            :visible="['Senden', 'Empfangen'].includes(section)"
            @open="navigate('Virenscan')"
          />
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
            @activity="recordActivity"
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
            @activity="recordActivity"
            @fatal="fatal"
          />
          <DestinationManager
            v-show="section === 'Destinations'"
            :session="activeSession"
            :busy="busy"
            @busy="resourceBusy"
            @activity="recordActivity"
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
              @activity="recordActivity"
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
              @activity="recordActivity"
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
            :session="activeSession"
            @busy="resourceBusy"
            v-if="toolsOpened"
            v-show="section === 'Testwerkzeuge'"
            :busy="busy"
            @send="openTestDraft"
          />
          <MalwareScannerSettings
            v-if="scannerOpened"
            v-show="section === 'Virenscan'"
            :session="activeSession"
            :busy="busy"
            @busy="resourceBusy"
            @changed="
              submissionRevision++;
              replyRevision++;
            "
          />
          <EventLogPanel
            :known-targets="caseRecords"
            v-show="section === 'Event Log'"
            :session="activeSession"
            :busy="busy"
            :target="eventTarget"
            :visible="section === 'Event Log'"
            @busy="resourceBusy"
            @activity="recordActivity"
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
              @activity="recordActivity"
              @fatal="fatal"
            />
          </div>
          <DiagnosticsView
            v-show="section === 'Diagnose'"
            :busy="busy"
            :pending-action="pendingAction"
            :results="results"
            :trace="trace"
            :events="events"
            :report-json="reportJson"
            @probe="probe(['v2', 'v3'])"
            @export="exportReport"
            @clear="clearHistory"
          />
          <InfoView
            :visible="section === 'Info'"
            :update-state="updates.state.value"
            :busy="busy"
            @check-update="updates.controller.check()"
            @download-update="updates.controller.download()"
            @install-update="updates.install()"
            @cancel-update="updates.controller.cancel()"
            @manual-update="updates.controller.manual()"
            @automatic-updates="updates.controller.setAutomatic($event)"
          />
        </div>
      </main>
    </div>
    <div v-if="storageStatus?.error" class="storage-warning" role="alert">
      Schlüsselbestand noch nicht gesichert. Bitte unter „Verbinden“ erneut sichern.
    </div>
    <footer class="app-statusbar">
      <span class="status-connection">
        <span class="connection-dot" :class="{ connected: activeSession }" aria-hidden="true"></span>
        {{ busy ? 'Aktion läuft …' : activeSession ? 'Angemeldet' : 'Nicht verbunden' }}
      </span>
      <span>{{ environment }} · API {{ apiVersion }}</span>
      <button type="button" @click="navigate('Diagnose')">{{ trace.length }} technische Aufrufe</button>
    </footer>
  </div>
  <ConnectionDialog
    :api-version="apiVersion"
    :connection="connections"
    @fatal="fatal"
    @busy="resourceBusy"
    @keys-changed="keyRevision++"
  />
</template>
