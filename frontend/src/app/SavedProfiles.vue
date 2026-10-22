<script setup>
import { computed, ref, watch } from 'vue';
import CopyValue from '../CopyValue.vue';
import ProfileEditor from '../ProfileEditor.vue';
const props = defineProps({
  profiles: Array,
  apiVersion: String,
  activeProfileId: String,
  busy: Boolean,
});
const emit = defineEmits(['connect', 'backup', 'remove', 'fatal', 'busy', 'updated']);
const selectedId = ref('');
const selected = computed(() => props.profiles.find((profile) => profile.profileId === selectedId.value));
// Keep a deliberate selection when the list refreshes. Prefer the active profile on first opening.
watch(
  () => [props.profiles, props.activeProfileId],
  () => {
    if (selected.value) return;
    selectedId.value =
      (
        props.profiles.find((profile) => profile.profileId === props.activeProfileId) ||
        props.profiles.find((profile) => profile.available && profile.apiVersion === props.apiVersion) ||
        props.profiles[0]
      )?.profileId || '';
  },
  { immediate: true },
);
</script>
<template>
  <label class="saved-profile-choice" for="saved-profile-choice">
    Profil auswählen ({{ profiles.length }})
    <select id="saved-profile-choice" v-model="selectedId" :disabled="busy">
      <option v-for="profile in profiles" :key="profile.profileId" :value="profile.profileId">
        {{ profile.name }} · {{ profile.apiVersion || 'Nicht lesbar' }}
        {{ profile.clientId ? `· ${profile.clientId}` : '' }}
      </option>
    </select>
  </label>
  <div v-if="selected" :key="selected.profileId" class="selected-profile">
    <p>
      <strong>{{ selected.name }}</strong>
    </p>
    <p v-if="selected.available">
      <strong>Client-ID</strong>
      <CopyValue :value="selected.clientId" label="Client-ID" />
    </p>
    <p>
      {{
        selected.available
          ? `${selected.apiVersion} · ${selected.keyCount} gespeicherte Schlüssel / Antwortkanäle`
          : 'Unter diesem Benutzerkonto nicht lesbar'
      }}
    </p>
    <div class="client-actions">
      <button
        class="button"
        type="button"
        :disabled="busy || !selected.available"
        @click="emit('connect', selected, true)"
      >
        Mit Profil verbinden
      </button>
      <button
        v-if="selected.keyCount"
        class="button secondary"
        type="button"
        :disabled="busy || !selected.available"
        @click="emit('connect', selected, false)"
      >
        Nur Zugangsdaten verwenden
      </button>
    </div>
    <details>
      <summary>Profil verwalten</summary>
      <div class="client-actions">
        <ProfileEditor
          :profile="selected"
          :busy="busy"
          @fatal="emit('fatal', $event)"
          @busy="emit('busy', $event)"
          @updated="emit('updated')"
        />
        <button
          class="button secondary"
          type="button"
          :disabled="busy || !selected.available"
          @click="emit('backup', selected)"
        >
          Geschützte Sicherung exportieren
        </button>
        <button class="button secondary" type="button" :disabled="busy" @click="emit('remove', selected)">
          Gespeichertes Profil entfernen
        </button>
      </div>
    </details>
  </div>
</template>
