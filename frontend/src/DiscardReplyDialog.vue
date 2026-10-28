<script setup>
import { ref, nextTick, onBeforeUnmount, useId } from 'vue';
const dialog = ref(null),
  id = useId();
let resolve, opener;
function finish(discard = false) {
  dialog.value?.close();
  resolve?.(discard);
  resolve = null;
  nextTick(() => {
    if (opener?.isConnected) opener.focus();
  });
}
async function ask() {
  if (resolve) return false;
  opener = document.activeElement;
  const result = new Promise((done) => {
    resolve = done;
  });
  await nextTick();
  dialog.value.showModal();
  return result;
}
onBeforeUnmount(() => finish());
defineExpose({ ask });
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="tool-dialog" :aria-labelledby="id" @cancel.prevent="finish()">
      <h2 :id="id">Antwortentwurf verwerfen?</h2>
      <p>
        Ihre Änderungen an der Antwort wurden noch nicht gesendet. Wenn Sie fortfahren, wird der Entwurf
        verworfen.
      </p>
      <div class="client-actions">
        <button class="button secondary" type="button" autofocus @click="finish()">Weiter bearbeiten</button>
        <button class="button" type="button" @click="finish(true)">Entwurf verwerfen</button>
      </div>
    </dialog>
  </Teleport>
</template>
