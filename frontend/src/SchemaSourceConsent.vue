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
      Schemaquellen erhalten Ihre IP-Adresse, keine Zugangsdaten oder Fachdaten.
    </p>
    <details class="schema-source-details">
      <summary>Was wird geladen?</summary>
      <p class="small-note">
        Mit Ihrer Freigabe werden Schemata und Referenzen aus öffentlichen HTTPS-Quellen einschließlich
        XRepository geladen. Lokale Schemadateien und mitgelieferte Demos funktionieren ohne Freigabe.
      </p>
    </details>
  </div>
</template>
