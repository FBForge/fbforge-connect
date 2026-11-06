<script setup lang="ts">
import { ref } from 'vue';
import ScenarioAttemptDetails from './ScenarioAttemptDetails.vue';
import type { Attempt } from './types.ts';
defineProps<{ attempt: Attempt; label: string }>();
const expanded = ref(false);
function toggle(event: Event) {
  if (event.target instanceof HTMLDetailsElement) expanded.value = event.target.open;
}
</script>
<template>
  <details class="scenario-attempt-history" @toggle="toggle">
    <summary>{{ new Date(attempt.at).toLocaleString('de-DE') }} · {{ label }}</summary>
    <ScenarioAttemptDetails v-if="expanded" :attempt="attempt" />
  </details>
</template>
