<script setup>
import { computed } from 'vue';
import { certificateExpiry } from './certificate-expiry.js';
const props = defineProps({ keys: Array });
const expiring = computed(() => certificateExpiry(props.keys || []));
</script>
<template>
  <div v-if="expiring.length" role="status">
    <strong>Zertifikate rechtzeitig erneuern</strong>
    <ul>
      <li v-for="key in expiring" :key="key.kid">
        <code>{{ key.kid }}</code>
        : {{ key.urgency === 'expired' ? 'Abgelaufen' : `Läuft in ${key.days} Tagen ab` }} ({{
          new Date(key.expiresAt).toLocaleDateString('de-DE')
        }}).
      </li>
    </ul>
    <p class="small-note">
      Keine automatische Änderung der Registrierung. Planen Sie den Schlüsselwechsel vor dem Ablauf.
    </p>
  </div>
</template>
