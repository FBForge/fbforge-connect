<script setup>
import { inject, ref, computed, watch, nextTick } from 'vue';
import ReceivePanel from './ReceivePanel.vue';
import { invoke } from './native.js';
import { caseWorkspaceKey } from './case-context.js';
const caseWorkspace = inject(caseWorkspaceKey, null);
import { listReplies, listReplyChannels } from './replies.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';

const props = defineProps({ session: Object, busy: Boolean, keyRevision: Number, receiveRevision: Number });
const emit = defineEmits(['busy', 'activity', 'fatal', 'receive-start', 'event-log']);
const detail = ref(null),
  replyId = ref(''),
  caseId = ref('');
const page = ref(null),
  channels = ref(null),
  error = ref(''),
  pending = ref(false),
  heading = ref(null),
  selectedHeading = ref(null);
const disabled = computed(() => props.busy || pending.value || !props.session);
const context = computed(() => `${props.session?.apiVersion || ''}/${props.session?.sessionId || ''}`);
let generation = 0;
watch(
  context,
  () => {
    generation++;
    page.value = null;
    channels.value = null;
    detail.value = null;
    replyId.value = '';
    caseId.value = '';
    error.value = '';
  },
  { flush: 'sync' },
);
const messages = {
  resource_denied: 'Diese TEST-Zugangsdaten dürfen die verfügbaren Antworten nicht abrufen.',
  invalid_resource: 'Die TEST-Antwort ist unvollständig oder enthält widersprüchliche Reply-Kennungen.',
  resource_unavailable: 'Die verfügbaren Antworten konnten nicht geladen werden.',
};
function open(
  item = { replyId: replyId.value.trim().toLowerCase(), caseId: caseId.value.trim().toLowerCase() },
) {
  if (disabled.value) return;
  const uuid = (value) =>
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
  if (!uuid(item.replyId) || !uuid(item.caseId)) {
    error.value = 'Bitte gültige Reply- und Vorgangs-IDs eingeben.';
    return;
  }
  caseWorkspace?.remember(props.session, item);
  detail.value = { replyId: item.replyId, caseId: item.caseId };
  replyId.value = item.replyId;
  caseId.value = item.caseId;
  error.value = '';
  const stamp = generation;
  void nextTick(() => {
    if (stamp === generation) selectedHeading.value?.focus();
  });
}
async function load(offset = 0) {
  if (disabled.value) return;
  const active = { ...props.session },
    stamp = generation,
    started = performance.now();
  page.value = null;
  error.value = '';
  pending.value = true;
  emit('busy', true);
  let status = 'Erfolgreich';
  try {
    const result = await listReplies(invoke, active, offset);
    if (stamp !== generation) {
      status = 'Abgebrochen';
      return;
    }
    page.value = result;
    for (const item of result.replies) caseWorkspace?.remember(active, item);
    await nextTick();
    if (stamp === generation) heading.value?.focus();
  } catch (cause) {
    status = 'Fehlgeschlagen';
    const code = typeof cause === 'string' ? cause : cause?.message;
    if (stamp === generation) error.value = messages[code] || errorMessage(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    emit('busy', false);
    emit('activity', {
      api: active.apiVersion,
      role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action: 'Verfügbare Antworten laden',
      status,
      started,
    });
  }
}
async function loadChannels() {
  if (disabled.value) return;
  const active = { ...props.session },
    stamp = generation,
    started = performance.now();
  channels.value = null;
  error.value = '';
  pending.value = true;
  emit('busy', true);
  let status = 'Erfolgreich';
  try {
    const result = await listReplyChannels(invoke, active);
    if (stamp === generation) {
      channels.value = result;
      for (const item of result) if (item.status === 'bound') caseWorkspace?.remember(active, item);
    } else status = 'Abgebrochen';
  } catch (cause) {
    status = 'Fehlgeschlagen';
    if (stamp === generation) error.value = errorMessage(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    emit('busy', false);
    emit('activity', {
      api: active.apiVersion,
      role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action: 'Lokale Antwortkanäle laden',
      status,
      started,
    });
  }
}
</script>

<template>
  <div class="submission-workspace">
    <section class="tool-section" aria-labelledby="reply-search-title">
      <h2 id="reply-search-title">Antworten (Replies)</h2>
      <p>
        Antworten auf versendete Einreichungen abrufen, mit dem zugehörigen Antwortschlüssel entschlüsseln und
        prüfen.
      </p>
      <p class="small-note">
        Zum Entschlüsseln muss der passende Antwortkanal in dieser Sitzung vorhanden sein. Mit einem
        gespeicherten Profil können dessen Schlüssel nach einem Neustart wiederhergestellt werden. Ohne
        Speicherung gehen sie beim Abmelden oder Beenden verloren.
      </p>
      <p v-if="!session">Bitte zuerst eine TEST-Sitzung öffnen.</p>
      <form @submit.prevent="open()">
        <div class="client-fields">
          <label for="reply-lookup-case">
            Vorgangs-ID
            <input id="reply-lookup-case" v-model="caseId" type="text" maxlength="36" :disabled="disabled" />
          </label>
          <label for="reply-lookup-id">
            Reply-ID
            <input id="reply-lookup-id" v-model="replyId" type="text" maxlength="36" :disabled="disabled" />
          </label>
        </div>
        <div class="client-actions">
          <button
            class="button secondary"
            type="submit"
            :disabled="disabled || !caseId.trim() || !replyId.trim()"
          >
            Antwort direkt öffnen
          </button>
        </div>
      </form>
      <div class="client-actions">
        <button class="button" type="button" :disabled="disabled" @click="load()">Antworten laden</button>
        <button class="button secondary" type="button" :disabled="disabled" @click="loadChannels">
          Lokale Antwortkanäle anzeigen
        </button>
      </div>
      <p v-if="pending" role="status">Antwortübersicht wird geladen …</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="page">
        <h3 ref="heading" tabindex="-1">{{ page.totalCount }} verfügbare Antworten</h3>
        <p v-if="!page.replies.length">Keine Antworten zur Abholung vorhanden.</p>
        <div v-else class="client-table support-table">
          <table class="receipt-history-table">
            <thead>
              <tr>
                <th scope="col">Reply-ID</th>
                <th scope="col">Vorgangs-ID</th>
                <th scope="col">Aktion</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in page.replies" :key="item.replyId">
                <td data-label="Reply-ID">
                  <code>{{ item.replyId }}</code>
                </td>
                <td data-label="Vorgangs-ID">
                  <code>{{ item.caseId }}</code>
                </td>
                <td data-label="Aktion">
                  <button class="button secondary" type="button" :disabled="disabled" @click="open(item)">
                    Öffnen
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="page.replies.length" class="small-note">
          Diese Übersicht enthält Kennungen aus der API. Die Inhalte der Antworten wurden noch nicht geprüft.
        </p>
        <div class="client-actions">
          <button
            class="button secondary"
            type="button"
            :disabled="disabled || page.offset === 0"
            @click="load(page.offset - 20)"
          >
            Vorherige Seite
          </button>
          <button
            class="button secondary"
            type="button"
            :disabled="
              disabled || page.offset + page.replies.length >= page.totalCount || page.offset >= 10000
            "
            @click="load(page.offset + 20)"
          >
            Nächste Seite
          </button>
          <button class="button secondary" type="button" :disabled="disabled" @click="load(page.offset)">
            Neu laden
          </button>
        </div>
      </template>
      <section v-if="channels" aria-labelledby="reply-channels-title">
        <h3 id="reply-channels-title">Antwortkanäle dieser Sitzung ({{ channels.length }})</h3>
        <p class="small-note">
          Private Antwortschlüssel bleiben im nativen Kern. Bei aktiviertem Profil werden sie zusätzlich
          geschützt gespeichert; ohne Profil gelten sie nur für die Sitzung. Diese Übersicht zeigt nur
          öffentliche Kennungen.
        </p>
        <p v-if="!channels.length">In dieser Sitzung wurde noch kein Antwortkanal beim Versand angelegt.</p>
        <ul v-else class="send-history-list">
          <li v-for="item in channels" :key="item.attemptId">
            <div>
              <strong>
                {{
                  {
                    bound: 'Dem Vorgang zugeordnet',
                    unresolved: 'Versandausgang ungeklärt',
                    recovered: 'Vorgang aus geprüfter Antwort zugeordnet',
                    pending: 'Versand läuft',
                  }[item.status]
                }}
              </strong>
              <p>
                Empfänger:
                <code>{{ item.destinationId }}</code>
              </p>
              <p v-if="item.caseId">
                Vorgang:
                <code>{{ item.caseId }}</code>
                <br />
                <template v-if="item.submissionId">
                  Einreichung:
                  <code>{{ item.submissionId }}</code>
                </template>
                <span v-else>
                  Die ursprüngliche Einreichungs-ID ist nach dem unterbrochenen Versand nicht bekannt. Der
                  Vorgang wurde über eine vollständig geprüfte Antwort zugeordnet.
                </span>
              </p>
              <button
                v-if="item.caseId"
                type="button"
                class="button secondary"
                :disabled="disabled"
                @click="
                  emit('event-log', {
                    apiVersion: session.apiVersion,
                    sessionId: session.sessionId,
                    caseId: item.caseId,
                  })
                "
              >
                Gesamten Vorgang prüfen
              </button>
              <p v-else>
                Versuch:
                <code>{{ item.attemptId }}</code>
                . Noch keine bestätigte Vorgangszuordnung. Nach einem unterbrochenen Versand kann eine
                verfügbare Antwort über ihre Case- und Reply-ID geöffnet werden. Erst nach erfolgreicher
                Entschlüsselung und Signatur-/Hashprüfung wird ihr Vorgang diesem Schlüssel zugeordnet.
              </p>
            </div>
          </li>
        </ul>
      </section>
    </section>
    <section v-if="detail" class="tool-section" aria-labelledby="reply-current-title">
      <h2 id="reply-current-title" ref="selectedHeading" tabindex="-1">Ausgewählte Antwort</h2>
      <button
        class="button secondary"
        type="button"
        :disabled="disabled"
        @click="
          emit('event-log', {
            apiVersion: session.apiVersion,
            sessionId: session.sessionId,
            caseId: detail.caseId,
            replyId: detail.replyId,
          })
        "
      >
        Event Log der Antwort prüfen
      </button>
      <dl class="send-summary">
        <div>
          <dt>Reply-ID</dt>
          <dd>
            <code>{{ detail.replyId }}</code>
          </dd>
        </div>
        <div>
          <dt>Vorgangs-ID</dt>
          <dd>
            <code>{{ detail.caseId }}</code>
          </dd>
        </div>
      </dl>
    </section>
    <ReceivePanel
      :session="session"
      :detail="detail"
      reply
      :busy="busy || pending"
      :key-revision="keyRevision"
      :receive-revision="receiveRevision"
      @busy="(value) => emit('busy', value)"
      @activity="(value) => emit('activity', value)"
      @fatal="(value) => emit('fatal', value)"
      @receive-start="emit('receive-start')"
      @event-log="(value) => emit('event-log', value)"
    />
  </div>
</template>
