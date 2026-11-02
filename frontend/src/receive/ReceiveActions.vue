<script setup>
import MessageDownload from '../MessageDownload.vue';
import { exportSource } from '../message-export.js';
import ReplyActions from './ReplyActions.vue';
defineProps({
  session: Object,
  proof: Object,
  reply: Boolean,
  disabled: Boolean,
  receiptUncertain: Boolean,
  replyState: Object,
});
const emit = defineEmits(['busy', 'reply', 'retry', 'receipt', 'acknowledge']);
</script>
<template>
  <div class="document-next-actions">
    <MessageDownload
      :session="session"
      :source="exportSource(proof, reply)"
      :blocked="Boolean(proof.blockedAttachments?.length)"
      :disabled="disabled"
      @busy="emit('busy', $event)"
    />
    <h3>Nächster Schritt</h3>
    <p class="small-note">Prüfen Sie die Fachdaten und Anlagen vor der Empfangsbestätigung.</p>
    <div class="client-actions">
      <ReplyActions
        v-if="!reply"
        :state="replyState"
        :disabled="disabled"
        @reply="emit('reply')"
        @retry="emit('retry')"
      />
      <template v-if="!reply">
        <button
          class="button"
          type="button"
          :disabled="disabled || receiptUncertain"
          @click="emit('receipt', 'accept')"
        >
          Annehmen
        </button>
        <button
          class="button secondary"
          type="button"
          :disabled="disabled || receiptUncertain"
          @click="emit('receipt', 'reject')"
        >
          Ablehnen
        </button>
      </template>
      <button v-else class="button" type="button" :disabled="disabled" @click="emit('acknowledge')">
        Antwort quittieren
      </button>
    </div>
  </div>
</template>
