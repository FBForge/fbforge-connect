<script setup>
import { computed, ref, watch } from 'vue';
import { invoke } from './native.js';
import { saveProfileDefaults } from './profiles.js';
import { errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
const props = defineProps({ session: Object, defaults: Object, busy: Boolean });
const emit = defineEmits(['busy', 'saved', 'fatal']);
const source = ref(''),
  receiver = ref(''),
  error = ref(''),
  notice = ref(''),
  pending = ref(false);
const disabled = computed(() => props.busy || pending.value || !props.session);
let revision = 0;
watch(
  () => [props.session?.sessionId, props.defaults],
  ([sessionId], previous) => {
    const matchesDraft =
      source.value.trim().toLowerCase() === (props.defaults?.sourceDestination || '') &&
      receiver.value.trim().toLowerCase() === (props.defaults?.receiverDestination || '');
    revision++;
    source.value = props.defaults?.sourceDestination || '';
    receiver.value = props.defaults?.receiverDestination || '';
    error.value = '';
    if (sessionId !== previous?.[0] || !matchesDraft) notice.value = '';
  },
  { immediate: true, flush: 'sync' },
);
async function save() {
  if (disabled.value) return;
  const active = { ...props.session },
    stamp = revision;
  pending.value = true;
  error.value = '';
  notice.value = '';
  emit('busy', true);
  try {
    const result = await saveProfileDefaults(invoke, active, {
      sourceDestination:
        active.apiVersion === 'v3' && source.value.trim() ? source.value.trim().toLowerCase() : null,
      receiverDestination: receiver.value.trim() ? receiver.value.trim().toLowerCase() : null,
    });
    if (stamp === revision) {
      emit('saved', result);
      notice.value = 'Die Standard-Destinations sind im Profil gespeichert.';
    }
  } catch (cause) {
    if (stamp === revision) error.value = errorMessage(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <details class="tool-section">
    <summary>Standard-Destinations im aktiven Profil</summary>
    <p>
      Diese Kennungen werden beim nächsten Verbinden vorausgefüllt. Sie können sie im jeweiligen
      Arbeitsbereich ändern. Ein leeres Feld entfernt die Voreinstellung. Berechtigungen und Schlüssel werden
      bei der Verwendung weiterhin geprüft.
    </p>
    <form @submit.prevent="save">
      <label v-if="session?.apiVersion === 'v3'" for="profile-default-source">
        Eigene Absender-Destination
        <input
          id="profile-default-source"
          v-model="source"
          type="text"
          maxlength="36"
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          :disabled="disabled"
        />
      </label>
      <label for="profile-default-receiver">
        Eigene Empfangs-Destination
        <input
          id="profile-default-receiver"
          v-model="receiver"
          type="text"
          maxlength="36"
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          :disabled="disabled"
        />
      </label>
      <button type="submit" class="button secondary" :disabled="disabled">
        Standard-Destinations speichern
      </button>
    </form>
    <p v-if="pending" role="status">Voreinstellungen werden gespeichert …</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </details>
</template>
