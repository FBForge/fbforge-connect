<script setup>
import { ref } from 'vue';
import { invoke } from '../native.js';
import { listProfiles } from '../profiles.js';
const props = defineProps({ context: Object, environment: String, disabled: Boolean, side: String });
const emit = defineEmits(['update:context', 'open']);
const profiles = ref([]),
  error = ref('');
async function load() {
  try {
    profiles.value = (await listProfiles(invoke)).filter(
      (p) => p.available && p.environment === props.environment && p.apiVersion === props.context.apiVersion,
    );
    error.value = '';
  } catch {
    error.value = 'Profile konnten nicht geladen werden. Öffnen Sie die Verbindung bei Bedarf manuell.';
  }
}
function set(key, value) {
  emit('update:context', { ...props.context, [key]: value });
}
</script>
<template>
  <details class="flow-context">
    <summary>Sender und Empfänger zuordnen</summary>
    <p class="small-note">
      Nur Profilkennungen und Destinations werden gespeichert. Zugangsdaten bleiben im geschützten Profil.
      Jeder Versand wird weiterhin einzeln bestätigt.
    </p>
    <label>
      API-Version für diesen Ablauf
      <select
        :value="context.apiVersion"
        :disabled="disabled"
        @change="
          emit('update:context', {
            ...context,
            apiVersion: $event.target.value,
            senderProfileId: '',
            receiverProfileId: '',
          });
          profiles = [];
        "
      >
        <option value="v2">API v2</option>
        <option value="v3">API v3</option>
      </select>
    </label>
    <button class="button secondary" :disabled="disabled" @click="load">Passende Profile laden</button>
    <div class="settings-fields">
      <fieldset
        v-for="item in [
          { side: 'sender', title: 'Sender' },
          { side: 'receiver', title: 'Empfänger' },
        ]"
        :key="item.side"
      >
        <legend>{{ item.title }}</legend>
        <label>
          Gespeichertes Profil
          <select
            :aria-label="`${item.title}-Profil`"
            :value="context[`${item.side}ProfileId`]"
            :disabled="disabled"
            @change="set(`${item.side}ProfileId`, $event.target.value)"
          >
            <option value="">Manuell verbinden</option>
            <option
              v-if="
                context[`${item.side}ProfileId`] &&
                !profiles.some((profile) => profile.profileId === context[`${item.side}ProfileId`])
              "
              :value="context[`${item.side}ProfileId`]"
            >
              Gespeichertes Profil
            </option>
            <option v-for="profile in profiles" :key="profile.profileId" :value="profile.profileId">
              {{ profile.name }}
            </option>
          </select>
        </label>
        <label>
          {{ item.side === 'sender' ? 'Absender-Destination (API v3)' : 'Empfangs-Destination' }}
          <input
            :value="context[item.side === 'sender' ? 'sourceDestination' : 'receiverDestination']"
            :disabled="disabled || (item.side === 'sender' && context.apiVersion === 'v2')"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            @input="
              set(
                item.side === 'sender' ? 'sourceDestination' : 'receiverDestination',
                $event.target.value.trim(),
              )
            "
          />
        </label>
      </fieldset>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </details>
  <button
    v-if="side"
    class="button secondary"
    :disabled="disabled"
    @click="emit('open', { ...context, side })"
  >
    {{ side === 'sender' ? 'Zum Sender wechseln' : 'Zum Empfänger wechseln' }}
  </button>
</template>
