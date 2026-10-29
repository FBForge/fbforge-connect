<script setup>
import { ref, computed, watch } from 'vue';
import { invoke } from '../native.js';
import { profileWorkspace } from './destination-templates.js';
const props = defineProps({ session: Object, modelValue: String, disabled: Boolean, loaded: String });
const emit = defineEmits(['update:modelValue']);
const data = ref(null),
  choice = ref(''),
  error = ref(''),
  pending = ref(false);
let generation = 0;
const saved = computed(() => [...new Set([...(data.value?.favorites || []), ...(data.value?.recent || [])])]);
const favorite = computed(() => data.value?.favorites.includes(props.modelValue?.trim().toLowerCase()));
watch(
  () => props.session?.sessionId,
  async () => {
    const stamp = ++generation;
    data.value = null;
    error.value = '';
    if (props.session)
      try {
        const value = await profileWorkspace(invoke, props.session);
        if (stamp === generation) data.value = value;
      } catch {
        if (stamp === generation) error.value = 'Destination-Merkliste konnte nicht geladen werden.';
      }
  },
  { immediate: true },
);
async function remember(id, favoriteValue = null) {
  if (!data.value || !id || pending.value) return;
  const stamp = generation;
  pending.value = true;
  try {
    const value = await profileWorkspace(invoke, props.session, {
      action: 'remember',
      id,
      favorite: favoriteValue,
    });
    if (stamp === generation) data.value = value;
  } catch {
    if (stamp === generation)
      error.value = 'Merkliste konnte nicht gespeichert werden. Höchstens 20 Favoriten.';
  } finally {
    pending.value = false;
  }
}
watch(
  () => props.loaded,
  (value) => {
    if (value) void remember(value);
  },
);
</script>
<template>
  <div v-if="data">
    <label v-if="saved.length">
      Favoriten und zuletzt verwendet
      <select v-model="choice" :disabled="disabled || pending" @change="emit('update:modelValue', choice)">
        <option value="">Destination wählen</option>
        <option v-for="id in saved" :key="id" :value="id">
          {{ data.favorites.includes(id) ? '★ ' : '' }}{{ id }}
        </option>
      </select>
    </label>
    <button
      class="button secondary"
      type="button"
      :disabled="disabled || pending || !/^[0-9a-f-]{36}$/i.test(modelValue || '')"
      @click="remember(modelValue.trim().toLowerCase(), !favorite)"
    >
      {{ favorite ? 'Aus Favoriten entfernen' : 'Als Favorit merken' }}
    </button>
    <p class="small-note">
      Merkliste nur für dieses Profil, diese Umgebung und API. Die aktuellen Empfängerleistungen müssen
      weiterhin geladen werden.
    </p>
    <p v-if="error" role="status">{{ error }}</p>
  </div>
</template>
