<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { invoke } from '../native.ts';
import { listAnswerSchemas, answerSchemaError, answerSchemaChanges } from '../answer-schema-library.js';
const props = defineProps({ session: Object, disabled: Boolean });
const emit = defineEmits(['select']);
const rows = ref([]),
  choice = ref(''),
  error = ref('');
let generation = 0;
async function refresh() {
  const stamp = ++generation;
  rows.value = [];
  choice.value = '';
  error.value = '';
  try {
    const value = await listAnswerSchemas(invoke, props.session);
    if (stamp === generation) rows.value = value;
  } catch (cause) {
    if (stamp === generation) error.value = answerSchemaError(cause);
  }
}
watch(() => props.session?.sessionId, refresh, { immediate: true });
answerSchemaChanges.addEventListener('change', refresh);
onBeforeUnmount(() => {
  generation++;
  answerSchemaChanges.removeEventListener('change', refresh);
});
</script>
<template>
  <label v-if="rows.length">
    Antwortschema aus dem Profil
    <select v-model="choice" :disabled="disabled" @change="choice && emit('select', choice)">
      <option value="">Bitte auswählen</option>
      <option v-for="row in rows" :key="row.uri" :value="row.uri">{{ row.title }} · {{ row.uri }}</option>
    </select>
  </label>
  <p v-if="error" class="small-note" role="status">{{ error }}</p>
</template>
