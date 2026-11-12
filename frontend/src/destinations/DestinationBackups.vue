<script setup>
import { ref, watch, nextTick } from 'vue';
import { useDestinationBackups } from './useDestinationBackups.js';
const props = defineProps({
  session: Object,
  busy: Boolean,
  captureDestination: Object,
  canManage: { type: Boolean, default: true },
});
const emit = defineEmits(['back', 'create', 'edit', 'busy', 'activity', 'fatal', 'changed', 'receive']);
const c = useDestinationBackups(props, emit);
const {
  items,
  selected,
  detail,
  pending,
  task,
  name,
  password,
  repeated,
  target,
  useKeys,
  error,
  notice,
  profileMissing,
  disabled,
  reusable,
  select,
  capture,
  create,
  edit,
  transfer,
  remove,
  restore,
  chooseTask,
} = c;
const detailHeading = ref(null),
  taskForm = ref(null);
watch(detail, async (value) => {
  if (value) {
    await nextTick();
    detailHeading.value?.focus();
    detailHeading.value?.scrollIntoView({ block: 'start' });
  }
});
watch(task, async (value) => {
  await nextTick();
  const target = value ? taskForm.value : detailHeading.value;
  if (value) target?.querySelector('input:not(:disabled), button:not(:disabled)')?.focus();
  else target?.focus();
  target?.scrollIntoView({ block: 'start' });
});
</script>
<template>
  <section class="tool-section" aria-labelledby="destination-backups-title" :aria-busy="pending">
    <button type="button" class="button secondary" :disabled="busy || pending" @click="emit('back')">
      Zur Destination-Übersicht
    </button>
    <h2 id="destination-backups-title">Zustellpunkt-Sicherungen</h2>
    <p>
      Konfiguration und verfügbare Schlüssel sichern, auf einen anderen Rechner übertragen und erneut
      verwenden.
    </p>
    <p v-if="session?.apiVersion !== 'v3'" role="status">
      Für Zustellpunkt-Sicherungen bitte eine API-v3-Verbindung öffnen.
    </p>
    <p v-else-if="profileMissing" role="status">
      Verbinden Sie ein gespeichertes Windows-Profil. Darin werden die Sicherungen geschützt und dauerhaft
      gespeichert.
    </p>
    <template v-else>
      <p v-if="!canManage" role="status">
        Diese Verbindung erlaubt das Sichern und Exportieren. Zum Anlegen oder Ändern wird die Berechtigung
        manage-destinations benötigt.
      </p>
      <form v-if="captureDestination && !detail" @submit.prevent="capture">
        <fieldset :disabled="disabled">
          <legend>{{ captureDestination.name || captureDestination.destinationId }} sichern</legend>
          <label>
            Sicherungsname
            <input v-model="name" required maxlength="160" />
          </label>
          <p class="small-note">
            Die Konfiguration und öffentlichen Schlüssel werden frisch aus der eigenen Destination API
            gelesen. Private Schlüssel werden ergänzt, soweit sie im verbundenen Profil oder seiner Sitzung
            vorhanden sind. Zugangsdaten und Antragsinhalte gehören nicht zur Sicherung.
          </p>
          <button class="button" type="submit">Sicherung im Profil speichern</button>
        </fieldset>
      </form>
      <div class="client-actions">
        <button type="button" class="button secondary" :disabled="disabled" @click="chooseTask('import')">
          Sicherung importieren
        </button>
      </div>
      <label v-if="items.length">
        <span id="destination-backup-picker-label">Gespeicherte Sicherung</span>
        <select
          aria-labelledby="destination-backup-picker-label"
          v-model="selected"
          :disabled="disabled"
          @change="select"
        >
          <option value="">Bitte auswählen</option>
          <option v-for="item in items" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <p v-else-if="!pending && !captureDestination">
        In diesem Profil sind noch keine Zustellpunkt-Sicherungen gespeichert. Öffnen Sie eine eigene
        Destination und wählen Sie „Zustellpunkt sichern“.
      </p>
      <section v-if="detail" aria-labelledby="destination-backup-detail">
        <h3 id="destination-backup-detail" ref="detailHeading" tabindex="-1">{{ detail.summary.name }}</h3>
        <dl class="receipt-dialog-context">
          <dt>Ursprungsdestination</dt>
          <dd>
            <code>{{ detail.summary.sourceDestinationId }}</code>
          </dd>
          <dt>Aufgenommen</dt>
          <dd>
            {{ new Date(detail.summary.capturedAt).toLocaleString('de-DE') }} ·
            {{ detail.summary.environment }}
          </dd>
          <dt>Private Schlüssel</dt>
          <dd>
            <span :class="['status-badge', detail.summary.complete ? 'ok' : 'warn']">
              {{ detail.summary.privateKeyCount }} von {{ detail.summary.registeredKeyCount }} gesichert
            </span>
          </dd>
        </dl>
        <p v-if="detail.summary.missingKeys.length" class="small-note">
          Private Schlüssel fehlen für:
          <code v-for="key in detail.summary.missingKeys" :key="key">{{ key }}</code>
          . Diese kann FIT-Connect nicht nachliefern.
        </p>
        <p v-if="detail.summary.callbackSecretMissing" class="small-note">
          Die Callback-Adresse ist enthalten. Das zugehörige Secret ist über die API nicht lesbar und muss
          beim Übernehmen neu vergeben werden.
        </p>
        <div class="client-actions">
          <button
            type="button"
            class="button"
            :disabled="disabled || !reusable || !canManage"
            @click="chooseTask('create')"
          >
            Neue Destination daraus anlegen
          </button>
          <button
            type="button"
            class="button secondary"
            :disabled="disabled || !reusable || !canManage"
            @click="chooseTask('edit')"
          >
            Auf bestehende Destination anwenden
          </button>
          <button type="button" class="button secondary" :disabled="disabled" @click="chooseTask('export')">
            Sicherung exportieren
          </button>
        </div>
        <p v-if="!reusable" role="status">
          Diese Konfiguration lässt sich vollständig sichern und exportieren. Typ B oder ältere
          Angebotsformate kann der aktuelle Anlagen- und Bearbeitungsassistent noch nicht übernehmen.
        </p>
        <form v-if="task === 'create'" ref="taskForm" @submit.prevent="create">
          <fieldset :disabled="disabled">
            <legend>Neue Destination vorbereiten</legend>
            <p>
              Die neue Destination erhält eine neue ID und bleibt zunächst in Vorbereitung. Alle Leistungen
              und Schemata werden zur Bearbeitung übernommen. Die Aktivierung erfolgt separat.
            </p>
            <template v-if="detail.configuration.type !== 'C'">
              <label class="checkbox-label">
                <input v-model="useKeys" type="checkbox" :disabled="!detail.summary.canReuseKeys" />
                Gesichertes Schlüsselpaar für die neue Destination verwenden
              </label>
              <p class="small-note">
                Ohne Auswahl werden neue TEST-Schlüssel erzeugt oder eigene V-PKI-Schlüssel gewählt. Bei
                Wiederverwendung bleiben die Zertifikatslaufzeiten bestehen.
              </p>
            </template>
            <button type="submit" class="button">Anlageassistent öffnen</button>
          </fieldset>
        </form>
        <form v-if="task === 'edit'" ref="taskForm" @submit.prevent="edit">
          <fieldset :disabled="disabled">
            <legend>Bestehende Destination bearbeiten</legend>
            <label>
              Ziel-Destination-ID
              <input v-model="target" required maxlength="36" pattern="[0-9a-fA-F-]{36}" />
            </label>
            <p class="small-note">
              Die Ziel-Destination muss zu den angemeldeten Zugangsdaten gehören. Sie prüfen die übernommenen
              Felder vor der Änderung. Status und Schlüsselregistrierung bleiben separate Aktionen.
            </p>
            <button type="submit" class="button">Bearbeitung mit Sicherung öffnen</button>
          </fieldset>
        </form>
        <details>
          <summary>Gesicherte Konfiguration anzeigen</summary>
          <pre>{{ JSON.stringify(detail.snapshot, null, 2) }}</pre>
        </details>
        <div class="client-actions">
          <button
            v-if="detail.summary.privateKeyCount"
            type="button"
            class="button secondary"
            :disabled="disabled"
            @click="restore"
          >
            Schlüssel für Ursprungsdestination laden
          </button>
          <button type="button" class="button secondary" :disabled="disabled" @click="chooseTask('delete')">
            Lokale Sicherung löschen
          </button>
        </div>
        <div v-if="task === 'delete'" ref="taskForm" class="notice warning">
          <p>
            Diese lokale Sicherung einschließlich ihrer Schlüsselkopien löschen? Die Destination und die
            aktuell verwendeten Profilschlüssel bleiben erhalten.
          </p>
          <div class="client-actions">
            <button type="button" class="button secondary" :disabled="disabled" @click="chooseTask('')">
              Abbrechen
            </button>
            <button type="button" class="button" :disabled="disabled" @click="remove">
              Sicherung jetzt löschen
            </button>
          </div>
        </div>
      </section>
      <form v-if="['export', 'import'].includes(task)" ref="taskForm" @submit.prevent="transfer">
        <fieldset :disabled="disabled">
          <legend>
            {{
              task === 'export' ? 'Passwortverschlüsselt exportieren' : 'Verschlüsselte Sicherung importieren'
            }}
          </legend>
          <p class="small-note">
            Die Datei ist auch auf anderen Rechnern verwendbar und enthält die gesicherten privaten Schlüssel.
            Das Passwort wird nicht gespeichert. Der Import legt eine eigene Kopie an.
          </p>
          <div class="client-fields">
            <div>
              <label for="destination-backup-password">Dateipasswort</label>
              <input
                id="destination-backup-password"
                aria-describedby="destination-backup-password-hint"
                v-model="password"
                type="password"
                required
                minlength="12"
                maxlength="1024"
                :autocomplete="task === 'export' ? 'new-password' : 'off'"
              />
              <small id="destination-backup-password-hint">Mindestens 12 Zeichen.</small>
            </div>
            <label v-if="task === 'export'">
              Passwort wiederholen
              <input
                v-model="repeated"
                type="password"
                required
                minlength="12"
                maxlength="1024"
                autocomplete="new-password"
              />
            </label>
          </div>
          <div class="client-actions">
            <button type="button" class="button secondary" @click="chooseTask('')">Abbrechen</button>
            <button type="submit" class="button">
              {{ task === 'export' ? 'Datei speichern' : 'Datei auswählen und importieren' }}
            </button>
          </div>
        </fieldset>
      </form>
    </template>
    <p v-if="pending" role="status">Sicherungsaktion läuft …</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
