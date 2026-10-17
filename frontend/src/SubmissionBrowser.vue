<script setup>
import { inject, ref, computed, watch, nextTick } from 'vue';
import { invoke } from './native.js';
import { processWorkspaceKey } from './process-context.js';
const processWorkspace = inject(processWorkspaceKey, null);
import { caseWorkspaceKey } from './case-context.js';
const caseWorkspace = inject(caseWorkspaceKey, null);
import ReceivePanel from './ReceivePanel.vue';
import { listSubmissions, loadSubmission } from './submissions.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';

const props = defineProps({
  session: Object,
  busy: Boolean,
  destinationId: String,
  keyRevision: Number,
  receiveRevision: Number,
});
const emit = defineEmits(['busy', 'activity', 'fatal', 'event-log', 'receive-start']);
const destination = ref(props.destinationId || ''),
  submission = ref(''),
  page = ref(null),
  detail = ref(null),
  error = ref('');
const pending = ref(false),
  heading = ref(null);
const verified = ref(false);
const receiptHistory = ref([]);
const confirmedDetail = computed(() =>
  receiptHistory.value.find(
    (item) =>
      item.sessionId === props.session?.sessionId &&
      item.apiVersion === props.session?.apiVersion &&
      item.submissionId === detail.value?.submissionId &&
      item.status === 'confirmed',
  ),
);
function recordReceipt(value) {
  receiptHistory.value = [
    value,
    ...receiptHistory.value.filter((item) => item.attemptId !== value.attemptId),
  ].slice(0, 20);
  if (
    value.status === 'confirmed' &&
    value.sessionId === props.session?.sessionId &&
    value.apiVersion === props.session?.apiVersion &&
    value.destinationId === destination.value.trim() &&
    page.value?.submissions.some((item) => item.submissionId === value.submissionId)
  )
    page.value = {
      ...page.value,
      totalCount: page.value.totalCount - 1,
      submissions: page.value.submissions.filter((item) => item.submissionId !== value.submissionId),
    };
}
function openEventLog(item) {
  if (item.replyId) {
    emit('event-log', {
      apiVersion: item.apiVersion || props.session?.apiVersion,
      sessionId: item.sessionId || props.session?.sessionId,
      caseId: item.caseId,
      replyId: item.replyId,
    });
    return;
  }
  emit('event-log', {
    apiVersion: item.apiVersion || props.session?.apiVersion,
    sessionId: item.sessionId || props.session?.sessionId,
    destinationId: item.destinationId,
    caseId: item.caseId,
    submissionId: item.submissionId,
  });
}
const disabled = computed(() => props.busy || pending.value || !props.session);
const context = computed(() =>
  props.session ? `${props.session.apiVersion}/${props.session.sessionId}` : '',
);
let revision = 0;
const messages = {
  invalid_input: 'Bitte gültige Zustellpunkt- und Einreichungs-IDs eingeben.',
  resource_denied: 'Diese TEST-Zugangsdaten haben keine Leseberechtigung für die angefragte Einreichung.',
  resource_missing: 'Die Einreichung wurde nicht gefunden oder ist nicht mehr abrufbar.',
  invalid_resource: 'Die TEST-Antwort ist unvollständig oder passt nicht zur angefragten Einreichung.',
  resource_unavailable: 'Die Einreichungen konnten nicht geladen werden.',
};
watch([context, () => props.destinationId], () => {
  destination.value = props.destinationId || '';
  submission.value = '';
  page.value = null;
  detail.value = null;
  error.value = '';
  revision++;
});
watch(destination, () => {
  page.value = null;
  detail.value = null;
  revision++;
});
async function run(action, operation, apply) {
  if (disabled.value) return;
  const active = { ...props.session },
    current = revision,
    started = performance.now();
  pending.value = true;
  emit('busy', true);
  error.value = '';
  let status = 'Erfolgreich';
  try {
    const result = await operation(active);
    if (current === revision) await apply(result);
  } catch (cause) {
    status = 'Fehlgeschlagen';
    const code = typeof cause === 'string' ? cause : cause?.message;
    if (current === revision)
      error.value = Object.hasOwn(messages, code) ? messages[code] : errorMessage(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    emit('busy', false);
    emit('activity', {
      api: active.apiVersion,
      role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action,
      status,
      started,
    });
  }
}
function search(offset = 0) {
  detail.value = null;
  emit('receive-start');
  run(
    'Einreichungen laden',
    (active) => listSubmissions(invoke, active, destination.value.trim(), offset),
    (result) => {
      page.value = result;
      for (const item of result.submissions) caseWorkspace?.remember(props.session, item);
    },
  );
}
function open(id = submission.value.trim()) {
  detail.value = null;
  emit('receive-start');
  run(
    'Einreichungsinformationen abrufen',
    (active) => loadSubmission(invoke, active, destination.value.trim(), id),
    async (result) => {
      caseWorkspace?.remember(props.session, result);
      detail.value = result;
      submission.value = result.submissionId;
      await nextTick();
      heading.value?.focus();
    },
  );
}
</script>

<template>
  <div class="submission-workspace">
    <section class="tool-section" aria-labelledby="submission-search-title">
      <h2 id="submission-search-title">Einreichungen suchen</h2>
      <p>
        Verfügbare Einreichungen eines Zustellpunkts auflisten oder eine bekannte Einreichungs-ID direkt
        öffnen. Die aktuelle TEST-Sitzung wird wiederverwendet.
      </p>
      <p v-if="!session">Bitte zuerst eine TEST-Sitzung öffnen.</p>
      <form @submit.prevent="search()">
        <div class="client-fields">
          <label for="pickup-destination">
            Zustellpunkt-ID
            <input
              id="pickup-destination"
              v-model="destination"
              type="text"
              maxlength="36"
              required
              :disabled="disabled"
            />
            <small>Wird auch aus der Zustellpunktauswahl übernommen.</small>
          </label>
          <label for="pickup-submission">
            Einreichungs-ID (optional)
            <input
              id="pickup-submission"
              v-model="submission"
              type="text"
              maxlength="36"
              :disabled="disabled"
            />
          </label>
        </div>
        <div class="client-actions">
          <button class="button" type="submit" :disabled="disabled || !destination.trim()">
            Einreichungen laden
          </button>
          <button
            class="button secondary"
            type="button"
            :disabled="disabled || !destination.trim() || !submission.trim()"
            @click="open()"
          >
            Einreichung direkt öffnen
          </button>
        </div>
      </form>
      <p v-if="pending" role="status">Einreichungen werden aus TEST geladen …</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="page">
        <p>{{ page.totalCount }} verfügbare Einreichungen an diesem Zustellpunkt.</p>
        <p v-if="!page.submissions.length">Keine Einreichungen gefunden.</p>
        <div v-else class="client-table support-table">
          <table class="submission-result-table">
            <thead>
              <tr>
                <th scope="col">Einreichung</th>
                <th scope="col">Vorgang</th>
                <th scope="col">Aktion</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in page.submissions" :key="item.submissionId">
                <td data-label="Einreichung">
                  <code>{{ item.submissionId }}</code>
                </td>
                <td data-label="Vorgang">
                  <code v-if="item.caseId">{{ item.caseId }}</code>
                  <span v-else>Beim Detailabruf verfügbar</span>
                </td>
                <td data-label="Aktion">
                  <div class="client-actions">
                    <button
                      class="button secondary"
                      type="button"
                      :disabled="disabled"
                      @click="open(item.submissionId)"
                    >
                      Öffnen
                    </button>
                    <button
                      v-if="item.caseId"
                      class="button secondary"
                      type="button"
                      :disabled="disabled"
                      @click="openEventLog(item)"
                    >
                      Event Log prüfen
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="client-actions">
          <button
            class="button secondary"
            type="button"
            :disabled="disabled || page.offset === 0"
            @click="search(page.offset - 20)"
          >
            Vorherige Seite
          </button>
          <button
            class="button secondary"
            type="button"
            :disabled="
              disabled || page.offset + page.submissions.length >= page.totalCount || page.offset >= 10000
            "
            @click="search(page.offset + 20)"
          >
            Nächste Seite
          </button>
          <button class="button secondary" type="button" :disabled="disabled" @click="search()">
            Neu laden
          </button>
        </div>
      </template>
      <article v-if="detail">
        <h3 ref="heading" tabindex="-1">Einreichungsinformationen</h3>
        <p>
          <span class="status-badge" :class="verified || confirmedDetail ? 'ok' : 'info'">
            {{
              confirmedDetail
                ? confirmedDetail.action === 'accept'
                  ? 'Empfang angenommen'
                  : 'Einreichung abgelehnt'
                : verified
                  ? 'Technische Inhaltsprüfungen abgeschlossen'
                  : 'Inhalte noch nicht geprüft'
            }}
          </span>
        </p>
        <dl class="receipt-dialog-context">
          <dt>Einreichung</dt>
          <dd>
            <code>{{ detail.submissionId }}</code>
          </dd>
          <dt>Vorgang</dt>
          <dd>
            <code>{{ detail.caseId }}</code>
          </dd>
          <dt>Zustellpunkt</dt>
          <dd>
            <code>{{ detail.destinationId }}</code>
          </dd>
          <template v-if="detail.fromDestinationId">
            <dt>Absender</dt>
            <dd>
              <code>{{ detail.fromDestinationId }}</code>
            </dd>
          </template>
          <dt>Leistung</dt>
          <dd>
            {{ detail.serviceName || 'Nicht angegeben' }}
            <br />
            <span v-if="detail.serviceIdentifier">{{ detail.serviceIdentifier }}</span>
          </dd>
          <dt>Region / ARS</dt>
          <dd>{{ detail.region || 'Nicht angegeben' }}</dd>
          <template v-if="detail.processModelId">
            <dt>Prozessmodell</dt>
            <dd>{{ detail.processModelId }}</dd>
            <dt>Nachricht</dt>
            <dd>{{ detail.messageId }}</dd>
          </template>
          <dt>Metadaten</dt>
          <dd>{{ detail.metadataAvailable ? 'Verschlüsselt vorhanden' : 'Nicht vorhanden' }}</dd>
          <dt>Fachdaten</dt>
          <dd>{{ detail.dataAvailable ? 'Verschlüsselt vorhanden' : 'Nicht vorhanden' }}</dd>
        </dl>
        <div class="client-actions">
          <button class="button secondary" type="button" :disabled="disabled" @click="openEventLog(detail)">
            Event Log prüfen
          </button>
        </div>
        <details v-if="detail.attachments.length">
          <summary>Transportanlagen ({{ detail.attachments.length }})</summary>
          <ul>
            <li v-for="id in detail.attachments" :key="id">
              <code>{{ id }}</code>
            </li>
          </ul>
        </details>
        <p v-if="!confirmedDetail">
          Das Laden dieser Informationen entschlüsselt keine Inhalte und bestätigt keinen Empfang. Schlüssel
          dieser Sitzung bleiben erhalten.
        </p>
      </article>
    </section>
    <p v-if="detail?.processModelId">
      <button
        type="button"
        class="button secondary"
        :disabled="disabled"
        @click="
          processWorkspace?.showContext({
            ...detail,
            apiVersion: session.apiVersion,
            sessionId: session.sessionId,
          })
        "
      >
        Nachrichtenbezug im BPMN-Modell zeigen
      </button>
      <span class="small-note">
        Zuordnung aus dem Nachrichtendetail; technische Inhaltsprüfung bleibt separat.
      </span>
    </p>
    <ReceivePanel
      :session="session"
      :detail="detail"
      :destination-id="destination.trim()"
      :busy="busy"
      :key-revision="keyRevision"
      :receive-revision="receiveRevision"
      @busy="(value) => emit('busy', value)"
      @activity="(value) => emit('activity', value)"
      @fatal="(value) => emit('fatal', value)"
      @event-log="openEventLog"
      @receive-start="emit('receive-start')"
      @verified="(value) => (verified = value)"
      @outcome="recordReceipt"
    />
    <section v-if="receiptHistory.length" class="tool-section" aria-labelledby="receipt-history-title">
      <h2 id="receipt-history-title">Empfangsaktionen</h2>
      <p class="small-note">
        Die letzten 20 Ergebnisse dieser Anwendungssitzung. Bekannte Kennungen bleiben auch bei einem
        ungewissen Ausgang verfügbar.
      </p>
      <div class="client-table support-table">
        <table class="receipt-history-table">
          <thead>
            <tr>
              <th scope="col">API / Aktion</th>
              <th scope="col">Ergebnis</th>
              <th scope="col">Einreichung / Vorgang</th>
              <th scope="col">Aktion</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in receiptHistory" :key="item.attemptId">
              <td data-label="API / Aktion">
                {{ item.apiVersion }} · {{ item.action === 'accept' ? 'Annehmen' : 'Ablehnen' }}
              </td>
              <td data-label="Ergebnis">
                {{
                  item.status === 'confirmed'
                    ? 'Bestätigt'
                    : item.status === 'uncertain'
                      ? 'Ausgang ungewiss'
                      : 'Nicht abgeschlossen'
                }}
              </td>
              <td data-label="Einreichung / Vorgang">
                <code>{{ item.submissionId }}</code>
                <br />
                <code>{{ item.caseId }}</code>
              </td>
              <td data-label="Aktion">
                <button
                  class="button secondary"
                  type="button"
                  :disabled="busy || pending"
                  @click="openEventLog(item)"
                >
                  Event Log prüfen
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
