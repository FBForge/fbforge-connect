<script setup>
import { useEnvironment } from '../environments.js';
const environment = useEnvironment();
import AppIcon from '../AppIcon.vue';
import CopyValue from '../CopyValue.vue';
import FileDropInput from '../FileDropInput.vue';
import SavedProfiles from './SavedProfiles.vue';
import ProfileDefaults from '../ProfileDefaults.vue';
import KeyInventory from '../KeyInventory.vue';
const props = defineProps({ apiVersion: String, connection: Object });
const emit = defineEmits(['fatal', 'busy', 'keys-changed']);
const fatal = (cause) => emit('fatal', cause);
const resourceBusy = (value) => emit('busy', value);
const {
  busy,
  pendingAction,
  error,
  clientId,
  clientSecret,
  rememberProfile,
  profileName,
  profiles,
  storageStatus,
  profileError,
  profileNotice,
  forgetCandidate,
  forgetDialog,
  defaultDestinations,
  activeSession,
  connectionDialog,
  sessionAction,
  connectionClosed,
  closeConnection,
  refreshProfiles,
  refreshStorageStatus,
  connectProfile,
  backupProfile,
  restoreProfileBackup,
  askRemoveProfile,
  removeProfile,
  retryProfileSave,
} = props.connection;
</script>
<template>
  <dialog
    ref="connectionDialog"
    class="tool-dialog connection-dialog"
    aria-labelledby="session-title"
    @cancel.prevent="closeConnection"
    @close="connectionClosed"
  >
    <div class="tool-section-heading">
      <div>
        <p class="workspace-eyebrow">FIT-Connect {{ environment }} · API {{ apiVersion }}</p>
        <h2 id="session-title">Verbindung verwalten</h2>
      </div>
      <button
        class="icon-button"
        type="button"
        :disabled="['open', 'check', 'close'].includes(pendingAction)"
        aria-label="Verbindungsdialog schließen"
        @click="closeConnection"
      >
        <AppIcon name="close" />
      </button>
    </div>
    <p>
      Die Verbindung gilt für alle Arbeitsbereiche. Ihre Zugangsdaten bestimmen die verfügbaren Funktionen.
    </p>
    <p>
      <span class="status-badge" :class="activeSession ? 'ok' : 'info'">
        {{
          ['open', 'check', 'close'].includes(pendingAction)
            ? 'Sitzungsaktion wird ausgeführt …'
            : activeSession
              ? 'Angemeldet'
              : 'Nicht verbunden'
        }}
      </span>
    </p>
    <p v-if="error" role="alert" class="status-badge error">{{ error }}</p>
    <section v-if="activeSession" class="connection-identity" aria-labelledby="connection-identity-title">
      <h3 id="connection-identity-title">
        {{
          profiles.find((profile) => profile.profileId === storageStatus?.profileId)?.name ||
          'Aktuelle Verbindung'
        }}
      </h3>
      <p>
        API {{ activeSession.apiVersion }} ·
        {{ storageStatus?.saved ? 'Geschütztes Profil' : 'Nur in dieser Sitzung' }}
      </p>
      <p v-if="activeSession.clientId">
        <strong>Client-ID</strong>
        <CopyValue :value="activeSession.clientId" label="Client-ID" />
      </p>
    </section>
    <form @submit.prevent="sessionAction('open')" autocomplete="off">
      <div class="client-fields">
        <label for="client-id">
          Client-ID
          <input
            id="client-id"
            v-model="clientId"
            type="text"
            maxlength="512"
            autocomplete="off"
            :disabled="busy"
            required
          />
        </label>
        <label for="client-secret">
          Client-Secret
          <input
            id="client-secret"
            v-model="clientSecret"
            type="password"
            maxlength="8192"
            autocomplete="off"
            :disabled="busy"
            required
          />
        </label>
      </div>
      <label class="checkbox-label">
        <input v-model="rememberProfile" type="checkbox" :disabled="busy" />
        Zugangsdaten und Testschlüssel auf diesem Windows-Benutzerkonto geschützt speichern
      </label>
      <label v-if="rememberProfile" for="profile-name">
        Profilname
        <input
          id="profile-name"
          v-model="profileName"
          maxlength="80"
          required
          :disabled="busy"
          placeholder="Zum Beispiel: Testarbeitsplatz Bauamt"
        />
      </label>
      <p class="small-note">
        Ohne Speichern gelten Zugangsdaten und Schlüssel nur für diese Sitzung. Mit Speichern bleiben auch
        Antwortschlüssel für spätere Replies erhalten. Windows schützt sie für Ihr Benutzerkonto.
        Zugangstokens werden nicht gespeichert. Das Secret wird nach der Übergabe aus dem Eingabefeld geleert.
      </p>
      <div class="client-actions">
        <button class="button" type="submit" :disabled="busy || !clientId.trim() || !clientSecret.trim()">
          {{ activeSession ? 'Mit anderen Zugangsdaten anmelden' : 'Anmelden' }}
        </button>
        <button
          v-if="activeSession"
          class="button secondary"
          type="button"
          :disabled="busy || !activeSession"
          @click="sessionAction('check')"
        >
          Sitzung prüfen
        </button>
        <button
          v-if="activeSession"
          class="button secondary"
          type="button"
          :disabled="busy || !activeSession"
          @click="sessionAction('close')"
        >
          Abmelden
        </button>
      </div>
    </form>
    <section v-if="profiles.length" aria-labelledby="saved-profiles-title">
      <h3 id="saved-profiles-title">Gespeicherte Profile für {{ environment }}</h3>
      <SavedProfiles
        :profiles="profiles"
        :api-version="apiVersion"
        :active-profile-id="storageStatus?.profileId"
        :busy="busy"
        @connect="(profile, restoreKeys) => connectProfile(profile, restoreKeys)"
        @backup="backupProfile"
        @remove="askRemoveProfile"
        @fatal="fatal"
        @busy="resourceBusy"
        @updated="
          refreshProfiles();
          profileNotice = 'Profil gespeichert. Ein neues Secret gilt bei der nächsten Anmeldung.';
        "
      />
      <p class="small-note">
        „Nur Zugangsdaten verwenden“ öffnet eine Sitzung ohne gespeicherte Schlüssel und verändert deren
        Sicherung nicht.
      </p>
    </section>
    <ProfileDefaults
      v-if="storageStatus?.saved && defaultDestinations"
      :session="activeSession"
      :defaults="defaultDestinations"
      :busy="busy"
      @busy="resourceBusy"
      @fatal="fatal"
      @saved="
        (value) => {
          defaultDestinations = value;
        }
      "
    />
    <KeyInventory
      :session="activeSession"
      :busy="busy"
      @busy="resourceBusy"
      @fatal="fatal"
      @invalidate="
        emit('keys-changed');
        refreshProfiles();
        refreshStorageStatus();
      "
    />
    <details class="profile-backup">
      <summary>Geschützte Profilsicherung importieren</summary>
      <p>
        Eine Sicherung enthält Zugangsdaten und Schlüssel verschlüsselt mit Windows-Benutzerschutz. Sie ist
        kein Passwort-Export für andere Benutzerkonten oder Rechner. Bereits vorhandene Profile werden beim
        Import nicht überschrieben.
      </p>
      <button type="button" class="button secondary" :disabled="busy" @click="restoreProfileBackup">
        Geschützte Sicherung importieren
      </button>
      <FileDropInput
        id="profile-backup-file"
        label="Geschützte Profildatei"
        accept=".fctest-profile"
        :disabled="busy"
        @files="restoreProfileBackup"
      >
        Höchstens 8 MiB verschlüsselte Profildaten. Das ursprüngliche Windows-Benutzerkonto wird benötigt.
      </FileDropInput>
    </details>
    <p v-if="profileNotice" role="status">{{ profileNotice }}</p>
    <p v-if="profileError" role="alert">{{ profileError }}</p>
    <p v-if="storageStatus?.profileId" class="small-note">
      {{
        storageStatus.saved
          ? 'Diese Sitzung speichert Zugangsdaten und Schlüssel geschützt im gewählten Profil.'
          : 'Der aktuelle Schlüsselbestand konnte nicht gesichert werden. Bitte die Anwendung geöffnet lassen und erneut speichern.'
      }}
    </p>
    <button
      v-if="storageStatus?.error"
      type="button"
      class="button secondary"
      :disabled="busy"
      @click="retryProfileSave"
    >
      Schlüsselbestand erneut sichern
    </button>
    <p v-if="activeSession" class="small-note">
      Eine Sitzungsprüfung prüft die OAuth-Anmeldung. Zugriffsrechte werden beim jeweiligen Abruf geprüft.
    </p>
  </dialog>
  <dialog
    v-if="forgetCandidate"
    ref="forgetDialog"
    class="tool-dialog"
    aria-labelledby="forget-profile-title"
    @cancel.prevent="forgetCandidate = null"
  >
    <h2 id="forget-profile-title">Gespeichertes Profil entfernen?</h2>
    <p>
      „{{ forgetCandidate.name }}“ und seine gespeicherten Schlüssel werden von diesem Rechner entfernt.
      Aktuell geladene Sitzungsschlüssel bleiben bis zum Abmelden verfügbar.
    </p>
    <p>
      Dauerhaft gespeicherte Vorgangskopien dieses Profils werden ebenfalls gelöscht. Sitzungskopien bleiben
      bis zum Beenden der Anwendung erhalten.
    </p>
    <p>
      Ohne weitere Sicherung können spätere Antworten und bereits verschlüsselte Nachrichten unter Umständen
      nicht mehr entschlüsselt werden.
    </p>
    <div class="client-actions">
      <button
        type="button"
        class="button secondary"
        autofocus
        :disabled="busy"
        @click="forgetCandidate = null"
      >
        Abbrechen
      </button>
      <button type="button" class="button" :disabled="busy" @click="removeProfile(forgetCandidate)">
        Profil und gespeicherte Schlüssel entfernen
      </button>
    </div>
  </dialog>
</template>
