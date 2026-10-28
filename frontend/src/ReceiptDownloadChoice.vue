<script setup>
defineProps({ modelValue: Boolean, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <fieldset class="receipt-download-choice" :disabled="disabled" aria-describedby="receipt-download-note">
    <legend>Dateien vor der Annahme speichern?</legend>
    <p id="receipt-download-note" class="small-note">
      Metadaten, Fachdaten und Anlagen werden unverändert in einem Ordner Ihrer Wahl gespeichert. Diese
      Dateien sind unverschlüsselt. Die geschützte Aufbewahrung unter „Vorgänge“ ist davon unabhängig.
    </p>
    <label class="checkbox-label">
      <input
        type="radio"
        name="receipt-download"
        :checked="modelValue"
        @change="emit('update:modelValue', true)"
      />
      Ja, alle Dateien vorher speichern
    </label>
    <label class="checkbox-label">
      <input
        type="radio"
        name="receipt-download"
        :checked="!modelValue"
        @change="emit('update:modelValue', false)"
      />
      Nein, ohne Download annehmen
    </label>
    <p v-if="modelValue" class="small-note">
      Bei Abbruch oder einem Speicherfehler wird die Annahme nicht gesendet.
    </p>
  </fieldset>
</template>

<style scoped>
.receipt-download-choice {
  margin-block: 20px;
  padding: 0;
  border: 0;
}
.receipt-download-choice legend {
  font-weight: 700;
}
.receipt-download-choice .checkbox-label {
  min-height: 44px;
  padding-block: 6px;
}
.receipt-download-choice input[type='radio'] {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  margin: 0;
}
</style>
