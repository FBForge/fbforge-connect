<script setup>
import { ref } from 'vue';
import SaveTestCase from './send/SaveTestCase.vue';
import TestCaseLibrary from './send/TestCaseLibrary.vue';
import SendConfirmation from './send/SendConfirmation.vue';
import ReplyAttachmentsStep from './send/ReplyAttachmentsStep.vue';
import DataStep from './send/DataStep.vue';
import AddressingStep from './send/AddressingStep.vue';
import CopyValue from './CopyValue.vue';
import DocumentationLink from './DocumentationLink.vue';
import ExampleDraftDialog from './ExampleDraftDialog.vue';
import { useSubmissionSender } from './send/useSubmissionSender.js';
const props = defineProps({
  session: Object,
  busy: Boolean,
  processDraft: Object,
  testDraft: Object,
  defaultSource: String,
  visible: { type: Boolean, default: true },
});
const emit = defineEmits(['busy', 'activity', 'fatal', 'event-log', 'cases']);
const controller = useSubmissionSender(props, emit);
const testLibrary = ref(null);
const {
  storageWarning,
  target,
  attachments,
  outcome,
  working,
  error,
  nextDialog,
  keepData,
  keepAttachments,
  draftRevision,
  progress,
  history,
  packDialog,
  pendingTest,
  sendStep,
  stepNotice,
  sendForm,
  prepareButton,
  sendSections,
  revealInvalid,
  selectStep,
  exampleDialog,
  schemaContext,
  recipient,
  applyProcessDraft,
  disabled,
  confirmedSession,
  explain,
  diagnosticLabels,
  prepare,
  createTestPack,
  importTestCase,
  nextTest,
  refreshState,
} = controller;
</script>

<template>
  <section class="tool-section" aria-labelledby="send-title">
    <ExampleDraftDialog ref="exampleDialog" :context-key="schemaContext" />
    <h2 id="send-title">Neue Einreichung</h2>
    <p>In drei Schritten zum Testversand. Sie prüfen die Angaben vor dem Senden.</p>
    <div v-if="pendingTest" class="tool-section">
      <h3>Testfall bereit: {{ pendingTest.name }}</h3>
      <p>
        Wählen Sie zuerst eine Empfänger-Destination. Beim Übernehmen werden deren Angebot geprüft und
        Fachdaten, Anlagen und Antwortangebot im Entwurf ersetzt. Die Case ID wird geleert.
      </p>
      <div class="client-actions">
        <button
          type="button"
          class="button secondary"
          :disabled="disabled || !target.trim()"
          @click="packDialog.showModal()"
        >
          Testfall übernehmen
        </button>
        <button type="button" class="button secondary" :disabled="disabled" @click="pendingTest = null">
          Testfall verwerfen
        </button>
      </div>
    </div>
    <div
      v-if="processDraft && processDraft.sessionId === session?.sessionId && session?.apiVersion === 'v3'"
      class="tool-section"
    >
      <p>
        BPMN-Auswahl:
        <strong>{{ processDraft.processModelId }} · {{ processDraft.messageId }}</strong>
      </p>
      <button type="button" class="button secondary" :disabled="disabled" @click="applyProcessDraft">
        Prozessauswahl übernehmen und Empfänger erneut prüfen
      </button>
    </div>
    <TestCaseLibrary
      v-if="session"
      :disabled="disabled"
      ref="testLibrary"
      :create-pack="createTestPack"
      @choose="
        (item) => {
          pendingTest = item;
          if (target.trim()) packDialog.showModal();
          else selectStep(0);
        }
      "
      @busy="emit('busy', $event)"
    />
    <form
      v-if="session"
      :key="draftRevision"
      ref="sendForm"
      class="send-form"
      @submit.prevent="prepare"
      @invalid.capture="revealInvalid"
    >
      <div class="send-sections" role="group" aria-label="Versandabschnitte">
        <button
          v-for="(title, index) in sendSections"
          :key="title"
          type="button"
          :aria-pressed="sendStep === index"
          :aria-current="sendStep === index ? 'step' : undefined"
          :disabled="disabled"
          @click="selectStep(index)"
        >
          <span aria-hidden="true">{{ index + 1 }}</span>
          {{ title }}
        </button>
      </div>
      <p v-if="stepNotice" role="alert" class="step-notice">{{ stepNotice }}</p>
      <AddressingStep
        :controller="controller"
        :session="session"
        :visible="visible"
        @activity="emit('activity', $event)"
        @fatal="emit('fatal', $event)"
      />
      <DataStep :controller="controller" :session="session" :visible="visible" />
      <ReplyAttachmentsStep :controller="controller" :session="session" :visible="visible" />
      <div class="client-actions send-step-actions">
        <button
          v-if="sendStep > 0"
          class="button secondary"
          type="button"
          :disabled="disabled"
          @click="selectStep(sendStep - 1)"
        >
          Zurück
        </button>
        <span>Abschnitt {{ sendStep + 1 }} von {{ sendSections.length }}</span>
        <button
          v-if="sendStep < 2"
          class="button"
          type="button"
          :disabled="disabled"
          @click="selectStep(sendStep + 1)"
        >
          Weiter: {{ sendSections[sendStep + 1] }}
        </button>
        <button v-else ref="prepareButton" class="button" type="submit" :disabled="disabled">
          Versand vorbereiten
        </button>
      </div>
    </form>
    <SaveTestCase
      v-if="session && sendStep === 2 && recipient"
      :disabled="disabled"
      :pending="testLibrary?.pending"
      :notice="testLibrary?.saveNotice"
      :error="testLibrary?.saveError"
      @save="(name, exportOnly) => testLibrary?.saveDraft(name, exportOnly)"
    />
    <p v-if="progress" role="status">{{ progress }}</p>
    <p v-if="storageWarning" role="status">{{ storageWarning }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <DocumentationLink v-if="error" topic="problems">Hilfe zum Versandproblem</DocumentationLink>
    <div v-if="outcome" role="status">
      <p>
        <span class="status-badge" :class="outcome.status === 'sent' ? 'ok' : 'error'">
          {{
            outcome.status === 'sent'
              ? 'An FIT-Connect übergeben'
              : outcome.status === 'uncertain'
                ? 'Versandausgang ungewiss'
                : 'Versand fehlgeschlagen'
          }}
        </span>
      </p>
      <p v-if="outcome.status === 'uncertain'">
        Bitte nicht erneut senden. Prüfen Sie zunächst die Einreichungen und das Event Log. Ein Teil der
        Übertragung kann bereits abgeschlossen sein.
      </p>
      <p v-if="outcome.error">{{ explain(outcome.error) }}</p>
      <details v-if="outcome.diagnostics?.length" :open="outcome.status !== 'sent'">
        <summary>Technische Versanddiagnose</summary>
        <p class="small-note">
          Nur für diese Sitzung. Ohne Zugangsdaten, Schlüssel und Einreichungsinhalte. HTTP – bedeutet: kein
          Status verfügbar oder lokaler Schritt.
        </p>
        <div class="client-table support-table">
          <table class="submission-result-table">
            <thead>
              <tr>
                <th scope="col">Schritt</th>
                <th scope="col">Methode</th>
                <th scope="col">HTTP</th>
                <th scope="col">Ergebnis / Problemtyp</th>
                <th scope="col">Dauer</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, index) in outcome.diagnostics" :key="index">
                <td>{{ diagnosticLabels[entry.step] }}</td>
                <td>{{ entry.method }}</td>
                <td>{{ entry.httpStatus ?? '–' }}</td>
                <td>
                  {{ entry.code === 'ok' ? 'Erfolgreich' : entry.code }}
                  <br v-if="entry.problemType" />
                  <code v-if="entry.problemType">{{ entry.problemType }}</code>
                </td>
                <td>{{ entry.durationMs }} ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <p v-if="outcome.submissionId">
        Submission ID:
        <CopyValue :value="outcome.submissionId" label="Submission ID" />
        <br />
        Case ID:
        <CopyValue :value="outcome.caseId" label="Case ID" />
      </p>
      <button
        v-if="session && confirmedSession?.sessionId === session.sessionId"
        class="button secondary"
        type="button"
        :disabled="busy"
        @click="refreshState"
      >
        Lokalen Versandstatus laden
      </button>
    </div>
    <div v-if="outcome?.status === 'sent'" class="client-actions next-actions">
      <button
        type="button"
        class="button"
        :disabled="disabled"
        @click="
          keepData = true;
          keepAttachments = false;
          nextDialog.showModal();
        "
      >
        Nächsten Test vorbereiten
      </button>
      <button type="button" class="button secondary" :disabled="busy || working" @click="emit('cases')">
        Vorgänge öffnen
      </button>
    </div>
    <details v-if="history.length">
      <summary>Letzte Versandversuche ({{ history.length }})</summary>
      <ul class="send-history-list">
        <li v-for="item in history" :key="item.attemptId">
          <span>
            {{ item.api }} ·
            {{
              { sent: 'An FIT-Connect übergeben', failed: 'Fehlgeschlagen', uncertain: 'Ausgang ungewiss' }[
                item.status
              ] || item.status
            }}
            <br />
            <code>{{ item.submissionId || item.destinationId }}</code>
          </span>
          <button
            v-if="item.submissionId && item.caseId"
            class="button secondary"
            type="button"
            :disabled="busy || working"
            @click="
              emit('event-log', {
                apiVersion: item.api,
                sessionId: item.sessionId,
                destinationId: item.destinationId,
                caseId: item.caseId,
                submissionId: item.submissionId,
              })
            "
          >
            Event Log prüfen
          </button>
        </li>
      </ul>
    </details>
    <dialog
      ref="packDialog"
      class="tool-dialog"
      aria-labelledby="import-test-title"
      @cancel.prevent="!working && packDialog.close()"
    >
      <template v-if="pendingTest">
        <h2 id="import-test-title">Testfall als neuen Entwurf übernehmen?</h2>
        <p>{{ pendingTest.name }} · {{ pendingTest.request.attachments.length }} Anlagen</p>
        <p>
          Ihre bisherigen Fachdaten, Anlagen und das Antwortangebot werden ersetzt. Die Empfänger- und
          Absender-Destination bleiben erhalten. Es wird nichts versendet.
        </p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="client-actions">
          <button
            type="button"
            class="button secondary"
            :disabled="working"
            autofocus
            @click="packDialog.close()"
          >
            Abbrechen
          </button>
          <button type="button" class="button" :disabled="disabled" @click="importTestCase">
            Entwurf ersetzen
          </button>
        </div>
      </template>
    </dialog>
    <dialog ref="nextDialog" class="tool-dialog" aria-labelledby="next-test-title">
      <h2 id="next-test-title">Nächsten Test vorbereiten?</h2>
      <p>
        Der bisherige Versand bleibt unter „Vorgänge“ verfügbar. Wählen Sie, welche Inhalte Sie für einen
        neuen Entwurf übernehmen möchten.
      </p>
      <label class="checkbox-label">
        <input v-model="keepData" type="checkbox" />
        Fachdaten übernehmen
      </label>
      <label class="checkbox-label">
        <input v-model="keepAttachments" type="checkbox" />
        Anlagen übernehmen ({{ attachments.length }})
      </label>
      <p>
        Die Case ID wird geleert. Empfängerleistungen und Schema müssen erneut geladen werden. Es wird erst
        nach Ihrer erneuten Bestätigung gesendet.
      </p>
      <div class="client-actions">
        <button type="button" class="button secondary" autofocus @click="nextDialog.close()">
          Abbrechen
        </button>
        <button
          type="button"
          class="button"
          :disabled="disabled || outcome?.status !== 'sent'"
          @click="nextTest"
        >
          Neuen Entwurf beginnen
        </button>
      </div>
    </dialog>
    <SendConfirmation :controller="controller" :session="session" :visible="visible" />
  </section>
</template>
