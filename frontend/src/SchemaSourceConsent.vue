<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
const props = defineProps({
  modelValue: Boolean,
  disabled: Boolean,
  id: { type: String, required: true },
  contextKey: String,
});
const emit = defineEmits(['update:modelValue']);
const dialog = ref(null);
let resolve,
  pending,
  opener,
  restoreFocus = false;
function finish(allow = false) {
  if (!resolve) return;
  if (allow) emit('update:modelValue', true);
  dialog.value?.close();
  resolve(allow);
  resolve = null;
  pending = null;
  restoreFocus = true;
  void focusOpener();
}
async function focusOpener() {
  await nextTick();
  if (!restoreFocus || props.disabled || document.querySelector('dialog[open]')) return;
  restoreFocus = false;
  if (opener?.isConnected && !opener.disabled && opener.getClientRects().length) opener.focus();
}
async function request(returnFocus) {
  if (props.modelValue) return true;
  if (pending) return pending;
  opener = typeof returnFocus?.focus === 'function' ? returnFocus : document.activeElement;
  const result = (pending = new Promise((done) => (resolve = done)));
  await nextTick();
  if (resolve) {
    dialog.value.showModal();
    dialog.value.querySelector('button')?.focus();
  }
  return result;
}
watch(
  () => props.contextKey,
  () => finish(),
  { flush: 'sync' },
);
watch(() => props.disabled, focusOpener);
onBeforeUnmount(() => {
  restoreFocus = false;
  opener = null;
  finish();
});
defineExpose({ request });
</script>
<template>
  <div class="schema-source-consent">
    <p v-if="modelValue" class="small-note" role="status">
      Öffentliche Schemaquellen sind für diese Verbindung freigegeben.
      <button
        :id="id"
        class="button secondary"
        type="button"
        :disabled="disabled"
        @click="emit('update:modelValue', false)"
      >
        Freigabe beenden
      </button>
    </p>
    <p v-else class="small-note">
      Benötigt ein Schema eine öffentliche Quelle, fragen wir vor dem Abruf nach.
    </p>
  </div>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="tool-dialog schema-access-dialog"
      :aria-labelledby="`${id}-title`"
      :aria-describedby="`${id}-help`"
      @cancel.prevent="finish()"
    >
      <h2 :id="`${id}-title`">Öffentliche Schemaquellen laden?</h2>
      <p :id="`${id}-help`">
        Für diesen Schritt wird ein Schema oder eine Referenz aus einer öffentlichen HTTPS-Quelle benötigt.
        Dazu kann auch XRepository gehören. Die Quelle erhält Ihre IP-Adresse, keine Zugangsdaten oder
        Fachdaten.
      </p>
      <p>
        Mit Ihrer Zustimmung wird der angefangene Schritt fortgesetzt. Die Freigabe gilt für diese Verbindung
        und kann jederzeit beendet werden.
      </p>
      <p class="small-note">
        Sie können stattdessen abbrechen und ein lokales Schema hinterlegen. Vollständig lokal verfügbare
        Schemata benötigen keinen Internetzugriff.
      </p>
      <div class="client-actions">
        <button class="button secondary" type="button" @click="finish()">Abbrechen</button>
        <button class="button" type="button" @click="finish(true)">Für diese Verbindung erlauben</button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.schema-access-dialog {
  width: min(620px, calc(100vw - 40px));
}
.schema-source-consent button {
  margin-inline-start: 8px;
}
</style>
