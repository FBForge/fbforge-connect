<script setup>
import { ref } from 'vue';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { documentationUrl } from './documentation.js';
import CopyValue from './CopyValue.vue';
import AppIcon from './AppIcon.vue';
const props = defineProps({ topic: { type: String, default: 'start' } });
const failed = ref(false);
async function open(event) {
  if (!isTauri()) return;
  event.preventDefault();
  failed.value = false;
  try {
    await invoke('open_documentation', { topic: props.topic });
  } catch {
    failed.value = true;
  }
}
</script>
<template>
  <span class="documentation-link">
    <a :href="documentationUrl(topic)" target="_blank" rel="noopener noreferrer" @click="open">
      <slot>Anleitung zu diesem Schritt</slot>
      <span class="sr-only">(Website im Browser öffnen)</span>
      <AppIcon name="external" />
    </a>
    <span v-if="failed" class="documentation-failure" role="alert">
      Der Browser konnte nicht geöffnet werden. Öffnen Sie die Adresse manuell:
      <CopyValue :value="documentationUrl(topic)" label="Hilfeadresse" />
    </span>
  </span>
</template>
