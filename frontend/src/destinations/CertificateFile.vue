<script setup>
import { computed, ref } from 'vue';
import FileDropInput from '../FileDropInput.vue';
import { certificateMaterial } from '../certified-keys.js';
defineProps({ id: String, label: String, disabled: Boolean });
const file = ref(null),
  password = ref('');
const encrypted = computed(() => /\.(?:p12|pfx)$/i.test(file.value?.name || ''));
defineExpose({
  material: () => certificateMaterial(file.value, password.value),
  clear: () => {
    file.value = null;
    password.value = '';
  },
});
</script>
<template>
  <FileDropInput
    :id="id"
    :label="label"
    accept=".p12,.pfx,.jwk,.json"
    :disabled="disabled"
    @files="
      file = $event[0];
      password = '';
    "
  >
    PKCS#12 (.p12 oder .pfx) mit privatem Schlüssel und Zertifikatskette oder privater JWK mit x5c. Maximal 24
    KiB.
  </FileDropInput>
  <p v-if="file" class="small-note">Ausgewählt: {{ file.name }}</p>
  <label v-if="encrypted" :for="`${id}-password`">
    Passwort der Schlüsseldatei
    <input
      :id="`${id}-password`"
      v-model="password"
      type="password"
      autocomplete="off"
      maxlength="1024"
      :disabled="disabled"
    />
    <small>Das Dateipasswort wird nur zum Import verwendet und nicht gespeichert.</small>
  </label>
</template>
