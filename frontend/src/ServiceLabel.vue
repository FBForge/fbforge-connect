<script setup>
import { computed } from 'vue';
import { serviceLabel } from './service-label.js';
import CopyValue from './CopyValue.vue';
const props = defineProps({ identifier: String, name: String });
const label = computed(() => serviceLabel(props.identifier, props.name));
</script>
<template>
  <div class="service-label">
    <strong>{{ label.title }}</strong>
    <small v-if="!label.hasName && label.identifier">Keine Leistungsbezeichnung hinterlegt.</small>
    <CopyValue v-if="label.identifier" :value="label.identifier" label="Leistungskennung" />
  </div>
</template>
