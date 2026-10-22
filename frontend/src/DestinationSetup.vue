<script setup>
import CertifiedKeyImport from './destinations/CertifiedKeyImport.vue';
import { useEnvironment } from './environments.js';
const environment = useEnvironment();
import { demoSchemas, downloadDemoSchema } from './demo-data.js';
import { useDestinationSetup } from './destinations/useDestinationSetup.js';
const props = defineProps({ session: Object, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'created', 'changed', 'receive']);
const controller = useDestinationSetup(props, emit);
const {
  wizardStep,
  form,
  stepNotice,
  steps,
  stepTitles,
  name,
  legalName,
  email,
  address,
  phone,
  kind,
  addressing,
  service,
  regions,
  model,
  message,
  schema,
  mime,
  replySchema,
  compatible,
  selectedBundle,
  unresolvedBundle,
  knownDestination,
  prepared,
  outcome,
  working,
  error,
  notice,
  dialog,
  prepareButton,
  resultHeading,

  locked,
  disabled,
  available,
  unresolved,
  explain,
  revealInvalid,
  submitStep,
  loadBundles,

  dismiss,
  confirm,
  reconcile,
  loadKeys,
} = controller;
</script>

<template>
  <section class="tool-section" aria-labelledby="destination-setup-title" :aria-busy="working">
    <p class="workspace-eyebrow">FIT-Connect {{ environment }}</p>
    <h2 id="destination-setup-title">Eigene Destination anlegen</h2>
    <p>
      Eine Destination ist die Adresse Ihrer Testanwendung bei FIT-Connect. Sie benötigen ein Konto der
      gewählten Umgebung mit Berechtigung für die Destination API und ein gespeichertes Windows-Profil.
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
        <CertifiedKeyImport
          v-if="environment !== 'TEST'"
          :session="session"
          :busy="disabled"
          @busy="emit('busy', $event)"
          @fatal="emit('fatal', $event)"
          @imported="loadBundles"
        />
        <p v-if="environment === 'TEST'">
          Ohne eigene Auswahl erzeugt die Vorbereitung zwei neue RSA-4096-Schlüssel mit selbstsignierten
          TEST-Zertifikaten: einen für Verschlüsselung und einen für Signaturen. Die Zertifikate gelten ein
          Jahr.
        </p>
        <p v-if="kind === 'C'" class="small-note">
          Onlinedienst-Destinations benötigen keine Zertifikate und keine dauerhaften Destination-Schlüssel.
          Die Verschlüsselung von Antworten wird später für jeden Antwortkanal automatisch eingerichtet.
        </p>
        <label for="setup-key-bundle">
          Schlüsselpaar
          <select id="setup-key-bundle" v-model="selectedBundle">
            <option value="">
              {{
                environment === 'TEST'
                  ? 'Neue TEST-Schlüssel automatisch bereitstellen'
                  : 'Bitte importiertes V-PKI-Schlüsselpaar wählen'
              }}
            </option>
            <option v-for="item in available" :key="item.bundleId" :value="item.bundleId">
              Vorhandenes ungenutztes Paar · {{ item.encryption.kid }}
            </option>
          </select>
        </label>
        <button type="button" class="button secondary" :disabled="disabled" @click="loadBundles">
          Gespeicherte Schlüssel laden
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
            ? 'FIT-Connect hat die Angaben abgelehnt. Bitte Pflichtfelder, Schemata und die erlaubte Verwendung des Clients prüfen.'
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
          Weitere Destination vorbereiten
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
      <h2 id="destination-create-confirm-title">Diese Destination anlegen?</h2>
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
          Destination jetzt anlegen
        </button>
      </div>
    </dialog>
  </section>
</template>
