<script setup>
import { ref, useId } from 'vue';
import AppIcon from '../AppIcon.vue';
defineProps({ theme: String, preference: String });
const emit = defineEmits(['change']);
const id = useId(),
  panel = ref(null),
  opener = ref(null);
function choose(value) {
  emit('change', value);
  panel.value.hidePopover();
  opener.value.focus();
}
</script>
<template>
  <button ref="opener" class="icon-button" type="button" aria-label="Darstellung wählen" :popovertarget="id">
    <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" />
  </button>
  <div :id="id" ref="panel" popover class="appearance-picker" role="group" aria-label="Darstellung">
    <strong>Darstellung</strong>
    <button
      v-for="item in [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Hell' },
        { value: 'dark', label: 'Dunkel' },
      ]"
      :key="item.value"
      type="button"
      class="button secondary"
      :aria-pressed="preference === item.value"
      @click="choose(item.value)"
    >
      <span v-if="preference === item.value" aria-hidden="true">✓</span>
      {{ item.label }}
    </button>
  </div>
</template>
<style scoped>
.appearance-picker {
  position: fixed;
  inset: 56px 16px auto auto;
  margin: 0;
  padding: 14px;
  min-width: 160px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow);
}
.appearance-picker:popover-open {
  display: grid;
  gap: 8px;
}
.appearance-picker .button[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--status-info-bg);
  color: var(--status-info-ink);
}
</style>
