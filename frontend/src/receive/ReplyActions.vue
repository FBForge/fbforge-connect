<script setup>
import ActionNotice from '../ActionNotice.vue';
import { explain } from '../reply/messages.js';
defineProps({ state: Object, disabled: Boolean });
const emit = defineEmits(['reply', 'retry']);
</script>
<template>
  <button
    v-if="state.status === 'available'"
    class="button secondary"
    type="button"
    :disabled="disabled"
    @click="emit('reply')"
  >
    Antwort verfassen
  </button>
  <p v-else-if="state.status === 'missing'" class="small-note" role="status">
    Für diesen Vorgang wurde kein Antwortkanal angeboten.
  </p>
  <p v-else-if="state.status === 'pending'" class="small-note" role="status">Antwortkanal wird geprüft …</p>
  <template v-else-if="state.status === 'failed'">
    <ActionNotice
      title="Antwortkanal konnte nicht geprüft werden"
      :message="explain(state.code)"
      :code="state.code"
      :diagnostics="state.diagnostics || []"
      tone="error"
    />
    <button class="button secondary" type="button" :disabled="disabled" @click="emit('retry')">
      Antwortkanal erneut prüfen
    </button>
  </template>
</template>
