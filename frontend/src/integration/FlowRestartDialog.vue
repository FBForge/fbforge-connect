<script setup>
import { ref } from 'vue';
import { downloadLocal } from '../local-download.js';
defineProps({ replacement: Object, run: Object });
const emit = defineEmits(['close']);
const dialog = ref(null);
defineExpose({ showModal: () => dialog.value.showModal(), close: () => dialog.value.close() });
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="tool-dialog flow-restart-dialog"
      aria-labelledby="flow-restart-title"
      @cancel.prevent="emit('close', false)"
    >
      <h2 id="flow-restart-title">
        {{ replacement ? 'Anderen Ablauf öffnen?' : 'Durchlauf neu starten?' }}
      </h2>
      <p>
        Bisherige Prüfergebnisse werden zurückgesetzt. Exportieren Sie das Durchlaufergebnis vorher, wenn Sie
        es behalten möchten.
      </p>
      <div class="client-actions">
        <button class="button secondary" type="button" autofocus @click="emit('close', false)">
          Abbrechen
        </button>
        <button
          class="button secondary"
          type="button"
          @click="
            downloadLocal(JSON.stringify({ ...run, bindings: undefined }, null, 2), 'testergebnis.json')
          "
        >
          Durchlaufergebnis exportieren
        </button>
        <button class="button" type="button" @click="emit('close', true)">
          {{
            replacement
              ? 'Ergebnisse zurücksetzen und Ablauf öffnen'
              : 'Ergebnisse zurücksetzen und neu starten'
          }}
        </button>
      </div>
    </dialog>
  </Teleport>
</template>
