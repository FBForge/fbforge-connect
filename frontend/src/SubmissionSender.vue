<script setup>
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import { invoke } from './native.js';
import { prepareSend, executeSend, cancelSend, sendState } from './sending.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
import { loadSendDestination, loadSendSchema } from './sender-options.js';
import { generateExample } from './generate-example.js';

const props = defineProps({ session: Object, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'event-log']);
const target = ref(''), source = ref(''), service = ref(''), serviceName = ref('Testantrag'), region = ref('DE000000000000');
const schema = ref(''), mime = ref('application/json'), caseId = ref(''), addressing = ref('service'), modelId = ref(''), messageId = ref('');
const offerReplies = ref(false), replySchema = ref(''), replyMime = ref('application/json');
const dataText = ref('{\n  "vorname": "Erika",\n  "nachname": "Musterfrau"\n}');
const dataFile = shallowRef(null), attachments = ref([]), prepared = ref(null), outcome = ref(null), working = ref(false), error = ref('');
const dialog = ref(null), progress = ref(''), history = ref([]);
const sendStep = ref(0), stepNotice = ref('');
const sendSections = ['Adressierung', 'Fachdaten', 'Anlagen & Antwortkanal'];
let invalidTarget;
function revealInvalid(event) {
  event.preventDefault();
  if (invalidTarget) return;
  invalidTarget = event.target;
  sendStep.value = Number(event.target.closest('fieldset')?.dataset.sendStep || 0);
  stepNotice.value = 'Bitte vervollständige die markierten Pflichtfelder in diesem Abschnitt.';
  nextTick(() => { invalidTarget?.focus(); invalidTarget = null; });
}
function selectStep(index) { sendStep.value = index; stepNotice.value = ''; }

const recipient = ref(null), schemaChoice = ref(0), processChoice = ref(0), exampleNotice = ref('');
const selectedService = computed(() => recipient.value?.services.find(item => item.identifier === service.value));
const selectedProcess = computed(() => recipient.value?.processes[processChoice.value]);
const schemaOptions = computed(() => addressing.value === 'process' ? selectedProcess.value?.schemas || [] : selectedService.value?.schemas || []);
const replyOptions = computed(() => selectedService.value?.replySchemas || []);
watch([target, () => props.session?.sessionId], () => { recipient.value = null; service.value = ''; schema.value = ''; exampleNotice.value = ''; });
watch(selectedService, value => {
  serviceName.value = value?.name || '';
  region.value = value?.regions[0] || 'DE000000000000';
  offerReplies.value = false; replySchema.value = value?.replySchemas[0]?.schemaUri || '';
  replyMime.value = value?.replySchemas[0]?.mimeType || 'application/json';
});
watch(selectedProcess, value => { modelId.value = value?.processModelId || ''; messageId.value = value?.messageId || ''; });
watch(schemaOptions, () => { schemaChoice.value = 0; selectSchema(); });
watch(schemaChoice, selectSchema);
function selectSchema() {
  const value = schemaOptions.value[schemaChoice.value];
  schema.value = value?.schemaUri || ''; mime.value = value?.mimeType || 'application/json'; exampleNotice.value = '';
}
async function loadRecipient() {
  if (disabled.value) return;
  const active = { ...props.session }, destination = target.value.trim().toLowerCase();
  recipient.value = null;
  await act('Empfängerleistungen laden', async () => {
    const value = await loadSendDestination(invoke, active, destination);
    if (active.sessionId !== props.session?.sessionId || destination !== target.value.trim().toLowerCase()) return;
    recipient.value = value; service.value = value.services[0]?.identifier || ''; processChoice.value = 0;
  });
}
async function createExample() {
  if (disabled.value || !schema.value) return;
  if (!window.confirm('Das gewählte Schema und seine Referenzen dürfen aus öffentlichen HTTPS-Quellen einschließlich XRepository geladen werden. Die Quellen sehen deine IP-Adresse. Zugangsdaten und Fachdaten werden nicht mitgesendet. Fortfahren?')) return;
  const active = { ...props.session }, destination = target.value.trim().toLowerCase(), uri = schema.value, format = mime.value;
  await act('Fiktive Fachdaten erzeugen', async () => {
    const document = await loadSendSchema(invoke, active, destination, { serviceIdentifier: service.value, schemaUri: uri,
      processModelId: addressing.value === 'process' ? modelId.value : '', messageId: addressing.value === 'process' ? messageId.value : '', allowExternalSchemas: true });
    const example = await generateExample(document, format, uri);
    if (active.sessionId !== props.session?.sessionId || destination !== target.value.trim().toLowerCase() || uri !== schema.value || format !== mime.value) return;
    dataFile.value = null; dataText.value = example;
    exampleNotice.value = 'Fiktive Beispieldaten wurden aus dem gewählten Schema erzeugt. Bitte fachlich prüfen. Der Entwurf ist noch kein Nachweis einer erfolgreichen Schemaprüfung.';
  });
}

const locked = computed(() => outcome.value?.status === 'uncertain' || outcome.value?.error === 'content_cleanup_failed');
const disabled = computed(() => props.busy || working.value || !props.session || locked.value || Boolean(prepared.value));
let confirmedSession;
const messages = {
  invalid_submission: 'Bitte Adressierung, Fachdaten, Schema und Anlagen prüfen. Höchstens 32 MiB je Datei und 64 MiB insgesamt.',
  data_format_invalid: 'Die Fachdaten passen nicht zum ausgewählten Format. Für ein XML-Schema wird wohlgeformtes XML benötigt, für ein JSON-Schema gültiges JSON. Nach einer fehlgeschlagenen Beispielerzeugung bleibt der bisherige Inhalt erhalten.',
  invalid_input: 'Bitte die Zustellpunkt- und Vorgangskennungen sowie die übrigen Eingaben prüfen.',
  test_certificate_required: 'Der Empfängerschlüssel benötigt ein gültiges selbstsigniertes TEST-Zertifikat. Es wurde nichts angekündigt.',
  resource_denied: 'Die TEST-Zugangsdaten erlauben diese Aktion oder diesen Absenderzustellpunkt nicht.',
  resource_unavailable: 'Die TEST-Aktion konnte nicht vollständig abgeschlossen werden.',
  invalid_resource: 'Die TEST-Antwort ist unvollständig oder widersprüchlich.',
  send_locked: 'Dieser Versandversuch kann nicht erneut ausgeführt werden. Bitte seinen Status prüfen.',
  confirmation_expired: 'Die Bestätigung ist abgelaufen. Bitte den Versand erneut vorbereiten.',
  schema_consent_required: 'Bitte das Laden externer Schemaquellen vor der Erzeugung bestätigen.',
  schema_unavailable: 'Das angebotene Schema konnte nicht von einer öffentlichen HTTPS-Adresse geladen werden. Die bisherigen Fachdaten bleiben erhalten.',
  schema_tls_error: 'Die TLS-Verbindung zur Schemaquelle ist fehlgeschlagen. Das Schema wurde nicht geladen.',
  schema_network_error: 'Die Schemaquelle konnte nicht erreicht oder vollständig gelesen werden (DNS, Verbindung oder Zeitlimit).',
  schema_http_error: 'Die Schemaquelle hat den Abruf mit einem HTTP-Fehler abgewiesen.',
  schema_archive_invalid: 'Das SDK konnte das XRepository-Archiv nicht als verwendbares Schema-Paket auflösen.',
  example_unavailable: 'Für dieses Schema konnte kein vollständiger Beispielentwurf erzeugt werden. Bitte Fachdaten manuell einfügen. Die bisherigen Fachdaten bleiben erhalten.',
  content_cleanup_failed: 'Lokale Inhalte konnten nicht vollständig verworfen werden. Bitte die Sitzung abmelden.',
};
const explain = cause => {
  const code = typeof cause === 'string' ? cause : cause?.message;
  return Object.hasOwn(messages, code) ? messages[code] : errorMessage(cause);
};
const diagnosticLabels = { source_access: 'Absenderberechtigung', recipient_key: 'Empfängerschlüssel', limits: 'Übertragungsgrenzen',
  destination: 'Zustellpunkt laden', credentials: 'Zugriff prüfen', announce: 'Einreichung ankündigen', attachment: 'Anlage übertragen',
  finalize: 'Einreichung abschließen', sdk: 'SDK-Verarbeitung' };

watch(() => props.session?.sessionId, (next, previous) => {
  if (next === previous) return;
  prepared.value = null; dialog.value?.close(); source.value = '';
  if (props.session?.apiVersion !== 'v3') addressing.value = 'service';
  if (next) { outcome.value = null; error.value = ''; }
});
function addFiles(event) {
  if (disabled.value) return;
  for (const file of event.dataTransfer?.files || event.target.files || []) attachments.value.push({ id: crypto.randomUUID(), file, description: '', mimeType: file.type || 'application/octet-stream' });
  if (event.target.type === 'file') event.target.value = '';
}
async function act(action, operation) {
  if (working.value || props.busy) return;
  working.value = true; emit('busy', true); error.value = '';
  const started = performance.now(), active = props.session ? { ...props.session } : confirmedSession;
  let status = 'Erfolgreich';
  try { await operation(); if (outcome.value?.status === 'uncertain') status = 'Ausgang ungewiss'; else if (outcome.value?.status === 'failed') status = 'Fehlgeschlagen'; }
  catch (cause) { status = 'Fehlgeschlagen'; error.value = explain(cause); if (resetsSessions(cause)) emit('fatal'); }
  finally {
    working.value = false; emit('busy', false); progress.value = '';
    emit('activity', { api: active?.apiVersion, role: active?.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren', action, status, started });
  }
}
async function prepare() {
  if (disabled.value) return;
  await act('Versand lokal vorbereiten', async () => {
    if (!recipient.value || !schema.value || (addressing.value !== 'process' && !selectedService.value)) throw new Error('invalid_submission');
    confirmedSession = { ...props.session };
    const draft = { destinationId: target.value.trim().toLowerCase(), fromDestinationId: props.session.apiVersion === 'v3' ? source.value.trim().toLowerCase() : null,
      serviceIdentifier: service.value.trim(), serviceName: serviceName.value.trim(), region: region.value.trim() || null,
      schemaUri: schema.value.trim(), mimeType: mime.value, caseId: caseId.value.trim().toLowerCase() || null,
      processMessage: props.session.apiVersion === 'v3' && addressing.value === 'process' ? { processModelId: modelId.value.trim(), messageId: messageId.value.trim() } : null,
      replyOffer: offerReplies.value ? { schemaUri: replySchema.value.trim(), mimeType: replyMime.value } : null };
    prepared.value = await prepareSend(invoke, confirmedSession, draft, dataFile.value || new Blob([dataText.value]), attachments.value,
      { onProgress: item => { progress.value = `${(item.receivedBytes / 1024).toFixed(0)} / ${(item.totalBytes / 1024).toFixed(0)} KiB lokal übertragen`; } });
    outcome.value = null;
  });
  if (prepared.value) { await nextTick(); dialog.value.showModal(); }
}
async function dismiss() {
  if (!prepared.value || working.value) return;
  await act('Versandvorbereitung verwerfen', async () => {
    await cancelSend(invoke, confirmedSession, prepared.value.attempt.attemptId);
    prepared.value = null; dialog.value.close();
  });
}
async function send() {
  if (!prepared.value || working.value) return;
  await act('Einreichung an TEST senden', async () => {
    const result = await executeSend(invoke, confirmedSession, prepared.value.attempt);
    outcome.value = result;
    history.value = [{ ...result, api: confirmedSession.apiVersion, sessionId: confirmedSession.sessionId,
      destinationId: prepared.value.summary.destinationId }, ...history.value].slice(0, 20);
    prepared.value = null; dialog.value.close();
    if (resetsSessions(result.error)) emit('fatal');
  });
}
async function refreshState() {
  await act('Versandstatus lokal prüfen', async () => { outcome.value = await sendState(invoke, confirmedSession); });
}
</script>

<template>
  <section class="tool-section" aria-labelledby="send-title">
    <h2 id="send-title">Einreichung senden</h2>
    <p>Fachdaten und Anlagen werden lokal vorbereitet. Das Java-SDK verschlüsselt sie für den Empfänger und überträgt sie nach deiner Bestätigung an TEST.</p>
    <p v-if="!session">Bitte zuerst eine TEST-Sitzung öffnen.</p>
    <form class="send-form" @submit.prevent="prepare" @invalid.capture="revealInvalid">
      <div class="send-sections" role="group" aria-label="Versandabschnitte"><button v-for="(title, index) in sendSections" :key="title" type="button" :aria-pressed="sendStep === index" @click="selectStep(index)"><span aria-hidden="true">{{ index + 1 }}</span>{{ title }}</button></div>
      <p v-if="stepNotice" role="alert" class="step-notice">{{ stepNotice }}</p>
      <fieldset v-show="sendStep === 0" data-send-step="0" :disabled="disabled">
        <legend>Adressierung</legend>
        <div class="client-fields">
          <label v-if="session?.apiVersion === 'v3'" for="send-source">Absenderzustellpunkt<input id="send-source" type="text" v-model="source" required maxlength="36" placeholder="Zustellpunkt-ID deiner TEST-Zugangsdaten"><small>Der Absender kann innerhalb deiner Berechtigungen gewählt werden.</small></label>
          <label for="send-target">Empfängerzustellpunkt<input id="send-target" type="text" v-model="target" required maxlength="36" placeholder="Zustellpunkt-ID"><button class="button secondary" type="button" :disabled="!target.trim()" @click="loadRecipient">Leistungen laden</button></label>
          <label v-if="session?.apiVersion === 'v3'" for="send-address">Adressierungsart<select id="send-address" v-model="addressing"><option value="service">Verwaltungsleistung</option><option value="process">Prozessnachricht</option></select></label>
          <label for="send-case">Vorgangs-ID (optional)<input id="send-case" type="text" v-model="caseId" maxlength="36" placeholder="Leer lassen für einen neuen Vorgang"></label>
          <label v-if="recipient?.services.length || addressing !== 'process'" for="send-service">Verwaltungsleistung<select id="send-service" v-model="service" required :disabled="!recipient?.services.length"><option value="" disabled>Bitte zuerst Empfängerleistungen laden</option><option v-for="item in recipient?.services || []" :key="item.identifier" :value="item.identifier">{{ item.name }}</option></select><small v-if="service">{{ service }}</small></label>
          <label v-else for="send-service">Leistung des Vorgangs<input id="send-service" v-model="service" type="text" required maxlength="1024" placeholder="Leistungs-URN des Vorgangs"><small>Dieser Prozesszustellpunkt bietet keine eigenen Verwaltungsleistungen an.</small></label>
          <label for="send-service-name">Bezeichnung der Leistung<input id="send-service-name" type="text" v-model="serviceName" required maxlength="256"></label>
          <label for="send-region">Region / ARS<input id="send-region" type="text" v-model="region" maxlength="128"></label>
          <label v-if="session?.apiVersion === 'v3' && addressing === 'process'" for="send-process">Prozessnachricht<select id="send-process" v-model="processChoice" :disabled="!recipient?.processes.length"><option v-for="(item, index) in recipient?.processes || []" :key="index" :value="index">{{ item.messageId }} · {{ item.processModelId }}</option></select></label>
        </div>
        <p v-if="session?.apiVersion === 'v2'">API v2 bestimmt den Absender über die Zugangsdaten. Prozessadressierung steht mit API v3 zur Verfügung.</p>
      </fieldset>
      <fieldset v-show="sendStep === 1" data-send-step="1" :disabled="disabled">
        <legend>Fachdaten</legend>
        <div class="client-fields">
          <label for="send-schema">Fachdaten-Schema<select v-if="schemaOptions.length > 1" id="send-schema" v-model="schemaChoice"><option v-for="(item, index) in schemaOptions" :key="index" :value="index">{{ item.mimeType === 'application/json' ? 'JSON' : 'XML' }} · {{ item.schemaUri }}</option></select><output v-else id="send-schema">{{ schema ? `${mime === 'application/json' ? 'JSON' : 'XML'} · ${schema}` : 'Keine unterstützten Fachdaten-Schemata ausgewählt.' }}</output><small>Wird aus der gewählten Leistung beziehungsweise Prozessnachricht übernommen.</small></label>
          <label for="send-data-file">Datei auswählen (optional)<input id="send-data-file" type="file" accept=".json,.xml,application/json,application/xml,text/xml" @change="dataFile = $event.target.files[0] || null"><small>Ohne Datei wird der Inhalt aus dem Eingabefeld verwendet.</small></label>
        </div>
        <div class="client-actions"><button class="button secondary" type="button" :disabled="!schema" @click="createExample">Fiktive Beispieldaten erzeugen</button></div>
        <p v-if="exampleNotice" class="small-note" role="status">{{ exampleNotice }}</p>
        <label v-if="!dataFile" for="send-data">Inhalt<textarea id="send-data" v-model="dataText" rows="8" required spellcheck="false"></textarea></label>
        <p v-else>{{ dataFile.name }} · {{ (dataFile.size / 1024).toFixed(1) }} KiB <button class="button secondary" type="button" @click="dataFile = null">Eingabefeld verwenden</button></p>
      </fieldset>
      <fieldset v-show="sendStep === 2" data-send-step="2" :disabled="disabled">
        <legend>Antwortkanal</legend>
        <label class="checkbox-label"><input v-model="offerReplies" type="checkbox" :disabled="!replyOptions.length"> Antworten über FIT-Connect anbieten</label><p v-if="!replyOptions.length" class="small-note">Für die gewählte Leistung ist kein unterstütztes Antwortschema hinterlegt.</p>
        <div v-if="offerReplies" class="client-fields">
          <label for="send-reply-schema">Antwortschema<select id="send-reply-schema" v-model="replySchema" required><option v-for="item in replyOptions" :key="item.schemaUri" :value="item.schemaUri">{{ item.schemaUri }}</option></select></label>
          <label for="send-reply-mime">Antwortformat<select id="send-reply-mime" v-model="replyMime"><option value="application/json">JSON</option><option value="application/xml">XML</option></select></label>
        </div>
        <p v-if="offerReplies" class="small-note">Das SDK erzeugt einen eigenen temporären Antwortschlüssel. Er bleibt ausschließlich in dieser lokalen Sitzung verfügbar. Nach Abmelden oder Beenden können damit verschlüsselte Antworten nicht mehr entschlüsselt werden. Die Leistung muss den Antwortkanal unterstützen.</p>
      </fieldset>
      <fieldset v-show="sendStep === 2" data-send-step="2" :disabled="disabled">
        <legend>Anlagen</legend>
        <div class="file-drop-zone" @dragover.prevent @drop.prevent="addFiles"><label for="send-attachments">Eine oder mehrere Anlagen hier ablegen oder auswählen<input id="send-attachments" type="file" multiple @change="addFiles"></label></div>
        <div v-for="item in attachments" :key="item.id" class="client-fields">
          <div><strong>{{ item.file.name }}</strong><p>{{ (item.file.size / 1024).toFixed(1) }} KiB · {{ item.mimeType }}</p></div>
          <label :for="`description-${item.id}`">Beschreibung<input :id="`description-${item.id}`" type="text" v-model="item.description" maxlength="1000"></label>
          <button class="button secondary" type="button" @click="attachments = attachments.filter(row => row.id !== item.id)">Anlage entfernen</button>
        </div>
        <p v-if="!attachments.length">Keine zusätzlichen Anlagen ausgewählt.</p>
        <p>Höchstens 32 MiB je Datei, 64 MiB insgesamt und 39 zusätzliche Anlagen. Die Grenzen des Zustellpunkts werden zusätzlich vom SDK geprüft.</p>
      </fieldset>
      <div class="client-actions send-step-actions"><button v-if="sendStep > 0" class="button secondary" type="button" @click="selectStep(sendStep - 1)">Zurück</button><span>Abschnitt {{ sendStep + 1 }} von {{ sendSections.length }}</span><button v-if="sendStep < 2" class="button" type="button" @click="selectStep(sendStep + 1)">Weiter: {{ sendSections[sendStep + 1] }}</button><button v-else class="button" type="submit" :disabled="disabled">Versand vorbereiten</button></div>
    </form>
    <p v-if="progress" role="status">{{ progress }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="outcome" role="status">
      <p><span class="status-badge" :class="outcome.status === 'sent' ? 'ok' : 'error'">{{ outcome.status === 'sent' ? 'An TEST übergeben' : outcome.status === 'uncertain' ? 'Versandausgang ungewiss' : 'Versand fehlgeschlagen' }}</span></p>
      <p v-if="outcome.status === 'uncertain'">Bitte nicht erneut senden. Prüfe zunächst die Einreichungen und das Event Log. Ein Teil der Übertragung kann bereits abgeschlossen sein.</p>
      <p v-if="outcome.error">{{ explain(outcome.error) }}</p>
      <details v-if="outcome.diagnostics?.length" :open="outcome.status !== 'sent'">
        <summary>Technische Versanddiagnose</summary>
        <p class="small-note">Nur für diese Sitzung. Ohne Zugangsdaten, Schlüssel und Einreichungsinhalte. HTTP – bedeutet: kein Status verfügbar oder lokaler Schritt.</p>
        <div class="client-table support-table"><table class="submission-result-table">
          <thead><tr><th scope="col">Schritt</th><th scope="col">Methode</th><th scope="col">HTTP</th><th scope="col">Ergebnis / Problemtyp</th><th scope="col">Dauer</th></tr></thead>
          <tbody><tr v-for="(entry, index) in outcome.diagnostics" :key="index">
            <td>{{ diagnosticLabels[entry.step] }}</td><td>{{ entry.method }}</td><td>{{ entry.httpStatus ?? '–' }}</td>
            <td>{{ entry.code === 'ok' ? 'Erfolgreich' : entry.code }}<br v-if="entry.problemType"><code v-if="entry.problemType">{{ entry.problemType }}</code></td><td>{{ entry.durationMs }} ms</td>
          </tr></tbody>
        </table></div>
      </details>
      <p v-if="outcome.submissionId">Einreichungs-ID: <code>{{ outcome.submissionId }}</code><br>Vorgangs-ID: <code>{{ outcome.caseId }}</code></p>
      <button v-if="session && confirmedSession?.sessionId === session.sessionId" class="button secondary" type="button" :disabled="busy" @click="refreshState">Lokalen Versandstatus laden</button>
    </div>
    <details v-if="history.length" open><summary>Letzte Versandversuche ({{ history.length }})</summary><ul class="send-history-list"><li v-for="item in history" :key="item.attemptId"><span>{{ item.api }} · {{ ({ sent: 'An TEST übergeben', failed: 'Fehlgeschlagen', uncertain: 'Ausgang ungewiss' })[item.status] || item.status }}<br><code>{{ item.submissionId || item.destinationId }}</code></span>
      <button v-if="item.submissionId && item.caseId" class="button secondary" type="button" :disabled="busy || working"
        @click="emit('event-log', { apiVersion: item.api, sessionId: item.sessionId, destinationId: item.destinationId, caseId: item.caseId, submissionId: item.submissionId })">Event Log prüfen</button></li></ul></details>
    <dialog ref="dialog" class="tool-dialog receipt-dialog" aria-labelledby="send-confirm-title" @cancel.prevent="dismiss">
      <template v-if="prepared">
        <h2 id="send-confirm-title">Einreichung an TEST senden?</h2>
        <dl class="receipt-dialog-context">
          <dt>API</dt><dd>{{ confirmedSession.apiVersion }}</dd>
          <dt>Empfänger</dt><dd><code>{{ prepared.summary.destinationId }}</code></dd>
          <template v-if="prepared.summary.fromDestinationId"><dt>Absender</dt><dd><code>{{ prepared.summary.fromDestinationId }}</code></dd></template>
          <dt>Leistung</dt><dd>{{ prepared.summary.serviceName }}<br>{{ prepared.summary.serviceIdentifier }}</dd>
          <dt>Vorgang</dt><dd>{{ prepared.summary.caseId || 'Neuer Vorgang' }}</dd>
          <dt>Schema</dt><dd>{{ prepared.summary.schemaUri }}</dd>
          <dt>Fachdaten</dt><dd>{{ prepared.summary.mimeType }} · {{ prepared.summary.dataBytes }} Bytes</dd>
        </dl>
        <p v-if="prepared.summary.processMessage">Prozess: {{ prepared.summary.processMessage.processModelId }} · Nachricht: {{ prepared.summary.processMessage.messageId }}</p>
        <p v-if="prepared.summary.replyOffer">Antwortkanal: {{ prepared.summary.replyOffer.schemaUri }} · {{ prepared.summary.replyOffer.mimeType }}. Der private Antwortschlüssel geht beim Abmelden oder Beenden verloren.</p>
        <ul v-if="prepared.summary.attachments.length"><li v-for="(item, index) in prepared.summary.attachments" :key="index">{{ item.fileName }} · {{ item.bytes }} Bytes<span v-if="item.description"> · {{ item.description }}</span></li></ul>
        <p>Die Bestätigung gilt 60 Sekunden. Dieser Schritt überträgt die Einreichung an die FIT-Connect-Testumgebung.</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="client-actions">
          <button class="button secondary" type="button" :disabled="working" autofocus @click="dismiss">Abbrechen</button>
          <button class="button" type="button" :disabled="working" @click="send">{{ working ? 'Wird an TEST übertragen …' : 'Jetzt an TEST senden' }}</button>
        </div>
      </template>
    </dialog>
  </section>
</template>
