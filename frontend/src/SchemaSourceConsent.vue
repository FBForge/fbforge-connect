<script setup>
defineProps({ modelValue: Boolean, disabled: Boolean, id: { type: String, required: true } });
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <div class="schema-source-consent">
    <label class="checkbox-label" :for="id">
      <input
        :id="id"
        type="checkbox"
        :checked="modelValue"
        :disabled="disabled"
        :aria-describedby="`${id}-help`"
        @change="emit('update:modelValue', $event.target.checked)"
      />
      Öffentliche Schemaquellen für diese Sitzung erlauben
    </label>
    <p :id="`${id}-help`" class="small-note">
      Lokale Schemadateien und mitgelieferte Demos funktionieren ohne Freigabe. Mit Freigabe dürfen Schemata
      und Referenzen aus öffentlichen HTTPS-Quellen einschließlich XRepository geladen werden. Diese Quellen
      sehen Ihre IP-Adresse. Zugangsdaten und Fachdaten werden nicht mitgesendet.
    </p>
  </div>
</template>
