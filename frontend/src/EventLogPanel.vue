<script setup>
import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from './native.js';
import { loadEventLog, loadReplyEventLog, loadCaseEventLog, listEventLog, readEventDocument, discardEventLog } from './event-log.js';
import { errorMessage, diagnosticCode } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
import ContentPreview from './ContentPreview.vue';

const props = defineProps({ session: Object, busy: Boolean, target: Object, visible: Boolean, knownTargets: Array });
const emit = defineEmits(['busy', 'activity', 'fatal']);
const diagnostic = ref('');
const recent = computed(() => (props.knownTargets || []).filter(item => item.sessionId === props.session?.sessionId && item.apiVersion === props.session?.apiVersion));
const mode = ref('case'), replyId = ref('');
const destination = ref(''), caseId = ref(''), submission = ref('');
const result = shallowRef(null), events = shallowRef([]), preview = shallowRef(null);
const pending = ref(false), error = ref(''), query = ref(''), page = ref(0), heading = ref(null);
const context = computed(() => `${props.session?.apiVersion || ''}/${props.session?.sessionId || ''}`);
const disabled = computed(() => props.busy || pending.value || !props.session);
const filtered = computed(() => {
  const term = query.value.trim().toLowerCase();
  return events.value.filter(event => !term || [name(event), event.eventType, event.eventId, event.issuer, event.issuedAt, event.subjectId || '', event.subjectType || ''].some(value => value.toLowerCase().includes(term)));
});
const shown = computed(() => filtered.value.slice(page.value * 20, page.value * 20 + 20));
let generation = 0, owner, controller, alive = true;
const messages = {
  verification_failed: 'Der Event Log konnte nicht vollständig verifiziert werden. Es wird kein Prüfergebnis übernommen.',
  invalid_resource: 'Die Antwort ist unvollständig oder das lokale Ergebnis nicht mehr verfügbar. Bitte den Event Log erneut laden.',
  resource_missing: 'Für diese Kennungen ist kein abrufbarer Event Log vorhanden.',
  resource_denied: 'Diese TEST-Zugangsdaten dürfen den angefragten Event Log nicht lesen.',
  resource_unavailable: 'Der Event Log konnte nicht geladen werden. Nach einem lokalen Bereinigungsfehler bitte abmelden und eine neue Sitzung öffnen.',
  content_limit: 'Der Event Log überschreitet die zulässige Größe oder Anzahl von Ereignissen.',
  invalid_input: 'Bitte die angezeigten Kennungen prüfen. Jede ID hat die Form 12345678-1234-1234-1234-123456789abc.',
};
function useTarget(target) {
  mode.value = target.replyId ? 'reply' : target.submissionId ? 'submission' : 'case';
  caseId.value = target.caseId; destination.value = target.destinationId || ''; submission.value = target.submissionId || ''; replyId.value = target.replyId || '';
}
function completeKnownContext() {
  const type = mode.value, id = type === 'reply' ? replyId.value.trim().toLowerCase() : submission.value.trim().toLowerCase();
  if (type === 'case') return;
  const known = recent.value.find(item => item.subjectType === type && item.subjectId === id);
  if (known) { caseId.value = known.caseId; if (type === 'submission') destination.value = known.destinationId; }
}
function name(event) {
  const type = event.eventType.split('/').at(-1);
  return ({ 'create-submission': 'Einreichung angelegt', 'submit-submission': 'Einreichung übermittelt',
    'accept-submission': 'Einreichung angenommen', 'reject-submission': 'Einreichung abgelehnt',
    'polling-notify-submission': 'Zur Abholung bereitgestellt', 'notify-submission': 'Empfänger benachrichtigt',
    'delete-submission': 'Einreichung gelöscht', 'create-reply': 'Antwort angelegt', 'submit-reply': 'Antwort übermittelt', 'notify-reply': 'Antwort zur Abholung bereit', 'accept-reply': 'Antwort angenommen', 'reject-reply': 'Antwort abgelehnt', 'delete-reply': 'Antwort gelöscht' })[type] || type;
}
const time = value => new Date(value).toLocaleString('de-DE');
async function changePage(value) { page.value = value; await nextTick(); heading.value?.focus(); }
async function release(active, id) {
  try { await discardEventLog(invoke, active, id); }
  catch (cause) { if (resetsSessions(cause) && alive) emit('fatal', cause); }
}
function reset() {
  generation++; controller?.abort(); controller = null; preview.value = null;
  const previous = result.value, active = owner;
  result.value = null; owner = null; events.value = []; query.value = ''; page.value = 0;
  return previous && active ? release(active, previous.logId) : Promise.resolve();
}
watch(context, () => { error.value = ''; diagnostic.value = ''; void reset(); }, { flush: 'sync' });
watch([mode, destination, caseId, submission, replyId], () => { error.value = ''; diagnostic.value = ''; void reset(); }, { flush: 'sync' });
watch(query, () => { page.value = 0; });
watch(() => props.visible, visible => { if (!visible) void reset(); });
watch(() => props.target, async target => {
  if (!target) return;
  mode.value = target.replyId ? 'reply' : target.submissionId ? 'submission' : 'case'; replyId.value = target.replyId || '';
  destination.value = target.destinationId || ''; caseId.value = target.caseId; submission.value = target.submissionId || '';
  await nextTick();
  if (props.visible && target.apiVersion === props.session?.apiVersion && !disabled.value) void load();
}, { immediate: true });
onBeforeUnmount(() => { alive = false; void reset(); });

async function run(action, operation) {
  if (disabled.value) return;
  const active = { ...props.session }, stamp = generation, started = performance.now();
  const current = () => alive && stamp === generation;
  pending.value = true; error.value = ''; diagnostic.value = ''; emit('busy', true);
  let status = 'Erfolgreich';
  try { await operation(active, current); if (!current()) status = 'Abgebrochen'; }
  catch (cause) {
    const code = typeof cause === 'string' ? cause : cause?.message;
    status = code === 'content_cancelled' ? 'Abgebrochen' : 'Fehlgeschlagen';
    if (current() && code !== 'content_cancelled') {
      error.value = messages[code] || errorMessage(cause); diagnostic.value = diagnosticCode(cause);
    }
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    controller = null; pending.value = false; emit('busy', false);
    emit('activity', { api: active.apiVersion, role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren', action, status, started });
  }
}
function load() {
  if (disabled.value) return;
  const reply = mode.value === 'reply', replyValue = replyId.value.trim().toLowerCase();
  const cleanup = reset(), ids = [destination.value.trim().toLowerCase(), caseId.value.trim().toLowerCase(), submission.value.trim().toLowerCase()];
  return run('Event Log prüfen', async (active, current) => {
    await cleanup;
    let loaded;
    try {
      loaded = mode.value === 'case' ? await loadCaseEventLog(invoke, active, ids[1]) : reply ? await loadReplyEventLog(invoke, active, ids[1], replyValue) : await loadEventLog(invoke, active, ...ids);
      const rows = [], seen = new Set(); let bytes = 0;
      for (let offset = 0; offset < loaded.total; offset += 5) {
        if (!current()) return;
        const batch = await listEventLog(invoke, active, loaded, offset);
        for (const event of batch.events) {
          bytes += event.headerBytes + event.claimsBytes;
          if (seen.has(event.eventId) || bytes > 16 * 1024 * 1024) throw new Error('engine_protocol_error');
          seen.add(event.eventId); rows.push(event);
        }
      }
      if (!current()) return;
      owner = active; result.value = loaded;
      events.value = rows.sort((left, right) => Date.parse(left.issuedAt) - Date.parse(right.issuedAt)); loaded = null;
      await nextTick(); if (current()) heading.value?.focus();
    } finally { if (loaded) await release(active, loaded.logId); }
  });
}
function show(event, part, trigger) {
  if (!result.value) return;
  const log = result.value;
  return run('Ereignisdaten anzeigen', async (active, current) => {
    const cancellation = new AbortController(); controller = cancellation;
    const rawText = await readEventDocument(invoke, active, log.logId, event, part, { signal: cancellation.signal });
    if (current()) preview.value = { kind: 'text', json: true, rawText,
      filename: `${name(event)} · ${part === 'header' ? 'JWS-Header' : 'Ereignisdaten'}`,
      notice: 'Originale dekodierte JSON-Daten des verifizierten Ereignisses.', footer: 'Inhalte und Verweise werden nicht ausgeführt.', trigger };
  });
}
async function closePreview() {
  const trigger = preview.value?.trigger; preview.value = null;
  await nextTick(); trigger?.focus();
}
</script>

<template>
  <section class="tool-section" aria-labelledby="event-log-title">
    <h2 id="event-log-title">Event Log prüfen</h2>
    <p>Den Verlauf eines Vorgangs, einer Einreichung oder einer Antwort aus TEST abrufen und technisch prüfen. Funktioniert ohne private Schlüssel und unabhängig von der Verfügbarkeit der Inhalte.</p>
    <p v-if="!session">Bitte zuerst eine TEST-Sitzung öffnen.</p>
    <details v-if="recent.length"><summary>Bekannte Nachrichten dieser Sitzung ({{ recent.length }})</summary><ul class="send-history-list"><li v-for="item in recent.slice(0, 10)" :key="`${item.subjectType}/${item.subjectId}`"><span>{{ item.subjectType === 'reply' ? 'Antwort' : 'Einreichung' }}: <code>{{ item.subjectId }}</code></span><div class="client-actions"><button type="button" class="button secondary" :disabled="disabled" @click="useTarget(item)">Kennungen übernehmen</button><button type="button" class="button secondary" :disabled="disabled" @click="useTarget({ caseId: item.caseId })">Gesamten Vorgang auswählen</button></div></li></ul></details>
    <form @submit.prevent="load">
      <div class="client-fields">
        <label for="event-kind">Ereignisse für<select id="event-kind" v-model="mode" :disabled="disabled"><option value="case">Gesamter Vorgang (Case)</option><option value="submission">Einreichung</option><option value="reply">Antwort (Reply)</option></select></label>
        <label v-if="mode === 'submission'" for="event-destination">Zustellpunkt-ID<input id="event-destination" v-model="destination" type="text" maxlength="36" required :disabled="disabled"></label>
        <label for="event-case">Vorgangs-ID<input id="event-case" v-model="caseId" type="text" maxlength="36" required :disabled="disabled"></label>
        <label v-if="mode === 'submission'" for="event-submission">Einreichungs-ID<input id="event-submission" v-model="submission" @change="completeKnownContext" type="text" maxlength="36" required :disabled="disabled"></label>
      <label v-else-if="mode === 'reply'" for="event-reply">Reply-ID<input id="event-reply" v-model="replyId" @change="completeKnownContext" type="text" maxlength="36" required :disabled="disabled"></label>
      </div>
      <p class="small-note">Die Vorgangs-ID (Case ID) findest du nach dem Versand oder bei einer empfangenen Nachricht. „Gesamter Vorgang“ zeigt alle Ereignisse, die deine Zugangsdaten lesen dürfen. Die Kennungen werden beim Öffnen aus einer Nachricht automatisch übernommen.</p>
      <div class="client-actions"><button class="button" type="submit" :disabled="disabled || !caseId.trim() || (mode === 'reply' ? !replyId.trim() : mode === 'submission' && (!destination.trim() || !submission.trim()))">{{ result ? 'Erneut prüfen' : 'Event Log prüfen' }}</button>
        <button v-if="result" class="button secondary" type="button" :disabled="disabled" @click="reset">Ergebnis verwerfen</button></div>
    </form>
    <p v-if="pending" role="status">Event Log wird verarbeitet …</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="error && diagnostic" class="small-note">Diagnose: {{ session?.apiVersion }} · <code>{{ diagnostic }}</code>. Diesen Code kannst du im Fehlerbericht angeben.</p>
    <template v-if="result">
      <div class="tool-section-heading"><h3 ref="heading" tabindex="-1">{{ result.total }} geprüfte Ereignisse</h3><span class="status-badge ok">Event Log verifiziert</span></div>
      <p class="small-note">Signaturen, Ereignisschema und Zuordnung zu Vorgang und {{ result.scope === 'case' ? 'den enthaltenen Nachrichten' : result.replyId ? 'Antwort' : 'Einreichung' }} geprüft. Inhalts-Authentifizierungstags wurden nicht abgeglichen.</p>
      <label for="event-search" class="event-log-search">Ereignisse durchsuchen<input id="event-search" v-model="query" type="search" placeholder="Ereignis, ID, Aussteller oder Zeitpunkt" :disabled="pending"></label>
      <p aria-live="polite">{{ filtered.length }} von {{ result.total }} Ereignissen</p>
      <p v-if="!result.total">Für diesen Vorgang sind derzeit keine lesbaren Ereignisse vorhanden.</p>
      <ol class="event-log-list" :start="page * 20 + 1">
        <li v-for="event in shown" :key="event.eventId" class="event-log-entry">
          <div class="event-log-entry-heading"><strong>{{ name(event) }}</strong><time :datetime="event.issuedAt">{{ time(event.issuedAt) }}</time></div>
          <p v-if="event.subjectId" class="small-note">{{ ({ submission: 'Einreichung', reply: 'Antwort', case: 'Vorgang' })[event.subjectType] }}: <code>{{ event.subjectId }}</code></p>
          <p class="small-note">Aussteller: <code>{{ event.issuer }}</code></p>
          <div class="client-actions"><button class="button secondary" type="button" :disabled="disabled" @click="show(event, 'claims', $event.currentTarget)">Ereignisdaten</button>
            <button class="button secondary" type="button" :disabled="disabled" @click="show(event, 'header', $event.currentTarget)">JWS-Header</button>
            <details><summary>Technische Kennungen</summary><dl><dt>Ereignis-ID</dt><dd><code>{{ event.eventId }}</code></dd><dt>Ereignistyp</dt><dd><code>{{ event.eventType }}</code></dd></dl></details></div>
        </li>
      </ol>
      <div v-if="filtered.length > 20" class="client-actions"><button class="button secondary" type="button" :disabled="disabled || page === 0" @click="changePage(page - 1)">Vorherige Seite</button>
        <span>Seite {{ page + 1 }} von {{ Math.ceil(filtered.length / 20) }}</span><button class="button secondary" type="button" :disabled="disabled || (page + 1) * 20 >= filtered.length" @click="changePage(page + 1)">Nächste Seite</button></div>
    </template>
    <ContentPreview v-if="preview" :preview="preview" @close="closePreview" />
  </section>
</template>
