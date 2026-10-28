<script setup>
import { ref, computed, watch } from 'vue';
import MessageBatch from './MessageBatch.vue';
import { errorMessage } from './diagnostics.js';
const props = defineProps({
  session: Object,
  items: Array,
  total: Number,
  reply: Boolean,
  busy: Boolean,
  destinationId: String,
  loadPage: Function,
  schemas: Function,
});
const emit = defineEmits(['busy', 'outcome', 'open']);
const selected = ref(new Map()),
  loading = ref(false),
  error = ref('');
const key = (item) => (props.reply ? item.replyId : item.submissionId);
const rows = computed(() => [...selected.value.values()]);
const allPage = computed(
  () => props.items?.length > 0 && props.items.every((item) => selected.value.has(key(item))),
);
let revision = 0;
watch(
  () => `${props.session?.sessionId}/${props.destinationId}`,
  () => {
    revision++;
    selected.value.clear();
    error.value = '';
  },
);
function toggle(item, checked) {
  if (props.busy || loading.value) return;
  if (checked && !selected.value.has(key(item)) && selected.value.size >= 100) {
    error.value = errorMessage('batch_selection_limit');
    return;
  }
  if (checked) selected.value.set(key(item), item);
  else selected.value.delete(key(item));
}
function togglePage(checked) {
  for (const item of props.items) toggle(item, checked);
}
async function selectAll() {
  if (props.busy || loading.value || props.total > 100) return;
  const stamp = revision,
    collected = new Map();
  loading.value = true;
  emit('busy', true);
  error.value = '';
  try {
    for (let offset = 0; offset < props.total; offset += 20) {
      const page = await props.loadPage(offset);
      if (stamp !== revision) return;
      if (page.totalCount !== props.total) throw new Error('batch_list_changed');
      for (const item of page[props.reply ? 'replies' : 'submissions']) collected.set(key(item), item);
    }
    if (collected.size !== props.total) throw new Error('batch_list_changed');
    selected.value = collected;
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
    emit('busy', false);
  }
}
function outcome(value) {
  if (value.status === 'confirmed') selected.value.delete(value.submissionId);
  emit('outcome', value);
}
defineExpose({ has: (item) => selected.value.has(key(item)), toggle });
</script>
<template>
  <div class="inbox-selection">
    <div class="client-actions">
      <label class="checkbox-label">
        <input
          type="checkbox"
          :checked="allPage"
          :disabled="busy || loading || !items?.length"
          @change="togglePage($event.target.checked)"
        />
        Alle auf dieser Seite auswählen
      </label>
      <button
        v-if="total > items?.length && total <= 100"
        type="button"
        class="button secondary"
        :disabled="busy || loading"
        @click="selectAll"
      >
        Alle {{ total }} auswählen
      </button>
      <span role="status" class="small-note">
        {{ rows.length }} ausgewählt{{ total > 100 ? ' · höchstens 100 Nachrichten pro Durchlauf' : '' }}
      </span>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <MessageBatch
      :session="session"
      :items="rows"
      :reply="reply"
      :destination-id="destinationId"
      :busy="busy || loading"
      :schemas="schemas"
      @busy="emit('busy', $event)"
      @outcome="outcome"
      @open="emit('open', $event)"
    />
  </div>
</template>
