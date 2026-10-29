<script setup>
import { computed } from 'vue';
import CopyValue from '../CopyValue.vue';
import CertificateExpiryNotice from '../integration/CertificateExpiryNotice.vue';
import { errorMessage } from '../diagnostics.js';
const props = defineProps({ keys: Array });
const blocked = computed(() => props.keys.filter((key) => !key.eligible));
</script>
<template>
  <CertificateExpiryNotice :keys="keys" />
  <p v-if="blocked.length" class="status-badge warn" role="status">
    {{ blocked.length }} Zertifikat(e) wurden nicht freigegeben. Öffnen Sie die Prüfergebnisse für die
    Ursache.
  </p>
  <details v-if="keys.length">
    <summary>Zertifikatsprüfung ({{ keys.length }})</summary>
    <ul>
      <li v-for="key in keys" :key="key.kid">
        <CopyValue :value="key.kid" label="Key ID" />
        <p>
          {{
            key.eligible
              ? 'Zertifikat freigegeben'
              : key.purpose === 'unsupported'
                ? 'Die Schlüsselverwendung wird nicht unterstützt.'
                : errorMessage(key.reason)
          }}
        </p>
        <p v-if="key.eligible" class="small-note">
          Gültig bis {{ new Date(key.expiresAt).toLocaleString('de-DE') }}
        </p>
      </li>
    </ul>
  </details>
</template>
