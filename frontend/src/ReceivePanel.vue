<script setup>
import { inject, ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { processWorkspaceKey } from './process-context.js';
const processWorkspace = inject(processWorkspaceKey, null);
import { invoke } from './native.js';
import {
  verifySubmission,
  verifyReply,
  listReceivedContents,
  readReceivedFile,
  discardReceived,
} from './receiving.js';
import { uploadContent, discardContent } from './content.js';
import { createPreview, disposePreview, canPreview } from './submission-preview.js';
import { errorMessage, diagnosticCode } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
import SchemaSourceConsent from './SchemaSourceConsent.vue';
import { useSchemaSourceAccess, withSchemaSourceAccess } from './schema-source-access.js';
import FileDropInput from './FileDropInput.vue';
import DocumentationLink from './DocumentationLink.vue';
import ActionNotice from './ActionNotice.vue';
import ContentPreview from './ContentPreview.vue';
import DiscardReplyDialog from './DiscardReplyDialog.vue';
import ReceiptPanel from './ReceiptPanel.vue';
import ReplyReceiptPanel from './ReplyReceiptPanel.vue';
import ReplySender from './ReplySender.vue';
import DocumentLayout from './DocumentLayout.vue';
import AttachmentList from './AttachmentList.vue';
import StructuredData from './StructuredData.vue';
import { readReceivedSchema } from './received-schema.js';
import { STRUCTURED_BYTES, structuredFormat } from './structured-data.js';

const replySender = ref(null),
  receiptPanel = ref(null),
  discardReplyDialog = ref(null);
const preparation = ref(null),
  replySection = ref(null),
  receiptSection = ref(null);
const props = defineProps({
  session: Object,
  detail: Object,
  destinationId: String,
  busy: Boolean,
  keyRevision: Number,
  receiveRevision: Number,
  reply: Boolean,
  autoOpen: Number,
});
const emit = defineEmits([
  'busy',
  'activity',
  'fatal',
  'verified',
  'outcome',
  'receive-start',
  'event-log',
  'setup',
]);
const allowExternalSchemas = useSchemaSourceAccess(() => props.session);
const schemaAccess = ref(null);
const diagnostic = ref('');
const errorNotice = ref(null);
const schemaSettings = ref(null);
const applicationSchema = ref(null);
const application = ref(null),
  applicationNotice = ref(''),
  applicationHeading = ref(null);
const attachments = computed(() => parts.value.filter((part) => part.kind === 'attachment'));
const schemaChecked = computed(
  () =>
    Boolean(proof.value) &&
    ['application/json', 'application/xml'].includes(
      parts.value.find((part) => part.kind === 'data')?.mimeType,
    ) &&
    !proof.value.warnings.includes('XML_SCHEMA_NOT_CHECKED'),
);
const proof = ref(null),
  parts = ref([]),
  schemas = ref([]),
  preview = ref(null),
  error = ref('');
const pending = ref(false),
  action = ref('');
const receiptOutcome = ref(null);
const receiptUncertain = computed(
  () =>
    receiptOutcome.value?.status === 'uncertain' &&
    receiptOutcome.value.sessionId === props.session?.sessionId &&
    receiptOutcome.value.apiVersion === props.session?.apiVersion,
);
const completed = computed(
  () =>
    !props.reply &&
    receiptOutcome.value?.status === 'confirmed' &&
    receiptOutcome.value.sessionId === props.session?.sessionId &&
    receiptOutcome.value.submissionId === props.detail?.submissionId,
);
const controller = shallowRef(null);
const disabled = computed(() => props.busy || pending.value || !props.session || !props.detail);
const context = computed(
  () => `${props.session?.apiVersion || ''}/${props.session?.sessionId || ''}/${props.destinationId || ''}`,
);
const panelId = computed(() => (props.reply ? 'reply-receive' : 'receive'));
const subject = computed(() => (props.reply ? 'Antwort' : 'Einreichung'));
const errorTitle = computed(
  () =>
    ({
      schema_consent_required: 'Freigabe für Schemaquellen erforderlich',
      schema_unavailable: 'Schema nicht verfügbar',
      key_missing: 'Testschlüssel fehlt',
      key_rejected: 'Testschlüssel passt nicht',
      test_certificate_required: 'Testzertifikat fehlt',
      resource_denied: 'Zugriffsberechtigung fehlt',
      data_schema_invalid: 'Fachdaten passen nicht zum Schema',
    })[diagnostic.value] || 'Inhalte konnten nicht geprüft werden',
);
watch(error, async (message) => {
  if (!message) return;
  await nextTick();
  errorNotice.value?.focus();
});
async function showSchemaSettings(local) {
  preparation.value.open = true;
  if (!local) {
    if (await schemaAccess.value.request()) verify();
    return;
  }
  if (local) schemaSettings.value.open = true;
  await nextTick();
  const target = document.getElementById(`${panelId.value}-${local ? 'schema-file' : 'schema-sources'}`);
  target?.focus();
  target?.scrollIntoView({ block: 'nearest' });
}
let generation = 0,
  proofSession,
  alive = true,
  downloadUrl,
  downloadTimer;
const messages = {
  key_missing:
    'Zum Öffnen fehlt der passende private Testschlüssel. Öffnen Sie die Empfangseinrichtung und laden Sie ihn dort.',
  key_rejected: props.reply
    ? 'Für diese Antwort ist in der Sitzung kein passender gebundener Antwortschlüssel verfügbar. Bitte dieselbe Sitzung verwenden, in der das Antwortangebot versendet wurde.'
    : 'Der geladene Schlüssel passt nicht mehr zu einer aktuellen TEST-Registrierung. Bitte Destination und Schlüssel erneut laden.',
  test_certificate_required:
    'Für diese Destination fehlt eine gültige Registrierung mit selbstsigniertem Testzertifikat.',
  verification_failed:
    'Die technische Prüfung der Einreichung ist fehlgeschlagen. Prüfen Sie Schlüssel, Event Log und Inhalte. Es liegt kein vollständiges Prüfergebnis vor.',
  schema_consent_required:
    'Das Schema benötigt eine öffentliche Quelle. Erlauben Sie den Abruf oder fügen Sie ein passendes lokales Schema hinzu.',
  schema_unavailable:
    'Die Schema-URI wurde aus den Metadaten gelesen. Das Schema oder eine seiner Referenzen konnte jedoch nicht vollständig geladen oder aufgelöst werden. Es liegt noch keine vollständige Inhaltsprüfung vor. Bei nicht öffentlich erreichbaren Schemata können Sie eine lokale Datei mit passender $id hinzufügen.',
  schema_tls_error:
    'Die Schemaquelle konnte nicht sicher erreicht werden. Prüfen Sie die Quelle oder fügen Sie eine passende lokale Schemadatei hinzu.',
  schema_network_error:
    'Die Schemaquelle ist nicht erreichbar. Prüfen Sie die Netzwerkverbindung oder fügen Sie eine passende lokale Schemadatei hinzu.',
  schema_http_error:
    'Die Schemaquelle hat kein verwendbares Schema geliefert. Prüfen Sie die Schema-URI oder fügen Sie eine passende lokale Schemadatei hinzu.',
  schema_archive_invalid:
    'Das geladene Schemapaket ist beschädigt oder überschreitet die zulässigen Grenzen. Prüfen Sie die Schemaquelle.',
  data_schema_invalid:
    'Die Fachdaten passen nicht zum angegebenen Schema. Prüfen Sie Daten und Schema, bevor Sie die Einreichung annehmen.',
  invalid_input:
    'Bitte eine UTF-8-JSON-Schemadatei mit eindeutiger absoluter $id und höchstens 2 MiB auswählen.',
  content_limit:
    'Die zulässige Größe wurde überschritten. Der Schema-Katalog darf insgesamt höchstens 16 MiB umfassen.',
  resource_unavailable:
    'Die Einreichung oder der lokale Speicher ist nicht verfügbar. Nach einem Bereinigungsfehler bitte abmelden und eine neue Sitzung öffnen.',
  resource_denied: 'Diese TEST-Zugangsdaten dürfen die angefragte Einreichung nicht abrufen.',
  resource_missing: 'Dieser Inhalt ist nicht mehr verfügbar. Bitte die Einreichung erneut prüfen.',
  invalid_resource:
    'Das Ergebnis ist nicht mehr verfügbar oder passt nicht zum aktuellen Inhalt. Bitte erneut prüfen.',
  content_cleanup_failed:
    'Lokale Dateien konnten nicht vollständig entfernt werden. Bitte die Sitzung schließen.',
};
function showError(cause) {
  diagnostic.value = diagnosticCode(cause);
  const message = Object.hasOwn(messages, diagnostic.value)
    ? messages[diagnostic.value]
    : errorMessage(cause);
  error.value = message.replaceAll('Einreichung', subject.value);
}
const warning = (stage) =>
  ({
    MALWARE_SCAN_NOT_CONFIGURED: 'Kein Malwarescanner eingerichtet.',
    XML_SCHEMA_NOT_CHECKED: 'XML-Syntax geprüft. Eine XSD-Prüfung wurde nicht durchgeführt.',
  })[stage] || `SDK-Prüfhinweis: ${stage}`;
const label = (part) =>
  part.kind === 'metadata' ? 'Metadaten' : part.kind === 'data' ? 'Fachdaten' : part.fileName || 'Anlage';
const bytesLabel = (value) =>
  value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KiB`
      : `${(value / 1024 / 1024).toFixed(1)} MiB`;
function closePreview() {
  disposePreview(preview.value);
  preview.value = null;
}
function clearDownload() {
  clearTimeout(downloadTimer);
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
}
async function release(operation) {
  try {
    await operation();
  } catch (cause) {
    const code = typeof cause === 'string' ? cause : cause?.message;
    if (!['session_missing', 'invalid_resource', 'resource_missing'].includes(code) && alive)
      error.value = messages.content_cleanup_failed;
    if (resetsSessions(cause) && alive) emit('fatal', cause);
  }
}
function resetProof() {
  generation++;
  controller.value?.abort();
  closePreview();
  clearDownload();
  const previous = proof.value,
    owner = proofSession,
    reply = props.reply;
  proof.value = null;
  proofSession = null;
  parts.value = [];
  application.value = null;
  applicationSchema.value = null;
  applicationNotice.value = '';
  emit('verified', false);
  return previous && owner
    ? release(() => discardReceived(invoke, owner, previous.proofId, reply))
    : Promise.resolve();
}
async function resetAll() {
  const files = schemas.value;
  schemas.value = [];
  await resetProof();
  for (const file of files) await release(() => discardContent(invoke, file.owner, file.contentId));
}
watch(
  context,
  () => {
    error.value = '';
    diagnostic.value = '';
    void resetAll();
  },
  { flush: 'sync' },
);
watch(
  [() => props.detail, () => props.keyRevision, () => props.receiveRevision],
  () => {
    error.value = '';
    diagnostic.value = '';
    void resetProof();
  },
  { flush: 'sync' },
);
watch(
  () => props.autoOpen,
  async (value) => {
    if (value && props.detail) {
      await nextTick();
      verify();
    }
  },
);
onBeforeUnmount(() => {
  alive = false;
  void resetAll();
});

let actionOpener;
async function run(name, operation) {
  if (disabled.value) return;
  const active = { ...props.session },
    stamp = generation,
    started = performance.now();
  const current = () => alive && stamp === generation;
  actionOpener = document.activeElement;
  pending.value = true;
  action.value = name;
  error.value = '';
  diagnostic.value = '';
  emit('busy', true);
  let status = 'Erfolgreich';
  try {
    await operation(active, current);
    if (!current()) status = 'Abgebrochen';
  } catch (cause) {
    const code = typeof cause === 'string' ? cause : cause?.message;
    status = code === 'content_cancelled' ? 'Abgebrochen' : 'Fehlgeschlagen';
    if (current() && code !== 'content_cancelled') {
      showError(cause);
    }
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    controller.value = null;
    pending.value = false;
    action.value = '';
    emit('busy', false);
    emit('activity', {
      api: active.apiVersion,
      role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action: name,
      status,
      started,
    });
  }
}
function verify() {
  if (disabled.value) return;
  const cleanup = resetProof(),
    detail = props.detail,
    reply = props.reply;
  emit('receive-start');
  run('Inhalte entschlüsseln und prüfen', async (active, current) => {
    await cleanup;
    const catalog = schemas.value.map(({ uri, contentId }) => ({ uri, contentId }));
    const result = await withSchemaSourceAccess(
      () =>
        reply
          ? verifyReply(invoke, active, detail.caseId, detail.replyId, catalog, allowExternalSchemas.value)
          : verifySubmission(
              invoke,
              active,
              detail.destinationId,
              detail.submissionId,
              catalog,
              allowExternalSchemas.value,
            ),
      () => schemaAccess.value.request(actionOpener),
      current,
    );
    try {
      const rows = [];
      for (let offset = 0; offset < result.partCount && current(); offset += 2)
        rows.push(...(await listReceivedContents(invoke, active, result, offset, reply)).parts);
      if (!current()) {
        await release(() => discardReceived(invoke, active, result.proofId, reply));
        return;
      }
      if (
        rows.length !== result.partCount ||
        new Set(rows.map((part) => part.contentId)).size !== rows.length ||
        new Set(rows.filter((part) => part.attachmentId).map((part) => part.attachmentId)).size !==
          rows.length - 2 ||
        rows.reduce((total, part) => total + part.totalBytes, 0) > 64 * 1024 * 1024
      )
        throw new Error('engine_protocol_error');
      let display = null,
        notice = '';
      const data = rows.find((part) => part.kind === 'data');
      const format =
        data && structuredFormat({ filename: data.fileName || '', mimeType: data.mimeType || '' });
      if (!format)
        notice =
          'Für dieses Fachdatenformat steht keine Formularansicht zur Verfügung. Die technischen Inhalte und Downloads bleiben verfügbar.';
      else if (data.totalBytes > STRUCTURED_BYTES)
        notice =
          'Die Fachdaten überschreiten die Formulargrenze von 256 KiB. Über die technischen Inhalte können Sie den Quelltext ansehen oder das Original herunterladen.';
      else {
        controller.value = new AbortController();
        let bytes;
        try {
          bytes = await readReceivedFile(invoke, active, result.proofId, data, {
            signal: controller.value.signal,
            reply,
          });
          try {
            display = { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), format };
          } catch {
            notice = 'Die Fachdaten sind kein gültiger UTF-8-Text. Der Originaldownload bleibt verfügbar.';
          }
        } finally {
          bytes?.fill(0);
        }
      }
      if (!current()) {
        await release(() => discardReceived(invoke, active, result.proofId, reply));
        return;
      }
      let schemaView = null;
      if (display) {
        controller.value ||= new AbortController();
        schemaView = await readReceivedSchema(invoke, active, result.proofId, {
          reply,
          signal: controller.value.signal,
        });
      }
      if (!current()) {
        await release(() => discardReceived(invoke, active, result.proofId, reply));
        return;
      }
      proofSession = active;
      proof.value = result;
      parts.value = rows;
      applicationSchema.value = schemaView;
      application.value = display;
      applicationNotice.value = notice;
      emit('verified', true);
      await nextTick();
      if (current()) {
        applicationHeading.value?.focus({ preventScroll: true });
        applicationHeading.value?.scrollIntoView({ block: 'start' });
      }
    } catch (cause) {
      await release(() => discardReceived(invoke, active, result.proofId, reply));
      throw cause;
    }
  });
}
function chooseSchema(files) {
  const file = files[0];
  if (!file || disabled.value) return;
  const cleanup = resetProof();
  run('Fachdaten-Schema laden', async (active, current) => {
    await cleanup;
    if (file.size > 2 * 1024 * 1024 || schemas.value.length >= 32) throw new Error('invalid_input');
    if (schemas.value.reduce((total, item) => total + item.bytes, file.size) > 16 * 1024 * 1024)
      throw new Error('content_limit');
    let uri = '';
    try {
      uri = JSON.parse(await file.text()).$id;
    } catch {
      throw new Error('invalid_input');
    }
    try {
      if (
        typeof uri !== 'string' ||
        uri.length > 4096 ||
        !new URL(uri).protocol ||
        schemas.value.some((item) => item.uri === uri)
      )
        throw new Error();
    } catch {
      throw new Error('invalid_input');
    }
    if (!current()) return;
    controller.value = new AbortController();
    const staged = await uploadContent(invoke, active, file, { signal: controller.value.signal });
    if (!current()) {
      await release(() => discardContent(invoke, active, staged.contentId));
      return;
    }
    schemas.value = [
      ...schemas.value,
      { uri, contentId: staged.contentId, filename: file.name, bytes: file.size, owner: active },
    ];
  });
}
function removeSchema(file) {
  if (disabled.value) return;
  const cleanup = resetProof();
  run('Fachdaten-Schema entfernen', async (active, current) => {
    await cleanup;
    await discardContent(invoke, file.owner, file.contentId);
    if (current()) schemas.value = schemas.value.filter((item) => item.contentId !== file.contentId);
  });
}
function inspect(part, download = false) {
  if (disabled.value || !proof.value) return;
  closePreview();
  const currentProof = proof.value;
  run(
    download ? 'Entschlüsselten Inhalt herunterladen' : 'Lokale Vorschau öffnen',
    async (active, current) => {
      controller.value = new AbortController();
      let bytes;
      try {
        if (!download && part.totalBytes > 8 * 1024 * 1024) {
          preview.value = {
            kind: 'unavailable',
            filename: label(part),
            notice: 'Diese Datei ist für die Vorschau zu groß. Der Download bleibt verfügbar.',
          };
          return;
        }
        bytes = await readReceivedFile(invoke, active, currentProof.proofId, part, {
          signal: controller.value.signal,
          reply: props.reply,
        });
        if (!current()) return;
        if (download) {
          clearDownload();
          downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = part.fileName || `Anlage-${part.attachmentId}.bin`;
          document.body.append(link);
          link.click();
          link.remove();
          downloadTimer = setTimeout(clearDownload, 30000);
        } else {
          const value = await createPreview(bytes, {
            filename: part.fileName || label(part),
            mimeType: part.mimeType || '',
          });
          if (!current() || controller.value.signal.aborted) {
            disposePreview(value);
            return;
          }
          preview.value = {
            ...value,
            isApplication: part.kind === 'data',
            json:
              value.kind === 'text' &&
              (/\.json$/i.test(part.fileName || '') || /json(?:;|$)/i.test(part.mimeType || '')),
          };
        }
      } catch (cause) {
        const code = typeof cause === 'string' ? cause : cause?.message;
        if (current() && code !== 'content_cancelled') {
          showError(cause);
          void resetProof();
        }
        throw cause;
      } finally {
        bytes?.fill(0);
      }
    },
  );
}
async function confirmLeave() {
  if (props.busy || pending.value) return false;
  if (!replySender.value?.hasDraft) return true;
  const discard = await discardReplyDialog.value.ask();
  if (discard) replySender.value?.discardDraft();
  return discard;
}
async function beginReply() {
  await replySender.value?.begin();
  await nextTick();
  replySection.value?.scrollIntoView({ block: 'start' });
}
async function beginReceipt(action) {
  if (receiptUncertain.value || !(await confirmLeave())) return;
  await receiptPanel.value?.begin(action);
  await nextTick();
  if (!document.querySelector('dialog[open]')) receiptSection.value?.scrollIntoView({ block: 'start' });
}
defineExpose({ confirmLeave });
</script>

<template>
  <div v-if="detail" class="receive-workspace">
    <DiscardReplyDialog ref="discardReplyDialog" />
    <section
      v-if="!completed"
      class="tool-section"
      :aria-labelledby="`${panelId}-title`"
      :aria-busy="pending"
    >
      <div class="tool-section-heading">
        <div>
          <h2 :id="`${panelId}-title`">{{ reply ? 'Antwortinhalte prüfen' : 'Inhalte prüfen' }}</h2>
          <p v-if="reply && !proof">
            Mit dem beim Versand erzeugten Antwortschlüssel lokal entschlüsseln. Er wird automatisch über
            Vorgang und Schlüssel-ID zugeordnet. Ein gespeichertes Profil kann den Schlüssel nach einem
            Neustart wiederherstellen.
          </p>
          <p v-else-if="!proof">
            Mit dem geladenen privaten Testschlüssel lokal entschlüsseln. Schlüssel bleiben für weitere
            passende Einreichungen in dieser Sitzung verfügbar.
          </p>
        </div>
      </div>
      <details ref="preparation" class="receive-preparation" :open="!proof">
        <summary>
          {{ proof ? 'Entschlüsselung und Schemaeinstellungen' : 'Entschlüsselung vorbereiten' }}
        </summary>
        <details ref="schemaSettings">
          <summary>Lokale Fachdaten-Schemata ({{ schemas.length }})</summary>
          <p>
            Zuerst entschlüsselt das SDK die Metadaten und liest daraus die Schema-URI. Öffentlich erreichbare
            HTTPS-Schemata werden nur mit aktivierter Freigabe ohne Zugangsdaten geladen. Optional können Sie
            eine lokale JSON-Schemadatei mit passender
            <code>$id</code>
            hinzufügen. Mit aktivierter Freigabe werden auch externe Referenzen und XRepository-XSDs
            kontrolliert geladen.
          </p>
          <div class="client-fields">
            <FileDropInput
              :id="`${panelId}-schema-file`"
              label="JSON-Schemadatei hinzufügen"
              accept=".json,application/json,application/schema+json"
              :disabled="disabled"
              @files="chooseSchema"
            >
              Maximal 2 MiB pro Datei, insgesamt 16 MiB. Vor dem Abruf öffentlicher HTTPS-Schemata fragt die
              Anwendung nach Ihrer Freigabe. Private Netzadressen werden nicht aufgerufen.
            </FileDropInput>
          </div>
          <ul v-if="schemas.length" class="receive-schema-list">
            <li v-for="file in schemas" :key="file.contentId">
              <div>
                <strong>{{ file.filename }}</strong>
                <br />
                <span>{{ file.uri }}</span>
              </div>
              <button class="button secondary" type="button" :disabled="disabled" @click="removeSchema(file)">
                Entfernen
              </button>
            </li>
          </ul>
        </details>
        <SchemaSourceConsent
          ref="schemaAccess"
          :id="`${panelId}-schema-sources`"
          v-model="allowExternalSchemas"
          :disabled="disabled"
          :context-key="`${context}/${detail?.submissionId || detail?.replyId || ''}`"
        />
        <div class="client-actions">
          <button class="button" type="button" :disabled="disabled" @click="verify">
            {{ proof ? 'Erneut entschlüsseln und prüfen' : 'Inhalte entschlüsseln und prüfen' }}
          </button>
          <button
            v-if="proof"
            class="button secondary"
            type="button"
            :disabled="disabled"
            @click="resetProof"
          >
            Prüfergebnis verwerfen
          </button>
          <button
            v-if="pending && controller"
            class="button secondary"
            type="button"
            @click="controller.abort()"
          >
            Übertragung abbrechen
          </button>
        </div>
      </details>
      <p v-if="pending" role="status">{{ action }} …</p>
      <ActionNotice
        v-if="error"
        ref="errorNotice"
        :title="errorTitle"
        :message="error"
        :tone="diagnostic === 'schema_consent_required' ? 'warning' : 'error'"
        :code="diagnostic"
        :api-version="session?.apiVersion"
      >
        <button
          v-if="!reply && ['key_missing', 'key_rejected', 'test_certificate_required'].includes(diagnostic)"
          type="button"
          class="button"
          :disabled="disabled"
          @click="emit('setup')"
        >
          Schlüssel einrichten
        </button>
        <button
          v-if="diagnostic === 'schema_consent_required'"
          type="button"
          class="button"
          :disabled="disabled"
          @click="showSchemaSettings(false)"
        >
          Zur Freigabe
        </button>
        <button
          v-if="diagnostic.startsWith('schema_') || diagnostic === 'data_schema_invalid'"
          type="button"
          class="button secondary"
          :disabled="disabled"
          @click="showSchemaSettings(true)"
        >
          Lokales Schema hinzufügen
        </button>
        <DocumentationLink :topic="reply ? 'replies' : 'problems'">Hilfe zu diesem Problem</DocumentationLink>
      </ActionNotice>
      <template v-if="proof">
        <div class="verification-stages" aria-label="Prüfstatus">
          <p><span class="status-badge ok">Entschlüsselung und Integrität geprüft</span></p>
          <p>
            <span class="status-badge" :class="schemaChecked ? 'ok' : 'info'">
              {{ schemaChecked ? 'Fachdaten-Schema geprüft' : 'Schemaprüfung nicht bestätigt' }}
            </span>
          </p>
          <p><span class="status-badge info">Fachliche Prüfung: manuell offen</span></p>
        </div>
        <ul v-if="proof.warnings.length">
          <li v-for="stage in proof.warnings" :key="stage">{{ warning(stage) }}</li>
        </ul>
        <details class="verification-explanation">
          <summary>Was wurde geprüft?</summary>
          <p class="small-note">
            Das SDK hat Ereignisse, Signaturen, Verschlüsselung und Inhalts-Hashes geprüft. Hinweise oben
            benennen verbleibende Prüfungen. Dies bestätigt noch keinen Empfang bei FIT-Connect.
          </p>
        </details>
        <p v-if="proof.processMessage">
          <strong>
            Prozessnachricht: {{ proof.processMessage.processModelId }} · {{ proof.processMessage.messageId }}
          </strong>
          <button
            type="button"
            class="button secondary"
            :disabled="disabled"
            @click="
              processWorkspace?.showContext({
                ...proof.processMessage,
                caseId: proof.caseId,
                apiVersion: session.apiVersion,
                sessionId: session.sessionId,
              })
            "
          >
            Geprüften Nachrichtenbezug im BPMN-Modell zeigen
          </button>
        </p>
        <DocumentLayout>
          <template #data>
            <section class="received-application" :aria-labelledby="`${panelId}-application-title`">
              <div class="tool-section-heading">
                <div>
                  <h3 :id="`${panelId}-application-title`" ref="applicationHeading" tabindex="-1">
                    {{ reply ? 'Antwort lesen' : 'Antrag lesen' }}
                  </h3>
                  <p>Fachdaten aus dem lokal entschlüsselten Inhalt</p>
                </div>
              </div>
              <StructuredData
                v-if="application"
                :text="application.text"
                :format="application.format"
                :schema-document="applicationSchema?.document"
                :schema-uri="applicationSchema?.schemaUri"
                :schema-status="applicationSchema?.status"
              />
              <p v-else class="small-note" role="status">{{ applicationNotice }}</p>
            </section>
          </template>
          <template #aside>
            <AttachmentList
              :parts="attachments"
              :disabled="disabled"
              @inspect="inspect"
              @download="inspect($event, true)"
            />
            <div class="document-next-actions">
              <h3>Nächster Schritt</h3>
              <p class="small-note">
                Prüfen Sie die Fachdaten und Anlagen. Eine Antwort schließt den Empfang noch nicht ab.
              </p>
              <div class="client-actions">
                <button
                  v-if="!reply"
                  class="button secondary"
                  type="button"
                  :disabled="disabled"
                  @click="beginReply"
                >
                  Antwort verfassen
                </button>
                <button
                  v-if="!reply"
                  class="button"
                  type="button"
                  :disabled="disabled || receiptUncertain"
                  @click="beginReceipt('accept')"
                >
                  Annehmen
                </button>
                <button
                  v-if="!reply"
                  class="button secondary"
                  type="button"
                  :disabled="disabled || receiptUncertain"
                  @click="beginReceipt('reject')"
                >
                  Ablehnen
                </button>
                <button
                  v-else
                  class="button"
                  type="button"
                  :disabled="disabled"
                  @click="
                    receiptSection?.scrollIntoView({ block: 'start' });
                    receiptSection?.querySelector('button, select')?.focus();
                  "
                >
                  Antwort quittieren
                </button>
              </div>
            </div>
          </template>
        </DocumentLayout>
        <details class="application-technical">
          <summary>Technische Inhalte und Originaldownloads ({{ parts.length }})</summary>
          <div class="client-table support-table">
            <table class="submission-content-table receive-content-table">
              <thead>
                <tr>
                  <th scope="col">Inhalt</th>
                  <th scope="col">Format / Größe</th>
                  <th scope="col">Lokale Prüfung</th>
                  <th scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="part in parts" :key="part.contentId">
                  <th scope="row" data-label="Inhalt">
                    {{ label(part) }}
                    <p v-if="part.description" class="small-note">{{ part.description }}</p>
                    <details v-if="part.attachmentId">
                      <summary>Anlagen-ID</summary>
                      <code>{{ part.attachmentId }}</code>
                    </details>
                  </th>
                  <td data-label="Format / Größe">
                    {{ part.mimeType || 'Nicht angegeben' }}
                    <br />
                    <span class="small-note">{{ bytesLabel(part.totalBytes) }}</span>
                  </td>
                  <td data-label="Lokale Prüfung">
                    <span class="status-badge ok">
                      {{ part.kind === 'metadata' ? 'JWE geprüft' : 'JWE und Hash geprüft' }}
                    </span>
                  </td>
                  <td data-label="Aktionen">
                    <div class="client-actions">
                      <button
                        class="button secondary"
                        type="button"
                        :disabled="disabled"
                        v-if="canPreview(part)"
                        @click="inspect(part)"
                      >
                        Anzeigen
                      </button>
                      <button
                        class="button secondary"
                        type="button"
                        :disabled="disabled"
                        @click="inspect(part, true)"
                      >
                        Herunterladen
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </template>
      <ContentPreview
        v-if="preview"
        :preview="preview"
        :schema-document="preview?.isApplication ? applicationSchema?.document : undefined"
        :schema-uri="preview?.isApplication ? applicationSchema?.schemaUri : undefined"
        @close="closePreview"
      />
    </section>
    <div v-show="!reply && !completed" ref="replySection" class="receive-action-section">
      <ReplySender
        ref="replySender"
        guided
        v-if="!reply && !completed"
        :session="session"
        :proof="proof"
        :busy="busy || pending"
        @busy="(value) => emit('busy', value)"
        @activity="(value) => emit('activity', value)"
        @fatal="(value) => emit('fatal', value)"
        @invalidate="resetProof"
        @event-log="(value) => emit('event-log', value)"
      />
    </div>
    <div ref="receiptSection" class="receive-action-section">
      <ReplyReceiptPanel
        v-if="reply"
        :session="session"
        :detail="detail"
        :proof="proof"
        :parts="parts"
        :busy="busy || pending"
        @busy="(value) => emit('busy', value)"
        @activity="(value) => emit('activity', value)"
        @fatal="(value) => emit('fatal', value)"
        @outcome="(value) => emit('outcome', value)"
        @invalidate="resetProof"
        @event-log="(value) => emit('event-log', value)"
      />
      <ReceiptPanel
        ref="receiptPanel"
        guided
        v-if="!reply"
        :session="session"
        :detail="detail"
        :proof="proof"
        :busy="busy || pending"
        :key-revision="keyRevision"
        @busy="(value) => emit('busy', value)"
        @activity="(value) => emit('activity', value)"
        @fatal="(value) => emit('fatal', value)"
        @outcome="
          (value) => {
            receiptOutcome = value;
            emit('outcome', value);
          }
        "
        @invalidate="resetProof"
      />
    </div>
  </div>
</template>
