<script setup>
import ReplyActions from './ReplyActions.vue';
defineProps({ disabled: Boolean, replyState: Object });
const emit = defineEmits(['reply', 'retry']);
</script>
<template>
  <div class="tool-section">
    <p>Der Empfang ist abgeschlossen.</p>
    <p v-if="replyState.status === 'available'" class="small-note">
      Der angebotene Antwortkanal gehört zum Vorgang und bleibt für diese Sitzung verfügbar.
    </p>
    <ReplyActions :state="replyState" :disabled="disabled" @reply="emit('reply')" @retry="emit('retry')" />
  </div>
</template>
