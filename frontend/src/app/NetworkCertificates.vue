<script setup>
import { ref, computed } from 'vue';
import FileDropInput from '../FileDropInput.vue';
import { invoke } from '../native.ts';
const roots = defineModel({ type: Array, required: true });
const props = defineProps({ initial: Array, disabled: Boolean });
const emit = defineEmits(['busy']);
const preview = ref(null),
  imported = ref([]),
  pending = ref(false),
  error = ref('');
const certificates = computed(() =>
  roots.value
    .map((der) => [...(props.initial || []), ...imported.value].find((info) => info.der === der))
    .filter(Boolean),
);
const date = (timestamp) => new Date(timestamp * 1000).toLocaleDateString('de-DE');
async function files(value) {
  if (!value[0] || pending.value || props.disabled) return;
  pending.value = true;
  emit('busy', true);
  error.value = '';
  preview.value = null;
  try {
    if (value[0].size > 48 * 1024) throw 'network_certificate_limit';
    const bytes = new Uint8Array(await value[0].arrayBuffer());
    let content = '';
    try {
      for (let start = 0; start < bytes.length; start += 12000)
        content += String.fromCharCode(...bytes.subarray(start, start + 12000));
    } finally {
      bytes.fill(0);
    }
    const info = await invoke('inspect_network_certificate', { content: btoa(content) });
    if (!info || typeof info.der !== 'string' || !/^[A-F0-9]{64}$/.test(info.fingerprint) || !info.active)
      throw 'network_certificate_invalid';
    if (roots.value.includes(info.der)) {
      error.value = 'Dieses Zertifikat ist bereits vorgemerkt.';
      return;
    }
    preview.value = info;
  } catch (cause) {
    error.value =
      cause === 'network_certificate_expired'
        ? 'Das CA-Zertifikat ist abgelaufen oder noch nicht gültig. Fordern Sie ein aktuelles Zertifikat bei Ihrer IT an.'
        : 'Das Zertifikat konnte nicht übernommen werden. Wählen Sie genau ein öffentliches CA-Zertifikat als PEM oder DER. Private Schlüssel und Serverzertifikate sind nicht zulässig.';
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
function add() {
  if (preview.value && roots.value.length < 8) {
    roots.value = [...roots.value, preview.value.der];
    imported.value.push(preview.value);
    preview.value = null;
  }
}
</script>
<template>
  <details>
    <summary>Zusätzliche CA-Zertifikate für Firmennetzwerke ({{ roots.length }})</summary>
    <p class="small-note">
      Nur erforderlich, wenn Ihre IT HTTPS-Verbindungen mit einer eigenen Zertifizierungsstelle prüft. Die
      Freigabe gilt ausschließlich für FBForge Connect und seine Downloads. Der Windows-Zertifikatsspeicher
      und die Prüfung von Virensignaturen werden dadurch nicht geändert.
    </p>
    <ul v-if="certificates.length" class="network-certificate-list">
      <li v-for="cert in certificates" :key="cert.der">
        <strong>{{ cert.subject }}</strong>
        <span class="small-note">
          {{ date(cert.validFrom) }} bis {{ date(cert.validUntil) }} ·
          {{ cert.active ? 'Gültig' : 'Abgelaufen oder noch nicht gültig. Wird nicht verwendet.' }}
        </span>
        <code>{{ cert.fingerprint }}</code>
        <button
          class="button secondary"
          :aria-label="`Entfernen vormerken: ${cert.subject}`"
          :disabled="disabled || pending"
          @click="roots = roots.filter((root) => root !== cert.der)"
        >
          Entfernen vormerken
        </button>
      </li>
    </ul>
    <FileDropInput
      id="network-ca-file"
      label="Öffentliches CA-Zertifikat auswählen"
      accept=".pem,.crt,.cer,.der"
      :disabled="disabled || pending || roots.length >= 8"
      @files="files"
    />
    <p v-if="pending" role="status">Zertifikat wird geprüft …</p>
    <section v-if="preview" class="network-certificate-preview" aria-label="Zertifikat vor Freigabe prüfen">
      <strong>{{ preview.subject }}</strong>
      <p>{{ date(preview.validFrom) }} bis {{ date(preview.validUntil) }}</p>
      <p>SHA-256-Fingerabdruck</p>
      <code>{{ preview.fingerprint }}</code>
      <p class="small-note">
        Vergleichen Sie diesen Fingerabdruck über einen unabhängigen Weg mit Ihrer IT. Diese CA kann
        HTTPS-Gegenstellen für FBForge Connect beglaubigen.
      </p>
      <div class="client-actions">
        <button class="button secondary" :disabled="disabled || pending" @click="add">
          Zertifikat vormerken
        </button>
        <button class="button secondary" :disabled="disabled || pending" @click="preview = null">
          Verwerfen
        </button>
      </div>
    </section>
    <p class="small-note">
      Höchstens acht zusätzliche CA-Zertifikate. Vorgemerkte Änderungen werden erst mit „Netzwerkeinstellungen
      übernehmen“ aktiv. Die normalen Vertrauensanker und die Prüfung des Hostnamens bleiben erhalten.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>
<style scoped>
.network-certificate-list {
  list-style: none;
  padding: 0;
}
.network-certificate-list li,
.network-certificate-preview {
  display: grid;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
code {
  overflow-wrap: anywhere;
  white-space: normal;
}
.network-certificate-list button {
  justify-self: start;
}
</style>
