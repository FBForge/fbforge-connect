<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { invoke } from './native.js';
import { listDestinations, loadDestination, importKey, loadedKeys, discardKeys } from './resources.js';
import { resetsSessions } from './sessions.js';
import { importKeyFiles } from './key-files.js';
import FileDropInput from './FileDropInput.vue';
import CopyValue from './CopyValue.vue';
import DocumentationLink from './DocumentationLink.vue';

const props = defineProps({ session: Object, busy: Boolean, defaultDestination: String });
const emit = defineEmits(['busy', 'activity', 'fatal', 'destination', 'invalidate']);
const id = ref('');
const selected = ref(null);
const page = ref(null);
const keys = ref([]);
const error = ref('');
const pending = ref(false);
const action = ref('');
const hydrated = ref(false);
const identity = computed(() =>
  props.session ? `${props.session.apiVersion}/${props.session.sessionId}` : '',
);
const disabled = computed(() => props.busy || pending.value || !props.session);
let revision = 0;
watch(
  () => props.defaultDestination,
  (value) => {
    if (!id.value && value && props.session) id.value = value;
  },
  { immediate: true },
);
const expanded = ref(true),
  setupHeading = ref(null);
const ready = computed(() =>
  Boolean(
    selected.value &&
    selected.value.destinationId === id.value.trim().toLowerCase() &&
    keys.value.some((key) => key.destinationId === selected.value.destinationId && key.purpose === 'decrypt'),
  ),
);
const destinationName = computed(() => {
  if (!selected.value) return '';
  const name = JSON.parse(selected.value.detailsJson).name;
  return typeof name === 'string' ? name : '';
});
watch(ready, (value) => {
  expanded.value = !value;
});
async function showSetup() {
  expanded.value = true;
  await nextTick();
  setupHeading.value?.focus();
  setupHeading.value?.scrollIntoView({ block: 'start' });
}
defineExpose({ showSetup });
const messages = {
  invalid_input:
    'Bitte eine gültige Destination ID und höchstens 16 Schlüsseldateien mit jeweils maximal 32 KiB auswählen.',
  content_limit: 'Die zulässige Anzahl oder Gesamtgröße der Schlüssel ist erreicht.',
  resource_denied:
    'Für diese Anfrage fehlen die Berechtigungen. Sie können eine Destination auch direkt über ihre ID laden.',
  resource_missing: 'Die Destination wurde in TEST nicht gefunden.',
  resource_unavailable: 'Die TEST-Daten konnten nicht geladen werden. Bitte erneut versuchen.',
  key_rejected:
    'Der private Schlüssel passt nicht eindeutig zu einem freigegebenen registrierten Testschlüssel oder hat den falschen Verwendungszweck.',
  test_certificate_required:
    'Es werden ausschließlich registrierte selbstsignierte Testzertifikate akzeptiert.',
  session_missing: 'Bitte erneut bei TEST anmelden.',
  file_invalid:
    'Die Datei muss genau einen Schlüssel als JWK, JWKS oder unverschlüsseltes PKCS#8-PEM enthalten und gültiges UTF-8 verwenden.',
};
const shortId = (value) => (value.length > 28 ? `${value.slice(0, 14)}…${value.slice(-10)}` : value);

async function run(name, operation, apply) {
  if (disabled.value) return;
  const snapshot = props.session;
  const version = revision;
  const started = performance.now();
  pending.value = true;
  action.value = name;
  error.value = '';
  emit('busy', true);
  if (['Destination prüfen', 'Testschlüssel laden', 'Testschlüssel verwerfen'].includes(name))
    emit('invalidate');
  let status = 'Erfolgreich';
  try {
    const value = await operation(snapshot);
    if (version === revision) {
      apply(value);
      if (value?.failures?.length) status = value.imported ? 'Teilweise erfolgreich' : 'Fehlgeschlagen';
    }
  } catch (cause) {
    status = 'Fehlgeschlagen';
    if (version === revision) {
      const code = typeof cause === 'string' ? cause : cause?.message;
      error.value = Object.hasOwn(messages, code)
        ? messages[code]
        : 'Die Aktion konnte nicht abgeschlossen werden.';
    }
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    action.value = '';
    emit('activity', {
      api: snapshot.apiVersion,
      role: snapshot.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
      action: name,
      status,
      started,
    });
    emit('busy', false);
  }
}
function list(offset = 0) {
  run(
    'Destinations laden',
    (session) => listDestinations(invoke, session, offset),
    (value) => {
      page.value = value;
    },
  );
}
function load(destination = id.value.trim()) {
  selected.value = null;
  id.value = destination;
  run(
    'Destination prüfen',
    (session) => loadDestination(invoke, session, destination),
    (value) => {
      selected.value = value;
      emit('destination', value.destinationId);
    },
  );
}
function chooseFile(files) {
  if (disabled.value || !selected.value) return;
  const destination = selected.value.destinationId;
  const fileRevision = revision;
  run(
    'Testschlüssel laden',
    async (session) => {
      return importKeyFiles(
        files,
        (document) => importKey(invoke, session, destination, 'auto', document),
        () => session.sessionId === props.session?.sessionId && revision === fileRevision,
      );
    },
    (value) => {
      if (!value) return;
      if (value.state) keys.value = value.state.keys;
      error.value = value.failures.map((item) => `${item.name}: ${messages[item.code]}`).join('\n');
    },
  );
}
function discard() {
  if (
    disabled.value ||
    !window.confirm(
      'Alle importierten privaten Destination-Schlüssel dieser TEST-Sitzung entfernen? Temporäre Antwortschlüssel bleiben bis zum Abmelden verfügbar.',
    )
  )
    return;
  run(
    'Testschlüssel verwerfen',
    (session) => discardKeys(invoke, session),
    (value) => {
      keys.value = value.keys;
    },
  );
}
watch(
  identity,
  () => {
    revision++;
    id.value = '';
    selected.value = null;
    page.value = null;
    keys.value = [];
    error.value = '';
    hydrated.value = false;
    expanded.value = true;
  },
  { flush: 'sync' },
);
watch(
  [identity, () => props.busy],
  () => {
    if (identity.value && !disabled.value && !hydrated.value) {
      hydrated.value = true;
      run(
        'Geladene Schlüssel prüfen',
        (session) => loadedKeys(invoke, session),
        (value) => {
          keys.value = value.keys;
        },
      );
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="tool-section" aria-labelledby="destination-keys-title" :aria-busy="pending">
    <div class="tool-section-heading">
      <div>
        <h2 id="destination-keys-title" ref="setupHeading" tabindex="-1">Empfang einrichten</h2>
        <p v-if="!ready">
          Wählen Sie einmal Ihre Destination und laden Sie den passenden privaten Schlüssel.
        </p>
      </div>
      <button
        v-if="ready"
        class="button secondary"
        type="button"
        :aria-expanded="expanded"
        aria-controls="receiver-setup"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Einrichtung ausblenden' : 'Einrichtung ändern' }}
      </button>
    </div>
    <div v-if="ready" class="receiver-summary">
      <strong>{{ destinationName || 'Ihre Empfangs-Destination' }}</strong>
      <CopyValue :value="selected.destinationId" label="Destination ID" />
      <span class="status-badge ok">Passender Entschlüsselungsschlüssel geladen</span>
      <small>Der Inhalt jeder Einreichung wird beim Öffnen separat geprüft.</small>
    </div>
    <div id="receiver-setup" v-show="expanded">
      <p class="small-note">
        Bei aktiviertem Profil wird der geladene Schlüsselbestand geschützt gespeichert. „Schlüssel verwerfen“
        entfernt ihn auch aus dem aktiven Profil. Antwortkanäle werden separat verwaltet.
      </p>
      <p v-if="!session">
        Melden Sie sich bei TEST an, um Destinations und ihre registrierten Testschlüssel zu prüfen.
      </p>
      <template v-else>
        <p>Einmal geladene Schlüssel bleiben für weitere passende Einreichungen verfügbar.</p>
        <form @submit.prevent="load()">
          <div class="client-fields">
            <label for="destination-id">
              Destination ID
              <input
                id="destination-id"
                v-model="id"
                type="text"
                maxlength="36"
                required
                :disabled="disabled"
                placeholder="UUID der TEST-Destination"
              />
            </label>
          </div>
          <div class="client-actions">
            <button class="button" type="submit" :disabled="disabled || !id.trim()">Destination laden</button>
            <button class="button secondary" type="button" :disabled="disabled" @click="list()">
              Eigene Destinations auflisten
            </button>
          </div>
        </form>
        <p v-if="pending" role="status">{{ action }} …</p>
        <p v-if="error" class="status-badge error" role="alert">{{ error }}</p>
        <template v-if="page">
          <h3>Eigene Destinations · {{ page.totalCount }}</h3>
          <p v-if="!page.destinations.length">Keine Destinations auf dieser Seite gefunden.</p>
          <div v-else class="client-table support-table">
            <table class="submission-result-table">
              <thead>
                <tr>
                  <th scope="col">Name / ID</th>
                  <th scope="col">Status / Typ</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in page.destinations" :key="item.destinationId">
                  <td data-label="Name / ID">
                    {{ item.name || 'Ohne Namen' }}
                    <br />
                    <code :title="item.destinationId">{{ shortId(item.destinationId) }}</code>
                  </td>
                  <td data-label="Status / Typ">
                    {{ item.status || 'Unbekannt' }} · {{ item.type || 'Unbekannt' }}
                  </td>
                  <td data-label="Aktion">
                    <button
                      class="button secondary"
                      type="button"
                      :disabled="disabled"
                      @click="load(item.destinationId)"
                    >
                      Auswählen
                    </button>
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
              @click="list(page.offset - 20)"
            >
              Vorherige Seite
            </button>
            <span>Seite {{ page.offset / 20 + 1 }}</span>
            <button
              class="button secondary"
              type="button"
              :disabled="disabled || page.offset >= 10000 || page.offset + 20 >= page.totalCount"
              @click="list(page.offset + 20)"
            >
              Nächste Seite
            </button>
          </div>
        </template>
        <template v-if="selected">
          <p>
            {{ selected.keys.filter((key) => key.eligible).length }} registrierte Testschlüssel verfügbar.
          </p>
          <FileDropInput
            id="private-test-key"
            label="Private Testschlüssel laden"
            multiple
            accept=".json,.jwk,.jwks,.pem,.key"
            :disabled="disabled || !selected.keys.some((key) => key.eligible)"
            @files="chooseFile"
          >
            Bis zu 16 Dateien als JWK, JWKS oder unverschlüsseltes PKCS#8-PEM, jeweils maximal 32 KiB.
            Verwendung und passende Registrierung werden automatisch erkannt.
          </FileDropInput>
          <details>
            <summary>Öffentliche Destination-Daten</summary>
            <pre>{{ selected.detailsJson }}</pre>
          </details>
        </template>
        <p v-if="keys.length" class="status-badge ok">
          {{ keys.length === 1 ? 'Testschlüssel geladen' : `${keys.length} Testschlüssel geladen` }} · für
          passende Einreichungen verfügbar
        </p>
        <p v-else>Noch kein privater Testschlüssel geladen.</p>
        <div class="client-actions">
          <button
            class="button secondary"
            type="button"
            :disabled="disabled || !keys.length"
            @click="discard"
          >
            Importierte Destination-Schlüssel verwerfen
          </button>
        </div>
      </template>
      <DocumentationLink topic="receive">Hilfe zur Empfangseinrichtung</DocumentationLink>
    </div>
  </section>
</template>
