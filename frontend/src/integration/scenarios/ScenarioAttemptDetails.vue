<script setup lang="ts">
import TestDifferences from '../TestDifferences.vue';
import type { Attempt } from './types.ts';
defineProps<{ attempt: Attempt }>();
</script>
<template>
  <p>{{ attempt.detail }}</p>
  <TestDifferences v-if="attempt.differences?.length" :differences="attempt.differences" />
  <p v-if="attempt.differencesOmitted" class="small-note">
    Weitere Details wurden wegen der Anzeige- oder Speichergrenze zusammengefasst. Der Prüfumfang bleibt
    unverändert.
  </p>
  <p v-if="attempt.context" class="small-note">
    Vorgang: {{ attempt.context.caseId || 'Nicht zugeordnet' }} · Nachricht:
    {{ attempt.context.replyId || attempt.context.submissionId || 'Nicht zugeordnet' }}
  </p>
</template>
