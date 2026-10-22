<script setup>
import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import FileDropInput from './FileDropInput.vue';
import StructuredData from './StructuredData.vue';
import ServiceLabel from './ServiceLabel.vue';
import demoPack from './examples/integration.fctest.json';
import {
  parseTestPack,
  serializeTestPack,
  validateTestPack,
  testPackError,
  TEST_PACK_BYTES,
} from './test-packs.js';
import { downloadLocal } from './local-download.js';
const emit = defineEmits(['send']);
const props = defineProps({ busy: Boolean });
const pack = shallowRef(null),
  selection = ref(0),
  error = ref(''),
  notice = ref(''),
  reading = ref(false),
  heading = ref(null);
const expectedReply = ref(false),
  replyData = ref(''),
  replyProcess = ref(''),
  receipt = ref('none');
const packageName = ref(''),
  caseName = ref('');
const current = computed(() => pack.value?.cases[selection.value]);
const disabled = computed(() => props.busy || reading.value);
let revision = 0;
watch(current, (item) => {
  caseName.value = item?.name || '';
  expectedReply.value = Boolean(item?.reply);
  replyData.value =
    item?.reply?.data || (item?.request.replyOffer?.mimeType === 'application/xml' ? '<antwort/>' : '{}');
  replyProcess.value = item?.reply?.processMessage ? JSON.stringify(item.reply.processMessage) : '';
  receipt.value = item?.receipt || 'none';
});
async function show(value, add = false) {
  if (add && pack.value)
    value = validateTestPack({ ...pack.value, cases: [...pack.value.cases, ...value.cases] });
  pack.value = structuredClone(value);
  packageName.value = value.name;
  selection.value = add ? pack.value.cases.length - 1 : 0;
  error.value = '';
  notice.value = '';
  await nextTick();
  heading.value?.focus();
}
async function load(files, add = false) {
  if (disabled.value) return;
  if (add && !saveExpectations()) return;
  const stamp = ++revision;
  reading.value = true;
  error.value = '';
  notice.value = '';
  try {
    const file = files[0];
    if (file.size > TEST_PACK_BYTES) throw new Error('test_pack_limit');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (stamp === revision) await show(parseTestPack(source), add);
  } catch (cause) {
    if (stamp === revision) error.value = testPackError(cause);
  } finally {
    if (stamp === revision) reading.value = false;
  }
}
function saveExpectations() {
  if (disabled.value || !current.value) return false;
  error.value = '';
  try {
    const copy = structuredClone(pack.value),
      item = copy.cases[selection.value],
      offer = item.request.replyOffer;
    copy.name = packageName.value.trim();
    item.name = caseName.value.trim();
    item.receipt = receipt.value;
    item.reply =
      expectedReply.value && offer
        ? {
            schemaUri: offer.schemaUri,
            mimeType: offer.mimeType,
            data: replyData.value,
            attachments: item.reply?.attachments || [],
            processMessage: replyProcess.value ? JSON.parse(replyProcess.value) : null,
          }
        : null;
    validateTestPack(copy);
    pack.value = copy;
    return true;
  } catch (cause) {
    error.value = testPackError(cause);
    return false;
  }
}
function selectCase(event) {
  const index = Number(event.target.value);
  if (saveExpectations()) selection.value = index;
  else event.target.value = String(selection.value);
}
function download() {
  if (saveExpectations()) downloadLocal(serializeTestPack(pack.value), 'testpaket.fctest.json');
}
function send() {
  if (saveExpectations()) emit('send', structuredClone(current.value));
}
async function copyReply() {
  try {
    await navigator.clipboard.writeText(replyData.value);
    notice.value = 'Antwortinhalt kopiert.';
  } catch {
    notice.value = 'Bitte markieren und kopieren Sie den Antwortinhalt im Eingabefeld.';
  }
}
onBeforeUnmount(() => revision++);
</script>
<template>
  <section class="tool-section" aria-labelledby="test-packages-title">
    <h2 id="test-packages-title">Testfälle wiederverwenden</h2>
    <p>
      Ein Testpaket enthält Fachdaten, Anlagen und Erwartungen für Ihren manuellen Integrationstest. Im
      Versand können Sie einen eigenen Entwurf als Testfall speichern.
    </p>
    <p class="small-note">
      Pakete sind unverschlüsselte Dateien. Verwenden Sie fiktive Testdaten. Zugangsdaten, private Schlüssel
      und bisherige Nachrichtenkennungen werden nicht aus Ihrer Verbindung übernommen.
    </p>
    <details :open="!pack">
      <summary>{{ pack ? 'Anderes Paket öffnen oder Beispiel laden' : 'Testpaket laden' }}</summary>
      <FileDropInput
        id="test-package-file"
        label="Testpaket öffnen"
        accept=".json,application/json"
        :disabled="disabled"
        @files="load($event)"
      />
      <div class="client-actions">
        <button class="button secondary" type="button" :disabled="disabled" @click="show(demoPack)">
          Fiktives Testpaket öffnen
        </button>
      </div>
    </details>
    <p v-if="reading" role="status">Testpaket wird gelesen …</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="pack && current">
      <h3 ref="heading" tabindex="-1">{{ pack.name }}</h3>
      <p>
        {{ pack.cases.length }} {{ pack.cases.length === 1 ? 'Testfall' : 'Testfälle' }} · Nur lokal geöffnet
      </p>
      <label for="test-case-choice">
        Testfall auswählen
        <select id="test-case-choice" :value="selection" :disabled="disabled" @change="selectCase">
          <option v-for="(item, index) in pack.cases" :key="item.id" :value="index">
            {{ item.name }} · {{ item.id }}
          </option>
        </select>
      </label>
      <div class="client-actions">
        <button class="button" type="button" :disabled="disabled" @click="send">
          Als Versandentwurf öffnen
        </button>
        <button class="button secondary" type="button" :disabled="disabled" @click="download">
          Testpaket speichern
        </button>
      </div>
      <details>
        <summary>Bezeichnungen ändern</summary>
        <div class="client-fields">
          <label for="test-package-name">
            Paketname
            <input
              id="test-package-name"
              v-model="packageName"
              type="text"
              maxlength="160"
              :disabled="disabled"
            />
          </label>
          <label for="test-case-name">
            Testfallname
            <input id="test-case-name" v-model="caseName" type="text" maxlength="160" :disabled="disabled" />
          </label>
        </div>
      </details>
      <dl class="receipt-dialog-context test-package-summary">
        <dt>Leistung</dt>
        <dd>
          <ServiceLabel :name="current.request.serviceName" :identifier="current.request.serviceIdentifier" />
        </dd>
        <dt>Schema</dt>
        <dd>{{ current.request.schemaUri }}</dd>
        <dt>Format</dt>
        <dd>{{ current.request.mimeType }}</dd>
        <dt>Anlagen</dt>
        <dd>{{ current.request.attachments.length }}</dd>
        <dt>Antwortangebot</dt>
        <dd>{{ current.request.replyOffer ? 'Angeboten' : 'Nicht angeboten' }}</dd>
      </dl>
      <p v-if="current.request.processMessage">
        Prozess: {{ current.request.processMessage.processModelId }} · Nachricht:
        {{ current.request.processMessage.messageId }} · Benötigt API v3
      </p>
      <p class="small-note">
        Die Empfänger-Destination wählen Sie im Versand. Dort wird das aktuelle Empfängerangebot erneut
        geprüft. Erst die separate Versandbestätigung übermittelt Daten an die gewählte Umgebung.
      </p>
      <details>
        <summary>Fachdaten und Anlagen ansehen</summary>
        <StructuredData
          :text="current.request.data"
          :format="current.request.mimeType === 'application/xml' ? 'xml' : 'json'"
          :schema-uri="current.request.schemaUri"
        />
        <ul>
          <li v-for="item in current.request.attachments" :key="item.fileName">
            {{ item.fileName }} · {{ item.mimeType }}
          </li>
        </ul>
      </details>
      <details>
        <summary>Erwartungen für den manuellen Test</summary>
        <p>
          Diese Angaben helfen beim Prüfen der Gegenstelle. Sie senden keine Antwort und bestätigen keinen
          Empfang automatisch.
        </p>
        <label for="test-expected-receipt">
          Erwartete Empfangsbestätigung
          <select id="test-expected-receipt" v-model="receipt" :disabled="disabled">
            <option value="none">Keine Vorgabe</option>
            <option value="accept">Annehmen</option>
            <option value="reject">Ablehnen</option>
          </select>
        </label>
        <label v-if="current.request.replyOffer" class="checkbox-label">
          <input v-model="expectedReply" type="checkbox" :disabled="disabled" />
          Erwartete Antwort hinterlegen
        </label>
        <template v-if="expectedReply && current.request.replyOffer">
          <p>
            Antwortschema: {{ current.request.replyOffer.schemaUri }} ·
            {{ current.request.replyOffer.mimeType }}
          </p>
          <label v-if="current.request.replyOffer.processMessages.length" for="test-reply-process">
            Prozessnachricht der Antwort
            <select id="test-reply-process" v-model="replyProcess" :disabled="disabled">
              <option value="">Keine Prozesszuordnung</option>
              <option
                v-for="item in current.request.replyOffer.processMessages"
                :key="JSON.stringify(item)"
                :value="JSON.stringify(item)"
              >
                {{ item.processModelId }} · {{ item.messageId }}
              </option>
            </select>
          </label>
          <label for="test-expected-reply">
            Erwarteter Antwortinhalt
            <textarea
              id="test-expected-reply"
              v-model="replyData"
              rows="7"
              :disabled="disabled"
              spellcheck="false"
            />
          </label>
          <button class="button secondary" type="button" :disabled="disabled" @click="copyReply">
            Antwortinhalt kopieren
          </button>
        </template>
        <p v-else-if="!current.request.replyOffer" class="small-note">
          Dieser Testfall bietet keinen FIT-Connect-Antwortkanal an.
        </p>
      </details>
      <details v-if="current.schemas.length">
        <summary>Lokale Schemata für die Prüfung</summary>
        <ul>
          <li v-for="(item, index) in current.schemas" :key="item.uri">
            <code>{{ item.uri }}</code>
            <button
              class="button secondary"
              type="button"
              @click="
                downloadLocal(
                  item.content,
                  `test-schema-${index + 1}.${item.mimeType === 'application/xml' ? 'xsd' : 'json'}`,
                  item.mimeType,
                )
              "
            >
              Schema herunterladen
            </button>
          </li>
        </ul>
      </details>
      <details>
        <summary>Weitere Testfälle hinzufügen</summary>
        <p>
          Öffnen Sie ein weiteres Paket. Die Testfall-Kennungen müssen innerhalb des gemeinsamen Pakets
          eindeutig sein.
        </p>
        <FileDropInput
          id="test-package-add"
          label="Testpaket hinzufügen"
          accept=".json,application/json"
          :disabled="disabled"
          @files="load($event, true)"
        />
      </details>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
