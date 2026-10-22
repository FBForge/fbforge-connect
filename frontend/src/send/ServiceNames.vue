<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { leikaCode, lookupServiceName } from '../service-names.js';
const props = defineProps({ services: Array, contextKey: String, disabled: Boolean });
const emit = defineEmits(['names']);
const pending = ref(false),
  notice = ref('');
const missing = computed(() =>
  props.services.filter(
    (item) => leikaCode(item.identifier) && (!item.name || item.name === item.identifier),
  ),
);
let active;
function reset() {
  active?.abort();
  active = null;
  pending.value = false;
  notice.value = '';
}
watch(() => props.contextKey, reset);
onBeforeUnmount(reset);
async function load() {
  if (props.disabled || pending.value) return;
  const controller = new AbortController();
  active = controller;
  const timer = setTimeout(() => controller.abort(), 12000);
  const queue = [...missing.value],
    names = Object.create(null);
  pending.value = true;
  notice.value = '';
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length && !controller.signal.aborted) {
          const item = queue.shift();
          try {
            const title = await lookupServiceName(item.identifier, controller.signal);
            if (title) names[item.identifier] = title;
          } catch {
            /* Keep the identifier usable when the catalogue is unavailable. */
          }
        }
      }),
    );
    if (active !== controller) return;
    emit('names', names);
    const count = Object.keys(names).length;
    notice.value = count
      ? `${count} Leistungsbezeichnungen aus dem FIM-Portal ergänzt. Für weitere Leistungen bleibt die Kennung sichtbar.`
      : 'Keine eindeutigen Leistungsbezeichnungen verfügbar. Bitte wählen Sie anhand der Kennung.';
  } finally {
    clearTimeout(timer);
    if (active === controller) {
      active = null;
      pending.value = false;
    }
  }
}
</script>
<template>
  <div v-if="missing.length || notice" class="service-name-lookup">
    <button
      v-if="missing.length"
      class="button secondary"
      type="button"
      :disabled="disabled || pending"
      @click="load"
    >
      {{ pending ? 'Leistungsnamen werden geladen …' : 'Leistungsnamen aus FIM laden' }}
    </button>
    <p v-if="missing.length" class="small-note">
      Fragt nur die LeiKa-Kennungen beim öffentlichen FIM-Portal ab. Fachdaten und Zugangsdaten werden nicht
      übertragen.
    </p>
    <p v-if="notice" role="status" class="small-note">{{ notice }}</p>
  </div>
</template>
