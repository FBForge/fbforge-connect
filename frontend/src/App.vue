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
import { useDiagnostics } from './app/useDiagnostics.js';
import { useTheme } from './app/useTheme.ts';
import { useConnections } from './app/useConnections.js';
import { navigation } from './app/navigation.js';
import ConnectionDialog from './app/ConnectionDialog.vue';
import DiagnosticsView from './app/DiagnosticsView.vue';
import InfoView from './app/InfoView.vue';
import AppIcon from './AppIcon.vue';
import ApplicationChrome from './app/ApplicationChrome.vue';
import DocumentationLink from './DocumentationLink.vue';
import { createSchemaSourceAccess, schemaSourceAccessKey } from './schema-source-access.js';
import StartWorkspace from './StartWorkspace.vue';
import packageInfo from '../../package.json';
import { errorMessage } from './diagnostics.js';
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
const { theme, toggleTheme } = useTheme();
const destinationSetup = ref(null);
const keyRevision = ref(0);
const submissionRevision = ref(0),
  replyRevision = ref(0);
const eventTarget = ref(null);
const connections = useConnections({
  apiVersion,
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
const version = packageInfo.version;
const diagnostics = useDiagnostics({
  version,
  apiVersion,
  busy,
  pendingAction,
  error,
  sessions,
  refreshStorageStatus,
});
const { results, events, trace, reportJson, addEvent, probe, exportReport, clearHistory } = diagnostics;

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
  viewHeading = ref(null);
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
  <div class="desktop-shell" @dragover.prevent @drop.prevent>
    <ApplicationChrome
      :api-version="apiVersion"
      :busy="busy"
      :active-session="activeSession"
      :theme="theme"
      :section="section"
      :version="version"
      @api="changeApi"
      @connection="showConnection"
      @theme="toggleTheme"
      @navigate="navigate"
    />
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
          <InfoView :visible="section === 'Info'" />
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
  <ConnectionDialog
    :api-version="apiVersion"
    :connection="connections"
    @fatal="fatal"
    @busy="resourceBusy"
    @keys-changed="keyRevision++"
  />
</template>
