<script setup>
import { ref, useId } from 'vue';
import CopyValue from './CopyValue.vue';
defineProps({
  title: { type: String, required: true },
  message: { type: String, required: true },
  tone: { type: String, default: 'error' },
  code: String,
  apiVersion: String,
});
const titleId = useId();
const heading = ref(null);
defineExpose({
  focus() {
    heading.value?.focus({ preventScroll: true });
    heading.value?.scrollIntoView({ block: 'nearest' });
  },
});
</script>
<template>
  <section class="action-notice" :class="tone" role="alert" :aria-labelledby="titleId">
    <h3 :id="titleId" ref="heading" tabindex="-1">{{ title }}</h3>
    <p>{{ message }}</p>
    <div v-if="$slots.default" class="client-actions"><slot /></div>
    <details v-if="code">
      <summary>Technische Fehlerangaben</summary>
      <p v-if="apiVersion">API {{ apiVersion }}</p>
      <CopyValue :value="code" label="Fehlercode" />
    </details>
  </section>
</template>
