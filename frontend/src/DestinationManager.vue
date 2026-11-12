<script setup>
import { nextTick, ref, shallowRef, watch } from 'vue';
import ManagedDestinations from './ManagedDestinations.vue';
import DestinationBackups from './destinations/DestinationBackups.vue';
const props = defineProps({ session: Object, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'changed', 'receive']);
const managed = ref(null),
  backupsOpen = ref(false),
  capture = ref(null),
  seed = shallowRef(null);
watch(
  () => props.session?.sessionId,
  () => {
    backupsOpen.value = false;
    capture.value = null;
    seed.value = null;
  },
);
function openBackups(destination = null) {
  capture.value = destination;
  backupsOpen.value = true;
}
async function create(value) {
  seed.value = { ...value, token: crypto.randomUUID() };
  backupsOpen.value = false;
  await nextTick();
  managed.value.controller.setupOpen = true;
}
async function edit(value) {
  backupsOpen.value = false;
  await nextTick();
  const c = managed.value.controller;
  c.selected = [];
  c.setupOpen = false;
  await c.edit({ destinationId: value.destinationId });
  if (!c.error && c.detail?.destinationId === value.destinationId && c.view === 'edit') {
    if (c.detail.type !== value.type)
      c.error =
        'Sicherung und Ziel-Destination haben unterschiedliche Typen. Bitte eine passende Ziel-Destination wählen.';
    else c.applyTemplate(value.changes);
  }
}
</script>
<template>
  <ManagedDestinations
    ref="managed"
    v-show="!backupsOpen"
    :session="session"
    :busy="busy"
    :creation-seed="seed"
    @manual="seed = null"
    @busy="emit('busy', $event)"
    @activity="emit('activity', $event)"
    @fatal="emit('fatal', $event)"
    @changed="emit('changed')"
    @receive="emit('receive', $event)"
  >
    <template #navigation>
      <button type="button" class="button secondary" :disabled="busy || !session" @click="openBackups()">
        Zustellpunkt-Sicherungen
      </button>
    </template>
    <template #destination="{ destination }">
      <button
        v-if="session?.apiVersion === 'v3'"
        type="button"
        class="button secondary"
        :disabled="busy"
        @click="openBackups(destination)"
      >
        Zustellpunkt sichern
      </button>
    </template>
  </ManagedDestinations>
  <DestinationBackups
    v-if="backupsOpen"
    :session="session"
    :busy="busy"
    :capture-destination="capture"
    :can-manage="managed?.controller.canEdit !== false"
    @back="backupsOpen = false"
    @create="create"
    @edit="edit"
    @busy="emit('busy', $event)"
    @activity="emit('activity', $event)"
    @fatal="emit('fatal', $event)"
    @changed="emit('changed')"
    @receive="emit('receive', $event)"
  />
</template>
