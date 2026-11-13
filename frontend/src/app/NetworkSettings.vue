<script setup>
import NetworkCertificates from './NetworkCertificates.vue';
import { ref, computed, onMounted } from 'vue';
import { invoke } from '../native.ts';
const props = defineProps({ busy: Boolean });
const emit = defineEmits(['changed', 'busy']);
const settings = ref({
  mode: 'system',
  host: '',
  port: 8080,
  username: '',
  password: null,
  trustedCertificates: [],
});
const certificateInfo = ref([]),
  certificateBusy = ref(false);
const hasPassword = ref(false),
  loading = ref(true),
  working = ref(false),
  error = ref(''),
  notice = ref('');
const dialog = ref(null);
const locked = computed(() => loading.value || working.value || props.busy);
onMounted(async () => {
  try {
    const value = await invoke('network_settings');
    hasPassword.value = value.hasPassword;
    certificateInfo.value = value.trustedCertificates || [];
    settings.value = {
      mode: value.mode,
      host: value.host,
      port: value.port || 8080,
      username: value.username,
      password: null,
      trustedCertificates: certificateInfo.value.map((info) => info.der),
    };
  } catch {
    error.value =
      'Die Netzwerkeinstellungen konnten nicht gelesen werden. Prüfen und speichern Sie die gewünschte Verbindung erneut.';
  } finally {
    loading.value = false;
  }
});
async function save() {
  if (locked.value || certificateBusy.value) return;
  working.value = true;
  emit('busy', true);
  error.value = '';
  notice.value = '';
  dialog.value.close();
  try {
    await invoke('save_network_settings', { settings: settings.value });
    if (settings.value.password !== null) hasPassword.value = Boolean(settings.value.password);
    settings.value.password = null;
    emit('changed');
    notice.value = 'Netzwerkeinstellungen gespeichert. Verbinden Sie Ihr Profil erneut.';
  } catch (cause) {
    if (cause === 'engine_disconnected') emit('changed');
    error.value =
      'Netzwerkeinstellungen konnten nicht übernommen werden. Prüfen Sie Proxy-Adresse und Port und schließen Sie laufende Aktionen ab.';
  } finally {
    working.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <section class="tool-section" aria-labelledby="network-settings-title" :aria-busy="loading">
    <h2 id="network-settings-title">Netzwerk und Proxy</h2>
    <p>
      Die Verbindung gilt für FIT-Connect, die SDKs, öffentliche Schemaquellen, FIM-Leistungsnamen, Updates
      und Scanner-Downloads. Lokale Scanner bleiben direkt erreichbar.
    </p>
    <label>
      Verbindung
      <select aria-label="Verbindung" v-model="settings.mode" :disabled="locked">
        <option value="system">Systemeinstellungen verwenden</option>
        <option value="direct">Direkt verbinden</option>
        <option value="manual">Eigenen HTTP-Proxy verwenden</option>
      </select>
    </label>
    <template v-if="settings.mode === 'manual'">
      <div class="settings-fields">
        <label>
          Proxy-Host
          <input
            v-model.trim="settings.host"
            :disabled="locked"
            placeholder="proxy.example.de"
            autocomplete="off"
          />
        </label>
        <label>
          Port
          <input v-model.number="settings.port" type="number" min="1" max="65535" :disabled="locked" />
        </label>
      </div>
      <div class="settings-fields">
        <label>
          Benutzername (optional)
          <input v-model="settings.username" :disabled="locked" autocomplete="off" />
        </label>
        <label>
          Passwort (optional)
          <input
            type="password"
            :value="settings.password || ''"
            :placeholder="
              hasPassword && settings.password === null ? 'Gespeichertes Passwort beibehalten' : ''
            "
            :disabled="locked"
            autocomplete="new-password"
            @input="settings.password = $event.target.value"
          />
        </label>
      </div>
      <p class="small-note">
        Der Proxy muss HTTPS-Tunnel unterstützen. Ein gespeichertes Passwort bleibt verschlüsselt im
        Windows-Benutzerkonto. Es wird nicht zurück an die Oberfläche übertragen.
      </p>
    </template>
    <NetworkCertificates
      v-model="settings.trustedCertificates"
      :initial="certificateInfo"
      :disabled="locked"
      @busy="certificateBusy = $event"
    />
    <div class="client-actions">
      <button class="button secondary" :disabled="locked || certificateBusy" @click="dialog.showModal()">
        Netzwerkeinstellungen übernehmen
      </button>
    </div>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <dialog ref="dialog" class="tool-dialog" aria-labelledby="network-change-title">
      <h2 id="network-change-title">Verbindung neu einrichten?</h2>
      <p>
        Die vorgemerkten Proxy- und CA-Einstellungen werden für diese Anwendung übernommen. Offene
        Verbindungen werden beendet. Sichern Sie offene Entwürfe vorher. Gespeicherte Profile und Vorgänge
        bleiben erhalten.
      </p>
      <div class="client-actions">
        <button class="button secondary" autofocus @click="dialog.close()">Abbrechen</button>
        <button class="button" :disabled="locked" @click="save">Übernehmen und trennen</button>
      </div>
    </dialog>
  </section>
</template>
