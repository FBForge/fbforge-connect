<script setup>
import { ref } from 'vue';
import { invoke } from '../native.js';
import { importCertifiedKeys } from '../destination-setup.js';
import { importKey } from '../resources.js';
import { errorMessage } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';
import CertificateFile from './CertificateFile.vue';
const props = defineProps({ session: Object, busy: Boolean, destinationId: String });
const emit = defineEmits(['busy', 'imported', 'fatal']);
const encryption = ref(null),
  signing = ref(null),
  purpose = ref('decrypt');
const working = ref(false),
  error = ref(''),
  notice = ref('');
async function load() {
  if (props.busy || working.value || !props.session) return;
  const session = props.session;
  working.value = true;
  error.value = '';
  notice.value = '';
  emit('busy', true);
  try {
    const first = await encryption.value.material();
    const result = props.destinationId
      ? await importKey(invoke, session, props.destinationId, purpose.value, JSON.stringify(first))
      : await importCertifiedKeys(
          invoke,
          session,
          JSON.stringify({ encryption: first, signing: await signing.value.material() }),
        );
    if (props.session?.sessionId !== session.sessionId) return;
    encryption.value.clear();
    signing.value?.clear();
    notice.value = 'Schlüssel und V-PKI-Zertifikate wurden geprüft und geladen.';
    emit('imported', result);
  } catch (cause) {
    error.value = errorMessage(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    working.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <details class="technical-options">
    <summary>
      {{
        destinationId ? 'Zertifizierten privaten Schlüssel importieren' : 'V-PKI-Schlüsselpaar importieren'
      }}
    </summary>
    <p>
      STAGE und PROD benötigen gültige Zertifikate der Verwaltungs-PKI. Importieren Sie die vollständige
      Zertifikatskette einschließlich Zwischenzertifikaten. Vertrauenskette, Gültigkeit, Schlüsselverwendung
      und Sperrstatus werden geprüft. Eine fehlgeschlagene Prüfung wird nicht übergangen.
    </p>
    <label v-if="destinationId" for="certificate-purpose">
      Verwendung
      <select id="certificate-purpose" v-model="purpose" :disabled="busy || working">
        <option value="decrypt">Entschlüsseln</option>
        <option value="sign">Signieren</option>
      </select>
    </label>
    <CertificateFile
      ref="encryption"
      :id="destinationId ? 'registered-certificate' : 'encryption-certificate'"
      :label="
        destinationId
          ? 'Privater Schlüssel mit Zertifikatskette'
          : 'Verschlüsselungsschlüssel mit Zertifikatskette'
      "
      :disabled="busy || working"
    />
    <CertificateFile
      v-if="!destinationId"
      ref="signing"
      id="signing-certificate"
      label="Signaturschlüssel mit Zertifikatskette"
      :disabled="busy || working"
    />
    <p v-if="!destinationId" class="small-note">
      Verwenden Sie zwei unterschiedliche Schlüssel. Vor dem Import speichern Sie bitte die Verbindung als
      geschütztes Profil.
    </p>
    <button type="button" class="button secondary" :disabled="busy || working || !session" @click="load">
      {{ working ? 'Zertifikate werden geprüft …' : 'Zertifikate prüfen und Schlüssel laden' }}
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </details>
</template>
