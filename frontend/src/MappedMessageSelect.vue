<script setup>
import { inject, computed, ref, watch } from 'vue';
import { processWorkspaceKey } from './process-context.js';
defineProps({ id: { type: String, required: true }, disabled: Boolean });
const emit = defineEmits(['select']);
const workspace = inject(processWorkspaceKey, null);
const messages = computed(() => workspace?.messages?.value || []),
  choice = ref('');
watch(messages, () => (choice.value = ''));
</script>
<template>
  <div v-if="messages.length" class="client-fields">
    <label :for="id">
      Übernommene Nachricht aus dem Prozessmodell
      <select :id="id" v-model="choice" :disabled="disabled">
        <option value="">Bitte auswählen</option>
        <option
          v-for="(row, index) in messages"
          :key="`${row.processModelId}/${row.messageId}`"
          :value="String(index)"
        >
          {{ row.label }} · {{ row.messageId }} · {{ row.processModelId }}
        </option>
      </select>
    </label>
    <button
      class="button secondary"
      type="button"
      :disabled="disabled || choice === ''"
      @click="emit('select', messages[Number(choice)])"
    >
      Modellzuordnung in diese Prozessnachricht übernehmen
    </button>
  </div>
</template>
