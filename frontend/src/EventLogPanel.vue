<script setup>
import EventDetails from './events/EventDetails.vue';
import CopyValue from './CopyValue.vue';

import ContentPreview from './ContentPreview.vue';
import { useEventLogPanel } from './events/useEventLogPanel.js';
const props = defineProps({
  session: Object,
  busy: Boolean,
  target: Object,
  visible: Boolean,
  knownTargets: Array,
});
const emit = defineEmits(['busy', 'activity', 'fatal']);
const controller = useEventLogPanel(props, emit);
const {
  diagnostic,
  eventDetails,
  recent,
  mode,
  replyId,
  destination,
  caseId,
  submission,
  result,
  preview,
  pending,
  error,
  query,
  page,
  heading,
  disabled,
  filtered,
  shown,
  useTarget,
  completeKnownContext,
  name,
  time,
  changePage,
  reset,
  load,
  show,
  closePreview,
} = controller;
</script>

<template>
  <section class="tool-section" aria-labelledby="event-log-title">
    <h2 id="event-log-title">Event Log prüfen</h2>
    <p>
      Den Verlauf eines Vorgangs, einer Einreichung oder einer Antwort aus FIT-Connect abrufen und technisch
      prüfen. Funktioniert ohne private Schlüssel und unabhängig von der Verfügbarkeit der Inhalte.
    </p>
    <p v-if="!session">Bitte zuerst eine Sitzung öffnen.</p>
    <details v-if="recent.length">
      <summary>Bekannte Nachrichten dieser Sitzung ({{ recent.length }})</summary>
      <ul class="send-history-list">
        <li v-for="item in recent.slice(0, 10)" :key="`${item.subjectType}/${item.subjectId}`">
          <span>
            {{ item.subjectType === 'reply' ? 'Antwort' : 'Einreichung' }}:
            <CopyValue
              :value="item.subjectId"
              :label="item.subjectType === 'reply' ? 'Reply ID' : 'Submission ID'"
            />
          </span>
          <div class="client-actions">
            <button type="button" class="button secondary" :disabled="disabled" @click="useTarget(item)">
              Kennungen übernehmen
            </button>
            <button
              type="button"
              class="button secondary"
              :disabled="disabled"
              @click="useTarget({ caseId: item.caseId })"
            >
              Gesamten Vorgang auswählen
            </button>
          </div>
        </li>
      </ul>
    </details>
    <form @submit.prevent="load">
      <div class="client-fields">
        <label for="event-kind">
          Ereignisse für
          <select id="event-kind" v-model="mode" :disabled="disabled">
            <option value="case">Gesamter Vorgang (Case)</option>
            <option value="submission">Einreichung</option>
            <option value="reply">Antwort (Reply)</option>
          </select>
        </label>
        <label v-if="mode === 'submission'" for="event-destination">
          Destination ID
          <input
            id="event-destination"
            v-model="destination"
            type="text"
            maxlength="36"
            required
            :disabled="disabled"
          />
        </label>
        <label for="event-case">
          Case ID
          <input id="event-case" v-model="caseId" type="text" maxlength="36" required :disabled="disabled" />
        </label>
        <label v-if="mode === 'submission'" for="event-submission">
          Submission ID
          <input
            id="event-submission"
            v-model="submission"
            @change="completeKnownContext"
            type="text"
            maxlength="36"
            required
            :disabled="disabled"
          />
        </label>
        <label v-else-if="mode === 'reply'" for="event-reply">
          Reply ID
          <input
            id="event-reply"
            v-model="replyId"
            @change="completeKnownContext"
            type="text"
            maxlength="36"
            required
            :disabled="disabled"
          />
        </label>
      </div>
      <p class="small-note">
        Die Case ID finden Sie nach dem Versand oder bei einer empfangenen Nachricht. „Gesamter Vorgang“ zeigt
        alle Ereignisse, die Ihre Zugangsdaten lesen dürfen. Die Kennungen werden beim Öffnen aus einer
        Nachricht automatisch übernommen.
      </p>
      <div class="client-actions">
        <button
          class="button"
          type="submit"
          :disabled="
            disabled ||
            !caseId.trim() ||
            (mode === 'reply'
              ? !replyId.trim()
              : mode === 'submission' && (!destination.trim() || !submission.trim()))
          "
        >
          {{ result ? 'Erneut prüfen' : 'Event Log prüfen' }}
        </button>
        <button v-if="result" class="button secondary" type="button" :disabled="disabled" @click="reset">
          Ergebnis verwerfen
        </button>
      </div>
    </form>
    <p v-if="pending" role="status">Event Log wird verarbeitet …</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="error && diagnostic" class="small-note">
      Diagnose: {{ session?.apiVersion }} ·
      <code>{{ diagnostic }}</code>
      . Diesen Code können Sie im Fehlerbericht angeben.
    </p>
    <template v-if="result">
      <div class="tool-section-heading">
        <h3 ref="heading" tabindex="-1">{{ result.total }} geprüfte Ereignisse</h3>
        <span class="status-badge ok">Event Log verifiziert</span>
      </div>
      <p class="small-note">
        Signaturen, Ereignisschema und Zuordnung zu Vorgang und
        {{
          result.scope === 'case' ? 'den enthaltenen Nachrichten' : result.replyId ? 'Antwort' : 'Einreichung'
        }}
        geprüft. Inhalts-Authentifizierungstags wurden nicht abgeglichen.
      </p>
      <label for="event-search" class="event-log-search">
        Ereignisse durchsuchen
        <input
          id="event-search"
          v-model="query"
          type="search"
          placeholder="Ereignis, ID, Aussteller oder Zeitpunkt"
          :disabled="pending"
        />
      </label>
      <p aria-live="polite">{{ filtered.length }} von {{ result.total }} Ereignissen</p>
      <p v-if="!result.total">Für diesen Vorgang sind derzeit keine lesbaren Ereignisse vorhanden.</p>
      <ol class="event-log-list" :start="page * 20 + 1">
        <li v-for="event in shown" :key="event.eventId" class="event-log-entry">
          <div class="event-log-entry-heading">
            <strong>{{ name(event) }}</strong>
            <time :datetime="event.issuedAt">{{ time(event.issuedAt) }}</time>
          </div>
          <p v-if="event.subjectId" class="small-note">
            {{ { submission: 'Einreichung', reply: 'Antwort', case: 'Vorgang' }[event.subjectType] }}:
            <code>{{ event.subjectId }}</code>
          </p>
          <p class="small-note">
            Aussteller:
            <code>{{ event.issuer }}</code>
          </p>
          <EventDetails :details="eventDetails[event.eventId]" :pending="pending" />
          <div class="client-actions">
            <button
              class="button secondary"
              type="button"
              :disabled="disabled"
              @click="show(event, 'claims', $event.currentTarget)"
            >
              Ereignisdaten
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="disabled"
              @click="show(event, 'header', $event.currentTarget)"
            >
              JWS-Header
            </button>
            <details>
              <summary>Technische Kennungen</summary>
              <dl>
                <dt>Ereignis-ID</dt>
                <dd>
                  <code>{{ event.eventId }}</code>
                </dd>
                <dt>Ereignistyp</dt>
                <dd>
                  <code>{{ event.eventType }}</code>
                </dd>
              </dl>
            </details>
          </div>
        </li>
      </ol>
      <div v-if="filtered.length > 20" class="client-actions">
        <button
          class="button secondary"
          type="button"
          :disabled="disabled || page === 0"
          @click="changePage(page - 1)"
        >
          Vorherige Seite
        </button>
        <span>Seite {{ page + 1 }} von {{ Math.ceil(filtered.length / 20) }}</span>
        <button
          class="button secondary"
          type="button"
          :disabled="disabled || (page + 1) * 20 >= filtered.length"
          @click="changePage(page + 1)"
        >
          Nächste Seite
        </button>
      </div>
    </template>
    <ContentPreview v-if="preview" :preview="preview" @close="closePreview" />
  </section>
</template>
