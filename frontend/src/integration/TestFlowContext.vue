<script setup lang="ts">
import { useFlowProfiles } from './useFlowProfiles.ts';
import type { Environment, FlowAssignment, FlowContext } from '../contracts.d.ts';
const props = defineProps<{
  context: FlowAssignment;
  environment: Environment;
  disabled?: boolean;
  side?: FlowContext['side'];
  fixedApi?: boolean;
  receiverDestinationOutside?: boolean;
}>();
const emit = defineEmits<{
  'update:context': [context: FlowAssignment];
  open: [context: FlowContext];
}>();
const sides = [
  { side: 'sender', title: 'Sender' },
  { side: 'receiver', title: 'Empfänger' },
] as const;
const { profiles, pending, error, load, select } = useFlowProfiles(props, (value) =>
  emit('update:context', value),
);
function set(key: keyof Omit<FlowAssignment, 'apiVersion'>, event: Event) {
  if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
  emit('update:context', { ...props.context, [key]: event.target.value.trim() });
}
function changeApi(event: Event) {
  if (!(event.target instanceof HTMLSelectElement)) return;
  const apiVersion = event.target.value;
  if (apiVersion !== 'v2' && apiVersion !== 'v3') return;
  emit('update:context', { ...props.context, apiVersion, senderProfileId: '', receiverProfileId: '' });
}
</script>
<template>
  <details class="flow-context">
    <summary>
      {{ receiverDestinationOutside ? 'Profile und API (optional)' : 'Sender und Empfänger zuordnen' }}
    </summary>
    <p class="small-note">
      Nur Profilkennungen und Destinations werden gespeichert. Zugangsdaten bleiben im geschützten Profil.
      Jeder Versand wird weiterhin einzeln bestätigt.
    </p>
    <div class="flow-profile-toolbar">
      <label v-if="!fixedApi">
        API-Version für diesen Ablauf
        <select :value="context.apiVersion" :disabled="disabled || pending" @change="changeApi">
          <option value="v2">API v2</option>
          <option value="v3">API v3</option>
        </select>
      </label>
      <button class="button secondary" :disabled="disabled || pending" @click="load">
        {{ pending ? 'Profile werden vorbereitet …' : 'Profile aktualisieren' }}
      </button>
    </div>
    <p class="small-note">
      Profile der anderen API können Sie ebenfalls auswählen. Ihre Zugangsdaten werden geschützt übernommen
      und für die gewählte API geprüft.
    </p>
    <div class="settings-fields">
      <fieldset v-for="item in sides" :key="item.side">
        <legend>{{ item.title }}</legend>
        <label>
          Gespeichertes Profil
          <select
            :aria-label="`${item.title}-Profil`"
            :value="context[`${item.side}ProfileId`]"
            :disabled="disabled || pending"
            @change="select(item.side, $event)"
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
              {{ profile.name
              }}{{
                profile.apiVersion !== context.apiVersion ? ` · für API ${context.apiVersion} übernehmen` : ''
              }}
            </option>
          </select>
        </label>
        <label v-if="!(receiverDestinationOutside && item.side === 'receiver')">
          {{ item.side === 'sender' ? 'Absender-Destination (API v3)' : 'Empfangs-Destination' }}
          <input
            :value="context[item.side === 'sender' ? 'sourceDestination' : 'receiverDestination']"
            :disabled="disabled || (item.side === 'sender' && context.apiVersion === 'v2')"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            @input="set(item.side === 'sender' ? 'sourceDestination' : 'receiverDestination', $event)"
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
<style scoped>
.settings-fields fieldset > label + label {
  margin-top: 12px;
}
.flow-profile-toolbar {
  display: flex;
  align-items: end;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
  margin-block: 1rem;
}
.flow-profile-toolbar label {
  flex: 0 1 18rem;
  min-width: 12rem;
}
</style>
