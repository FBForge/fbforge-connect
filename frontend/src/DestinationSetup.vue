<script setup>
import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { demoSchemas, downloadDemoSchema } from './demo-data.js';
import { invoke } from './native.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
import {
  generateTestKeys,
  listGeneratedKeys,
  prepareDestinationCreation,
  executeDestinationCreation,
  cancelDestinationCreation,
  destinationCreationState,
  reconcileDestinationCreation,
  useGeneratedKeys,
} from './destination-setup.js';

const wizardStep = ref(0),
  form = ref(null),
  stepNotice = ref('');
const steps = computed(() => (kind.value === 'C' ? [0, 2] : [0, 1, 2]));
const stepTitles = ['Testanwendung', 'Fachdaten', 'Schlüssel und Vorschau'];
let invalidTarget;
const props = defineProps({ session: Object, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'created', 'changed', 'receive']);
const name = ref(''),
  legalName = ref(''),
  email = ref(''),
  address = ref(''),
  phone = ref(''),
  kind = ref('A');
const addressing = ref('service'),
  service = ref('99008001014002'),
  regions = ref('DE');
const model = ref(''),
  message = ref(''),
  schema = ref(''),
  mime = ref('application/json');
const replySchema = ref(''),
  compatible = ref(true);
const bundles = shallowRef([]),
  selectedBundle = ref(''),
  unresolvedBundle = ref(''),
  knownDestination = ref('');
const prepared = shallowRef(null),
  owner = shallowRef(null),
  outcome = shallowRef(null);
const working = ref(false),
  error = ref(''),
  notice = ref(''),
  dialog = ref(null),
  prepareButton = ref(null),
  resultHeading = ref(null);
const context = computed(() => `${props.session?.apiVersion}/${props.session?.sessionId}`);
const locked = computed(() =>
  Boolean(
    outcome.value &&
    props.session &&
    outcome.value.sessionId === props.session.sessionId &&
    outcome.value.status === 'uncertain',
  ),
);
const disabled = computed(
  () =>
    props.busy ||
    working.value ||
    !props.session ||
    props.session.apiVersion !== 'v3' ||
    Boolean(prepared.value),
);
const available = computed(() => bundles.value.filter((item) => item.status === 'ready'));
const unresolved = computed(() => bundles.value.filter((item) => item.status === 'unresolved'));
let revision = 0,
  alive = true,
  generatedForDraft;
const explain = (cause) =>
  ({
    invalid_input: 'Bitte die Pflichtfelder, Schema-Kennung und Zuständigkeit prüfen.',
    key_missing:
      'Das gewählte Schlüsselpaar ist nicht mehr verfügbar. Bitte die lokalen Schlüssel neu laden.',
    destination_update_locked:
      'Dieser Anlageversuch ist bereits abgeschlossen oder ungeklärt. Bitte die vorhandene Destination prüfen und zuordnen.',
    confirmation_expired: 'Die Vorschau ist abgelaufen. Bitte erneut vorbereiten.',
    verification_failed:
      'Die zurückgelesene Destination passt nicht vollständig zur Vorschau oder zu den erzeugten Schlüsseln. Bitte die vorhandene Destination prüfen.',
    resource_denied:
      'Diese TEST-Zugangsdaten dürfen die Destination nicht anlegen oder verwalten. Die Berechtigung muss im TEST-Konto eingerichtet werden.',
  })[typeof cause === 'string' ? cause : cause?.message] || errorMessage(cause);
async function cancelKnown(value, active) {
  if (!value || !active) return;
  try {
    await cancelDestinationCreation(invoke, active, value.attempt.attemptId);
  } catch (cause) {
    if (alive && resetsSessions(cause)) emit('fatal', cause);
  }
}
async function revealInvalid(event) {
  event.preventDefault();
  if (invalidTarget) return;
  invalidTarget = event.target;
  stepNotice.value = 'Bitte das markierte Pflichtfeld prüfen und ergänzen.';
  wizardStep.value = Number(invalidTarget.closest('[data-setup-step]')?.dataset.setupStep || 0);
  await nextTick();
  invalidTarget?.focus();
  invalidTarget?.reportValidity();
  invalidTarget = null;
}
function validControls(selector) {
  const fields = [...(form.value?.querySelectorAll(selector) || [])];
  const invalid = fields.find((field) => !field.disabled && !field.checkValidity());
  return !invalid;
}
async function submitStep() {
  stepNotice.value = '';
  if (wizardStep.value !== 2) {
    if (
      !validControls(
        `[data-setup-step="${wizardStep.value}"] input, [data-setup-step="${wizardStep.value}"] select, [data-setup-step="${wizardStep.value}"] textarea`,
      )
    )
      return;
    wizardStep.value = steps.value[steps.value.indexOf(wizardStep.value) + 1];
    await nextTick();
    form.value
      ?.querySelector(
        `[data-setup-step="${wizardStep.value}"] input, [data-setup-step="${wizardStep.value}"] select, [data-setup-step="${wizardStep.value}"] textarea`,
      )
      ?.focus();
  } else if (validControls('input, select, textarea')) await prepare();
}
watch(kind, () => {
  if (!steps.value.includes(wizardStep.value)) wizardStep.value = 0;
});
function reset() {
  revision++;
  const value = prepared.value,
    active = owner.value;
  prepared.value = null;
  dialog.value?.close();
  error.value = '';
  notice.value = '';
  generatedForDraft = null;
  bundles.value = [];
  selectedBundle.value = '';
  outcome.value = null;
  unresolvedBundle.value = '';
  knownDestination.value = '';
  if (!working.value) void cancelKnown(value, active);
}
watch(context, reset, { flush: 'sync' });
watch(
  () =>
    JSON.stringify([
      name.value,
      legalName.value,
      email.value,
      address.value,
      phone.value,
      kind.value,
      addressing.value,
      service.value,
      regions.value,
      model.value,
      message.value,
      schema.value,
      mime.value,
      replySchema.value,
      compatible.value,
      selectedBundle.value,
    ]),
  () => {
    revision++;
    if (prepared.value && !working.value) {
      const value = prepared.value;
      prepared.value = null;
      dialog.value?.close();
      void cancelKnown(value, owner.value);
    }
  },
  { flush: 'sync' },
);
onBeforeUnmount(() => {
  alive = false;
  reset();
});
async function run(action, operation) {
  if (props.busy || working.value || !props.session) return;
  const active = { ...props.session },
    stamp = revision,
    started = performance.now();
  const current = () => alive && stamp === revision;
  working.value = true;
  error.value = '';
  notice.value = '';
  emit('busy', true);
  let status = 'Erfolgreich';
  try {
    status = (await operation(active, current)) || status;
  } catch (cause) {
    status = 'Fehlgeschlagen';
    if (current()) error.value = explain(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    working.value = false;
    emit('busy', false);
    emit('activity', { api: active.apiVersion, role: 'Destination-Verwaltung', action, status, started });
  }
}
async function refresh(active, current) {
  const rows = await listGeneratedKeys(invoke, active);
  if (current()) bundles.value = rows;
  return rows;
}
function loadBundles() {
  return run('Lokale TEST-Schlüssel laden', (active, current) =>
    refresh(active, current).then(() => undefined),
  );
}
function configuration() {
  const selectedRegions = regions.value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((value) => (/^[0-9]{12}$/.test(value) ? `DE${value}` : value.toUpperCase()));
  const offeredSchema = { schemaUri: schema.value.trim(), mimeType: mime.value };
  const publicServices = [],
    processMessages = [];
  if (kind.value === 'A') {
    if (addressing.value === 'service') {
      const identifier = service.value.trim();
      publicServices.push({
        identifier: /^[0-9]{14}$/.test(identifier) ? `urn:de:fim:leika:leistung:${identifier}` : identifier,
        regions: selectedRegions,
        submissionSchemas: [offeredSchema],
        ...(replySchema.value.trim()
          ? { replyChannels: { fitConnect: { processStandards: [replySchema.value.trim()] } } }
          : {}),
      });
    } else
      processMessages.push({
        processModelId: model.value.trim(),
        messageId: message.value.trim(),
        regions: selectedRegions,
        schemas: [offeredSchema],
      });
  }
  return {
    name: name.value.trim(),
    type: kind.value,
    contactInformation: {
      legalName: legalName.value.trim(),
      email: email.value.trim(),
      address: address.value.trim(),
      phone: phone.value.trim(),
    },
    metadataVersions: compatible.value ? ['2.0.0', '3.0.0'] : ['3.0.0'],
    publicServices,
    processMessages,
  };
}
async function prepare() {
  if (disabled.value || locked.value) return;
  const draft = configuration(),
    chosen = selectedBundle.value;
  await run('TEST-Destination vorbereiten', async (active, current) => {
    const previous = await destinationCreationState(invoke, active);
    if (!current()) return 'Abgebrochen';
    if (previous.status === 'uncertain') {
      outcome.value = { ...previous, sessionId: active.sessionId };
      await refresh(active, current);
      return 'Ausgang ungewiss';
    }
    if (previous.status === 'prepared') await cancelDestinationCreation(invoke, active, previous.attemptId);
    let keys = null;
    if (draft.type === 'A') {
      const rows = await refresh(active, current);
      if (!current()) return 'Abgebrochen';
      keys = rows.find((item) => item.bundleId === (chosen || generatedForDraft) && item.status === 'ready');
      if (!chosen && !keys) {
        keys = await generateTestKeys(invoke, active);
        generatedForDraft = keys.bundleId;
      }
      if (!keys) throw new Error('key_missing');
    }
    if (!current()) return 'Abgebrochen';
    const value = await prepareDestinationCreation(invoke, active, keys, draft);
    if (!current()) {
      await cancelKnown(value, active);
      return 'Abgebrochen';
    }
    owner.value = active;
    prepared.value = value;
    outcome.value = null;
  });
  await nextTick();
  if (alive && prepared.value) dialog.value?.showModal();
}
async function dismiss() {
  if (!prepared.value || working.value) return;
  const value = prepared.value,
    active = owner.value;
  await run('Destination-Vorbereitung verwerfen', async (_, current) => {
    try {
      await cancelDestinationCreation(invoke, active, value.attempt.attemptId);
    } finally {
      prepared.value = null;
      dialog.value?.close();
    }
    await refresh(active, current);
  });
  await nextTick();
  if (alive) prepareButton.value?.focus();
}
async function confirm() {
  if (!prepared.value || props.busy || working.value) return;
  const value = prepared.value,
    active = owner.value;
  await run('Eigene TEST-Destination anlegen', async (_, current) => {
    const result = await executeDestinationCreation(invoke, active, value.attempt);
    prepared.value = null;
    dialog.value?.close();
    emit('changed');
    if (current()) {
      outcome.value = { ...result, sessionId: active.sessionId };
      knownDestination.value = result.destinationId || '';
      unresolvedBundle.value = result.bundleId;
      await refresh(active, current);
      await nextTick();
      resultHeading.value?.focus();
    }
    if (resetsSessions(result.error)) emit('fatal', result.error);
    return result.status === 'confirmed'
      ? 'Erfolgreich'
      : result.status === 'uncertain'
        ? 'Ausgang ungewiss'
        : 'Fehlgeschlagen';
  });
}
async function reconcile() {
  if (
    disabled.value ||
    (!unresolvedBundle.value &&
      !(
        outcome.value?.status === 'uncertain' &&
        outcome.value.bundleId === null &&
        outcome.value.destinationId
      )) ||
    !knownDestination.value.trim()
  )
    return;
  const bundleId = unresolvedBundle.value || null,
    destinationId = knownDestination.value.trim().toLowerCase();
  await run('Vorhandene TEST-Destination zuordnen', async (active, current) => {
    const result = await reconcileDestinationCreation(invoke, active, bundleId, destinationId);
    if (current()) {
      outcome.value = { ...result, sessionId: active.sessionId };
      await refresh(active, current);
    }
    emit('changed');
  });
}
async function loadKeys() {
  if (disabled.value || outcome.value?.status !== 'confirmed') return;
  const target = outcome.value;
  let ready = false;
  await run('Erzeugte Schlüssel für Empfang laden', async (active, current) => {
    await useGeneratedKeys(invoke, active, target.bundleId, target.destinationId);
    if (current()) {
      notice.value = 'Die privaten TEST-Schlüssel sind für diese Destination geladen.';
      ready = true;
    }
    emit('changed');
  });
  if (ready) emit('receive', target.destinationId);
}
</script>

<template>
  <section class="tool-section" aria-labelledby="destination-setup-title" :aria-busy="working">
    <h2 id="destination-setup-title">Eigene TEST-Destination anlegen</h2>
    <p>
      Eine Destination ist die Adresse Ihrer Testanwendung bei FIT-Connect. Sie benötigen ein TEST-Konto mit
      Berechtigung für die Destination API und ein gespeichertes Windows-Profil.
    </p>
    <p class="small-note">
      Die privaten Schlüssel werden lokal erzeugt und geschützt gesichert. Nur die öffentlichen Teile werden
      registriert. Die neue Destination bleibt zunächst in Vorbereitung und wird nicht im öffentlichen Routing
      angeboten.
    </p>
    <nav v-if="!locked && outcome?.status !== 'confirmed'" aria-label="Schritte der Destination-Anlage">
      <div class="client-actions">
        <button
          v-for="step in steps"
          :key="step"
          type="button"
          class="button secondary"
          :aria-current="wizardStep === step ? 'step' : undefined"
          :disabled="disabled"
          @click="wizardStep = step"
        >
          {{ steps.indexOf(step) + 1 }}. {{ stepTitles[step] }}
        </button>
      </div>
    </nav>
    <p v-if="stepNotice" role="alert">{{ stepNotice }}</p>
    <form
      v-if="!locked && outcome?.status !== 'confirmed'"
      ref="form"
      novalidate
      @submit.prevent="submitStep"
      @invalid.capture="revealInvalid"
    >
      <fieldset v-show="wizardStep === 0" data-setup-step="0" :disabled="disabled">
        <legend>Testanwendung beschreiben</legend>
        <div class="client-fields">
          <label for="setup-name">
            Name der Destination
            <input
              id="setup-name"
              v-model="name"
              required
              maxlength="256"
              placeholder="Zum Beispiel: Bauamt – Integrationstest"
            />
          </label>
          <label for="setup-organisation">
            Organisation
            <input
              id="setup-organisation"
              v-model="legalName"
              required
              maxlength="256"
              placeholder="Zum Beispiel: Stadt Musterstadt"
            />
          </label>
          <label for="setup-email">
            Kontakt-E-Mail
            <input id="setup-email" v-model="email" type="email" required maxlength="256" />
          </label>
          <label for="setup-address">
            Kontaktanschrift
            <textarea
              id="setup-address"
              v-model="address"
              required
              maxlength="2048"
              rows="2"
              aria-describedby="setup-contact-help"
            />
          </label>
          <label for="setup-phone">
            Kontakttelefon
            <input
              id="setup-phone"
              v-model="phone"
              type="tel"
              required
              maxlength="256"
              aria-describedby="setup-contact-help"
            />
          </label>
          <p id="setup-contact-help" class="muted">
            Die Destination API benötigt Anschrift und Telefonnummer. Für eine rein fiktive Test-Destination
            können Sie passende Beispieldaten verwenden.
          </p>
          <label for="setup-type">
            Verwendung
            <select id="setup-type" v-model="kind">
              <option value="A">Fachverfahren / Behörde – Anträge empfangen</option>
              <option value="C">Onlinedienst – Anträge senden und Replies empfangen</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset v-if="kind === 'A'" v-show="wizardStep === 1" data-setup-step="1" :disabled="disabled">
        <legend>Empfangene Fachdaten festlegen</legend>
        <p>
          Das Schema beschreibt die Struktur Ihrer Testdaten. Verwenden Sie die Kennung aus Ihrer
          Testkonfiguration. Eine Destination kann später um weitere Angebote ergänzt werden.
        </p>
        <div class="client-fields">
          <label for="setup-addressing">
            Adressierung
            <select id="setup-addressing" v-model="addressing">
              <option value="service">Über eine Verwaltungsleistung</option>
              <option value="process">Über eine v3-Prozessnachricht</option>
            </select>
          </label>
          <label v-if="addressing === 'service'" for="setup-service">
            Leistungsschlüssel (LeiKa)
            <input
              id="setup-service"
              v-model="service"
              required
              maxlength="512"
              pattern="([0-9]{14}|urn:de:fim:leika:leistung:[0-9]{14})"
            />
            <small>
              14 Ziffern oder die vollständige LeiKa-URN. Der vorbelegte Wert dient nur einem fiktiven
              Testfall.
            </small>
          </label>
          <template v-else>
            <label for="setup-model">
              Prozessmodell-ID
              <input id="setup-model" v-model="model" required maxlength="1024" />
            </label>
            <label for="setup-message">
              Nachrichten-ID
              <input id="setup-message" v-model="message" required maxlength="1024" />
            </label>
          </template>
          <label for="setup-regions">
            Zuständigkeitsgebiet
            <input id="setup-regions" v-model="regions" required maxlength="1024" />
            <small>
              „DE“ für einen bundesweiten Test oder den Regionalschlüssel. Mehrere Gebiete mit Komma trennen.
            </small>
          </label>
          <div>
            <button
              type="button"
              class="button secondary"
              @click="
                schema = demoSchemas.application.schemaUri;
                mime = 'application/json';
                replySchema = demoSchemas.reply.schemaUri;
              "
            >
              Mitgelieferte TEST-Schemata einsetzen
            </button>
            <p class="small-note">
              Fiktives Antrags- und Antwortschema für einen ersten Test. Kein amtliches FIM-/XÖV-Schema. Im
              Test-Client ohne externe Schemafreigabe nutzbar.
            </p>
            <div class="client-actions">
              <button type="button" class="button secondary" @click="downloadDemoSchema('application')">
                Antragsschema herunterladen
              </button>
              <button type="button" class="button secondary" @click="downloadDemoSchema('reply')">
                Antwortschema herunterladen
              </button>
            </div>
          </div>
          <label for="setup-schema">
            Schema-Kennung / URI
            <input
              id="setup-schema"
              v-model="schema"
              required
              maxlength="4096"
              placeholder="https://… oder urn:…"
            />
          </label>
          <label for="setup-mime">
            Datenformat
            <select id="setup-mime" v-model="mime">
              <option value="application/json">JSON</option>
              <option value="application/xml">XML</option>
            </select>
          </label>
          <label v-if="addressing === 'service'" for="setup-reply-schema">
            Schema für Antworten (optional)
            <input id="setup-reply-schema" v-model="replySchema" maxlength="4096" />
            <small>Eintragen, wenn der Testantrag Antworten über FIT-Connect anbieten soll.</small>
          </label>
        </div>
      </fieldset>
      <p v-if="wizardStep === 2 && kind === 'C'">
        Onlinedienst-Destinations vom Typ C benötigen keine Zertifikate oder dauerhaften Schlüssel. Prüfen Sie
        die Vorschau, bevor die Destination angelegt wird.
      </p>
      <fieldset v-show="wizardStep === 2 && kind === 'A'" data-setup-step="2" :disabled="disabled">
        <legend>Schlüssel und Kompatibilität</legend>
        <p>
          Ohne eigene Auswahl erzeugt die Vorbereitung zwei neue RSA-4096-Schlüssel mit selbstsignierten
          TEST-Zertifikaten: einen für Verschlüsselung und einen für Signaturen. Die Zertifikate gelten ein
          Jahr.
        </p>
        <p v-if="kind === 'C'" class="small-note">
          Onlinedienst-Destinations benötigen keine Zertifikate und keine dauerhaften Destination-Schlüssel.
          Die Verschlüsselung von Antworten wird später für jeden Antwortkanal automatisch eingerichtet.
        </p>
        <label for="setup-key-bundle">
          TEST-Schlüssel
          <select id="setup-key-bundle" v-model="selectedBundle">
            <option value="">Neue TEST-Schlüssel automatisch bereitstellen</option>
            <option v-for="item in available" :key="item.bundleId" :value="item.bundleId">
              Vorhandenes ungenutztes Paar · {{ item.encryption.kid }}
            </option>
          </select>
        </label>
        <button type="button" class="button secondary" :disabled="disabled" @click="loadBundles">
          Gespeicherte TEST-Schlüssel laden
        </button>
        <label class="checkbox-label">
          <input v-model="compatible" type="checkbox" />
          Auch kompatible Tests mit API v2 ermöglichen (Metadaten 2.0.0 zusätzlich zu 3.0.0)
        </label>
      </fieldset>
      <div class="client-actions">
        <button
          v-if="wizardStep !== 0"
          type="button"
          class="button secondary"
          :disabled="disabled"
          @click="wizardStep = steps[steps.indexOf(wizardStep) - 1]"
        >
          Zurück
        </button>
        <button ref="prepareButton" class="button" type="submit" :disabled="disabled">
          {{ wizardStep === 2 ? 'Destination vorbereiten' : 'Weiter' }}
        </button>
      </div>
    </form>
    <p v-if="working" role="status">
      Vorbereitung oder Prüfung läuft … Die Schlüsselerzeugung kann einen Moment dauern.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section v-if="outcome" aria-labelledby="destination-setup-result">
      <h3 id="destination-setup-result" ref="resultHeading" tabindex="-1">
        {{
          outcome.status === 'confirmed'
            ? outcome.bundleId
              ? 'Destination und Schlüsselzuordnung geprüft'
              : 'Destination-Angaben geprüft'
            : outcome.status === 'uncertain'
              ? 'Anlageausgang ungeklärt'
              : 'Destination nicht vollständig angelegt'
        }}
      </h3>
      <p v-if="outcome.destinationId">
        Destination ID:
        <code>{{ outcome.destinationId }}</code>
      </p>
      <p v-if="outcome.status === 'confirmed'">
        Die Angaben wurden anhand der eigenen API geprüft.
        <span v-if="outcome.bundleId">
          Auch die öffentlichen Schlüssel stimmen mit dem gesicherten Paar überein.
        </span>
        Die Aktivierung wird separat bestätigt.
      </p>
      <p v-else-if="outcome.status === 'uncertain'">
        Die Anlage kann bereits erfolgt sein. Bitte keinen neuen Anlageversuch starten. Laden Sie die eigenen
        Destinations und prüfen Sie den vorhandenen Eintrag.
        <span v-if="outcome.bundleId">
          Ordnen Sie sie unten ihrem gesicherten Schlüsselpaar zu. Die privaten Schlüssel bleiben gespeichert.
        </span>
        <span v-else>
          Eine bekannte Destination ID kann unten erneut gelesen werden. Ohne bekannte ID erst die eigene
          Destination-Liste prüfen.
        </span>
      </p>
      <p v-else>
        {{
          outcome.httpStatus === 400 || outcome.httpStatus === 422
            ? 'TEST hat die Angaben abgelehnt. Bitte Pflichtfelder, Schemata und die erlaubte Verwendung des Clients prüfen.'
            : explain(outcome.error)
        }}
        <span v-if="outcome.httpStatus">(HTTP {{ outcome.httpStatus }})</span>
      </p>
      <div v-if="outcome.status === 'confirmed'" class="client-actions">
        <button
          type="button"
          class="button"
          :disabled="disabled"
          @click="emit('created', outcome.destinationId)"
        >
          Destination ansehen und Aktivierung vorbereiten
        </button>
        <button
          v-if="outcome.bundleId"
          type="button"
          class="button secondary"
          :disabled="disabled"
          @click="loadKeys"
        >
          Schlüssel laden und zum Empfang wechseln
        </button>
        <button type="button" class="button secondary" :disabled="disabled" @click="outcome = null">
          Weitere TEST-Destination vorbereiten
        </button>
      </div>
    </section>
    <form
      v-if="
        unresolved.length ||
        (outcome?.status === 'uncertain' && outcome.bundleId === null && outcome.destinationId)
      "
      @submit.prevent="reconcile"
    >
      <h3>Ungeklärte Anlage zuordnen</h3>
      <p>
        Diese Prüfung liest nur die vorhandene eigene Destination und ihre Schlüssel. Sie legt keine weitere
        Destination an.
      </p>
      <div class="client-fields">
        <label v-if="unresolved.length && outcome?.bundleId !== null" for="setup-unresolved">
          Gespeichertes Schlüsselpaar
          <select id="setup-unresolved" v-model="unresolvedBundle" required :disabled="disabled">
            <option value="">Bitte auswählen</option>
            <option v-for="item in unresolved" :key="item.bundleId" :value="item.bundleId">
              {{ item.encryption.kid }}
            </option>
          </select>
        </label>
        <label for="setup-known-destination">
          Vorhandene Destination ID
          <input
            id="setup-known-destination"
            v-model="knownDestination"
            required
            maxlength="36"
            :disabled="disabled"
          />
        </label>
      </div>
      <button type="submit" class="button secondary" :disabled="disabled">
        Vorhandene Destination prüfen und zuordnen
      </button>
    </form>
    <dialog
      v-if="prepared"
      ref="dialog"
      class="tool-dialog receipt-dialog"
      aria-labelledby="destination-create-confirm-title"
      @cancel.prevent="dismiss"
    >
      <h2 id="destination-create-confirm-title">Diese Destination in TEST anlegen?</h2>
      <dl class="receipt-dialog-context">
        <dt>Name</dt>
        <dd>{{ prepared.configuration.name }}</dd>
        <dt>Organisation</dt>
        <dd>{{ prepared.configuration.contactInformation.legalName }}</dd>
        <dt>Kontakt</dt>
        <dd>{{ prepared.configuration.contactInformation.email }}</dd>
        <dt>Typ</dt>
        <dd>{{ prepared.configuration.type === 'A' ? 'Fachverfahren / Behörde' : 'Onlinedienst' }}</dd>
        <dt>Status</dt>
        <dd>Vorbereitet. Noch nicht aktiv</dd>
        <template v-if="prepared.configuration.type === 'A'">
          <dt>Verschlüsselungsschlüssel</dt>
          <dd>
            <code>{{ prepared.keys.encryption.kid }}</code>
          </dd>
        </template>
        <template v-else>
          <dt>Verschlüsselung</dt>
          <dd>
            Onlinedienste verwenden eigene Antwortschlüssel je Antwortkanal. Kein
            Destination-Verschlüsselungsschlüssel wird registriert.
          </dd>
        </template>
        <template v-if="prepared.keys">
          <dt>Signaturschlüssel</dt>
          <dd>
            <code>{{ prepared.keys.signing.kid }}</code>
          </dd>
        </template>
      </dl>
      <p v-if="!prepared.keys">
        Typ C benötigt keine Zertifikate oder dauerhaften Schlüssel. Antwortschlüssel entstehen erst je
        Antwortkanal. Die Vorschau gilt zwei Minuten.
      </p>
      <p v-if="prepared.keys">
        Die privaten Schlüssel sind im Windows-Profil gesichert. Es werden ausschließlich öffentliche
        Schlüssel übertragen. Die Vorschau gilt zwei Minuten.
      </p>
      <details>
        <summary>Vollständige öffentliche Konfiguration</summary>
        <pre>{{ JSON.stringify(prepared.configuration, null, 2) }}</pre>
      </details>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="client-actions">
        <button type="button" class="button secondary" autofocus :disabled="working" @click="dismiss">
          Abbrechen
        </button>
        <button type="button" class="button" :disabled="working" @click="confirm">
          Destination jetzt auf TEST anlegen
        </button>
      </div>
    </dialog>
  </section>
</template>
