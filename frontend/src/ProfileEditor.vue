<script setup>
import { ref, nextTick, inject } from 'vue';
import { invoke } from './native.js';
import { updateProfile } from './profiles.js';
import { resetsSessions } from './sessions.js';
import { errorMessage } from './diagnostics.js';
const context = inject('profile-editor-context', null);
const props = defineProps({ profile: Object, busy: Boolean });
const emit = defineEmits(['busy', 'updated', 'fatal']);
const dialog = ref(null),
  opener = ref(null),
  name = ref(''),
  secret = ref(''),
  pending = ref(false),
  error = ref('');
async function open() {
  if (props.busy) return;
  name.value = props.profile.name;
  secret.value = '';
  error.value = '';
  await context?.suspend();
  await nextTick();
  dialog.value.showModal();
}
function close() {
  if (pending.value) return;
  secret.value = '';
  dialog.value.close();
  context?.restore();
  opener.value?.focus();
}
async function save() {
  if (props.busy || pending.value) return;
  pending.value = true;
  emit('busy', true);
  error.value = '';
  const replacement = secret.value || null;
  secret.value = '';
  try {
    await updateProfile(invoke, props.profile.profileId, name.value.trim(), replacement);
    emit('updated');
    dialog.value.close();
    context?.restore();
  } catch (cause) {
    error.value = errorMessage(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    emit('busy', false);
    await nextTick();
    if (!dialog.value?.open) opener.value?.focus();
  }
}
</script>
<template>
  <button
    ref="opener"
    type="button"
    class="button secondary"
    :disabled="busy || !profile?.available"
    @click="open"
  >
    Profilname oder Secret ändern
  </button>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="tool-dialog profile-edit-dialog"
      :aria-labelledby="`profile-edit-${profile.profileId}`"
      @cancel.prevent="close"
      @close="secret = ''"
    >
      <h3 :id="`profile-edit-${profile.profileId}`">Gespeichertes Profil bearbeiten</h3>
      <p>
        Client-ID, API und gespeicherte Schlüssel bleiben diesem Profil zugeordnet. Ein neues Secret wird
        zuerst durch eine separate Anmeldung geprüft. Eine fehlerhafte Eingabe ersetzt die Sicherung nicht.
      </p>
      <form autocomplete="off" @submit.prevent="save">
        <label :for="`profile-edit-name-${profile.profileId}`">
          Profilname
          <input
            :id="`profile-edit-name-${profile.profileId}`"
            v-model="name"
            required
            maxlength="80"
            :disabled="pending"
            autofocus
          />
        </label>
        <label :for="`profile-edit-secret-${profile.profileId}`">
          Neues Client-Secret (optional)
          <input
            :id="`profile-edit-secret-${profile.profileId}`"
            v-model="secret"
            type="password"
            maxlength="8192"
            autocomplete="off"
            :disabled="pending"
          />
          <small>
            Leer lassen, um nur den Profilnamen zu ändern. Das neue Secret gilt für die nächste Anmeldung mit
            diesem Profil.
          </small>
        </label>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="client-actions">
          <button type="button" class="button secondary" :disabled="pending" @click="close">Abbrechen</button>
          <button type="submit" class="button" :disabled="pending">Profil geschützt speichern</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.profile-edit-dialog {
  max-width: 38rem;
}
</style>
