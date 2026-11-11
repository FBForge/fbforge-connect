<script setup>
import CopyValue from './CopyValue.vue';
import { sdkStageLabels } from './sdk-diagnostics.ts';
defineProps({ diagnostics: { type: Array, required: true } });
</script>
<template>
  <div v-if="diagnostics.length" class="sdk-diagnostics">
    <p><strong>SDK-Meldungen</strong></p>
    <ol>
      <li v-for="(item, index) in diagnostics" :key="index">
        <p class="small-note">{{ sdkStageLabels[item.stage] }} · {{ item.type }}</p>
        <p class="sdk-message">{{ item.message }}</p>
      </li>
    </ol>
    <CopyValue
      :value="
        diagnostics
          .map((item) => `${sdkStageLabels[item.stage]} · ${item.type}\n${item.message}`)
          .join('\n\n')
      "
      label="SDK-Meldungen"
      :show-value="false"
    />
  </div>
</template>
<style scoped>
.sdk-diagnostics {
  min-width: 0;
  overflow-wrap: anywhere;
}
.sdk-diagnostics ol {
  padding-inline-start: 1.4rem;
}
.sdk-diagnostics li + li {
  margin-block-start: 1rem;
}
.sdk-diagnostics li p {
  margin-block: 0.3rem;
}
.sdk-message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
