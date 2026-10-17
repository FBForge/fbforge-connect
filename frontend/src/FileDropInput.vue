<script setup>
import { ref } from 'vue';
const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  accept: String,
  multiple: Boolean,
  disabled: Boolean,
});
const emit = defineEmits(['files']);
const dragging = ref(false),
  error = ref('');
let depth = 0;
function resetDrag() {
  depth = 0;
  dragging.value = false;
}
function select(files) {
  resetDrag();
  if (props.disabled) return;
  error.value = '';
  if (!files.length) {
    error.value = 'Bitte eine lokale Datei ablegen. Links und Text werden hier nicht übernommen.';
    return;
  }
  if (!props.multiple && files.length !== 1) {
    error.value = 'Bitte hier genau eine Datei auswählen oder ablegen.';
    return;
  }
  emit('files', files);
}
function change(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (files.length) select(files);
}
function enter() {
  if (!props.disabled) {
    depth++;
    dragging.value = true;
  }
}
function leave() {
  if (--depth <= 0) resetDrag();
}
</script>
<template>
  <div
    class="file-drop-zone"
    :class="{ 'is-dragging': dragging && !disabled, 'is-disabled': disabled }"
    role="group"
    :aria-labelledby="`${id}-label`"
    :aria-disabled="disabled"
    @dragenter.prevent.stop="enter"
    @dragover.prevent.stop
    @dragleave.prevent.stop="leave"
    @drop.prevent.stop="select(Array.from($event.dataTransfer?.files || []))"
  >
    <label :id="`${id}-label`" :for="id">{{ label }}</label>
    <p :id="`${id}-help`" class="small-note">
      {{ multiple ? 'Dateien hierher ziehen oder auswählen.' : 'Datei hierher ziehen oder auswählen.' }}
      <slot />
    </p>
    <input
      :id="id"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      :aria-describedby="`${id}-help`"
      @change="change"
    />
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
