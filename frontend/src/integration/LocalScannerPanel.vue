<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { invoke } from '../native.js';
import { checkedLocalScanner, scannerError } from '../local-scanner.js';
const props = defineProps({ disabled: Boolean, connected: Boolean });
const emit = defineEmits(['changed', 'disable']);
const status = ref(null),
  error = ref(''),
  pending = ref(false);
let alive = true,
  reading = false,
  timer;
async function refresh() {
  if (reading || !alive) return;
  reading = true;
  try {
    const value = checkedLocalScanner(await invoke('local_scanner_status'));
    if (alive) status.value = value;
  } catch (cause) {
    if (alive) error.value = scannerError(cause);
  } finally {
    reading = false;
  }
}
async function run(command, args = {}) {
  if (pending.value || props.disabled || status.value?.busy) return;
  pending.value = true;
  error.value = '';
  try {
    const value = checkedLocalScanner(await invoke(command, args));
    if (alive) {
      status.value = value;
      emit('changed');
    }
  } catch (cause) {
    if (alive) error.value = scannerError(cause);
  } finally {
    if (alive) pending.value = false;
    await refresh();
  }
}
async function cancel() {
  try {
    await invoke('cancel_local_scanner_operation');
  } catch (cause) {
    error.value = scannerError(cause);
  }
}
const date = (value) => (value === null ? 'Unbekannt' : new Date(value * 1000).toLocaleString('de-DE'));
const progress = () =>
  status.value?.downloadTotalBytes
    ? Math.floor((status.value.downloadedBytes * 100) / status.value.downloadTotalBytes)
    : 0;
const operation = () =>
  ({
    initializing: 'Lokale Komponente wird geprüft',
    starting: 'Scanner wird gestartet',
    stopping: 'Scanner wird beendet',
    installing: 'Scanner wird installiert',
    downloading: 'Engine wird heruntergeladen',
    'updating-database': 'Signaturdatenbanken werden geprüft und aktualisiert',
    saving: 'Einstellung wird gespeichert',
  })[status.value?.operation] || 'Vorgang läuft';
onMounted(() => {
  void refresh();
  timer = setInterval(refresh, 1500);
});
onBeforeUnmount(() => {
  alive = false;
  clearInterval(timer);
});
</script>
<template>
  <section class="tool-section" aria-labelledby="local-scanner-title">
    <h3 id="local-scanner-title">Lokaler ClamAV</h3>
    <p>
      Optionale geprüfte Komponente für Windows x64. Der Scan läuft auf Ihrem Rechner. Die Engine und ihre
      Virensignaturen werden getrennt von FIT-Connect-Zugängen verwaltet.
    </p>
    <p v-if="status" role="status">
      <span
        class="status-badge"
        :class="status.busy ? 'info' : status.ready ? 'ok' : status.enabled ? 'warn' : 'info'"
      >
        {{
          status.busy
            ? operation()
            : status.ready
              ? 'Scanner bereit'
              : status.enabled
                ? 'Scanner nicht bereit'
                : 'Scanner ausgeschaltet'
        }}
      </span>
    </p>
    <dl v-if="status" class="key-value-list">
      <dt>Installation</dt>
      <dd>{{ status.installed ? `ClamAV ${status.engineVersion}` : 'Nicht installiert' }}</dd>
      <dt>Bereitschaft</dt>
      <dd>
        {{
          status.ready
            ? 'Scanner läuft lokal'
            : status.enabled
              ? 'Aktiviert, derzeit nicht betriebsbereit'
              : 'Lokaler Scanner ausgeschaltet'
        }}
      </dd>
      <dt>Signaturversion</dt>
      <dd>{{ status.databaseVersion ?? 'Keine geprüften Datenbanken verfügbar' }}</dd>
      <dt>Signaturdatum</dt>
      <dd>{{ date(status.databaseCreatedAt) }}</dd>
      <dt>Letzte erfolgreiche Aktualisierung</dt>
      <dd>{{ date(status.lastUpdate) }}</dd>
    </dl>
    <p v-if="status?.databaseAgeDays >= 7" role="status" class="action-notice warning">
      Der Signaturbestand ist {{ status.databaseAgeDays }} Tage alt. Aktualisieren Sie ihn online oder
      importieren Sie neuere offizielle Datenbanken. Kein Fund ist keine Sicherheitsgarantie.
    </p>
    <p v-if="status?.updateFailed" role="status">
      Die letzte Signaturaktualisierung ist fehlgeschlagen. Der bisherige Bestand wurde beibehalten.
    </p>
    <div v-if="pending || status?.busy" class="scan-progress" role="status">
      <strong>{{ status?.busy ? operation() : 'Aktion wird vorbereitet' }} …</strong>
      <progress v-if="status?.operation !== 'downloading'" aria-label="Scanner-Aktionsfortschritt"></progress>
      <p>
        Sie können weiterarbeiten. Solange der Scanner nicht bereit ist, wird keine erfolgreiche
        Inhaltsprüfung bestätigt.
      </p>
    </div>
    <progress
      v-if="status?.busy && status.operation === 'downloading'"
      :value="progress()"
      max="100"
      aria-label="Scanner-Downloadfortschritt"
    />
    <div class="client-actions">
      <button
        class="button secondary"
        type="button"
        :disabled="disabled || pending || status?.busy"
        @click="run('install_local_scanner', { online: true })"
      >
        Scanner online einrichten
      </button>
      <button
        class="button secondary"
        type="button"
        :disabled="disabled || pending || status?.busy"
        @click="run('install_local_scanner', { online: false })"
      >
        Lokales Scanner-Paket importieren
      </button>
      <button
        v-if="status?.installed"
        class="button secondary"
        type="button"
        :disabled="disabled || pending || status?.busy"
        @click="run('update_local_scanner_database', { offline: false })"
      >
        Signaturen aktualisieren
      </button>
      <button
        v-if="status?.installed"
        class="button secondary"
        type="button"
        :disabled="disabled || pending || status?.busy"
        @click="run('update_local_scanner_database', { offline: true })"
      >
        Signaturen aus Dateien importieren
      </button>
      <button
        v-if="status?.enabled"
        class="button secondary"
        type="button"
        :disabled="disabled || pending || status?.busy"
        @click="connected ? emit('disable') : run('stop_local_scanner')"
      >
        Lokalen Scanner beenden
      </button>
      <button v-if="status?.busy" class="button secondary" type="button" @click="cancel">
        Vorgang abbrechen
      </button>
    </div>
    <label v-if="status?.installed" class="switch">
      <input
        type="checkbox"
        :checked="status.automaticUpdates"
        :disabled="disabled || pending || status.busy"
        @change="run('local_scanner_preferences', { automaticUpdates: $event.target.checked })"
      />
      <span>Offizielle Signaturen beim App-Start höchstens einmal täglich online aktualisieren</span>
    </label>
    <p class="small-note">
      Offline-Import benötigt main.cvd, daily.cvd und bytecode.cvd sowie die jeweils zugehörige .sign-Datei.
      Herkunft und Signaturen werden geprüft. Ältere Datenbanken ersetzen keinen neueren Bestand.
    </p>
    <p v-if="error || status?.error" class="action-notice error" role="alert">
      {{ error || scannerError(status.error) }}
    </p>
  </section>
</template>

<style scoped>
.key-value-list {
  display: grid;
  grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr);
  gap: 10px 20px;
  max-width: 56rem;
  margin-block: 20px;
}
.key-value-list dt,
.key-value-list dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.key-value-list dt {
  color: var(--muted);
}
@media (max-width: 600px) {
  .key-value-list {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .key-value-list dd {
    margin-bottom: 10px;
  }
}
</style>
