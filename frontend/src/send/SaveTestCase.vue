<script setup>
import { ref } from 'vue';
defineProps({ disabled: Boolean, pending: Boolean, notice: String, error: String });
const emit = defineEmits(['save']);
const name = ref('');
</script>
<template>
  <details class="data-schema-options save-test-case">
    <summary>Entwurf als Testfall wiederverwenden</summary>
    <label for="send-test-name">
      Name des Testfalls
      <input
        id="send-test-name"
        v-model="name"
        maxlength="160"
        :disabled="disabled || pending"
        placeholder="Zum Beispiel: Bauantrag mit Anlage"
      />
    </label>
    <p class="small-note">
      Speichert Fachdaten, Anlagen und lokale Schemata für einen neuen Entwurf. Verbindung, private Schlüssel
      und bisherige Case IDs werden nicht übernommen. Verwenden Sie fiktive Daten.
    </p>
    <div class="client-actions">
      <button
        class="button secondary"
        type="button"
        :disabled="disabled || pending || !name.trim()"
        @click="emit('save', name.trim(), false)"
      >
        Testfall speichern
      </button>
      <button
        class="button secondary"
        type="button"
        :disabled="disabled || pending || !name.trim()"
        @click="emit('save', name.trim(), true)"
      >
        Entwurf als Testpaket exportieren
      </button>
    </div>
    <p class="small-note">
      Die lokale Sammlung ist für Ihr Windows-Benutzerkonto verschlüsselt. Exportierte Testpakete sind
      unverschlüsselt.
    </p>
    <p v-if="pending" role="status">Testfall wird verarbeitet …</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>
