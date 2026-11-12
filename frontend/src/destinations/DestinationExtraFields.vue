<script setup>
import { ref, watch, useId } from 'vue';
const fieldId = useId();
const props = defineProps({
  modelValue: { type: Object, required: true },
  callbackUrl: String,
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const url = ref(''),
  secret = ref(''),
  callbackNotice = ref('');
watch(
  () => props.callbackUrl,
  (value) => {
    url.value = value || '';
    secret.value = '';
    callbackNotice.value = '';
  },
  { immediate: true },
);
function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}
function access(field, value) {
  update('senderAccessRestricted', { ...props.modelValue.senderAccessRestricted, [field]: value });
}
function callback() {
  if (!url.value.startsWith('https://') || secret.value.length < 32 || secret.value.length > 512) {
    callbackNotice.value = 'Bitte eine HTTPS-Adresse und ein neues Secret mit 32 bis 512 Zeichen eingeben.';
    return;
  }
  update('callback', { url: url.value.trim(), secret: secret.value });
  secret.value = '';
  callbackNotice.value =
    'Callback mit neuem Secret vorgemerkt. Erst die Vorschau und Ihre Bestätigung ändern den Zustellpunkt.';
}
</script>
<template>
  <fieldset :disabled="disabled">
    <legend>Weitere Einstellungen aus der Sicherung</legend>
    <label v-if="Object.hasOwn(modelValue, 'publicForRouting')" class="checkbox-label">
      <input
        type="checkbox"
        :checked="modelValue.publicForRouting"
        @change="update('publicForRouting', $event.target.checked)"
      />
      Im vereinfachten TEST-Routing sichtbar
    </label>
    <template v-if="modelValue.senderAccessRestricted">
      <label class="checkbox-label">
        <input
          type="checkbox"
          :checked="modelValue.senderAccessRestricted.enabled"
          @change="access('enabled', $event.target.checked)"
        />
        Absender beschränken
      </label>
      <label>
        Erlaubte Absender-Destination-IDs
        <textarea
          rows="3"
          :value="(modelValue.senderAccessRestricted.allowedSenderDestinations || []).join('\n')"
          @input="
            access(
              'allowedSenderDestinations',
              $event.target.value
                .split(/[\s,]+/)
                .filter(Boolean)
                .map((value) => value.toLowerCase()),
            )
          "
        ></textarea>
        <small>Eine ID pro Zeile. Die Gegenstellen müssen in derselben FIT-Connect-Umgebung bestehen.</small>
      </label>
      <div v-if="modelValue.senderAccessRestricted.allowedSenders?.length" class="notice warning">
        <p>
          Die Sicherung enthält alte Client-Freigaben. Über API v3 dürfen diese nur entfernt werden. Verwenden
          Sie für neue Freigaben Absender-Destination-IDs.
        </p>
        <button type="button" class="button secondary" @click="access('allowedSenders', [])">
          Alte Client-Freigaben entfernen
        </button>
      </div>
    </template>
    <template v-if="callbackUrl">
      <p class="small-note">
        Die Callback-Adresse ist gesichert. Das Secret liefert FIT-Connect nicht zurück. Der Callback wird nur
        übernommen, wenn Sie hier ein neues Secret vormerken. Andernfalls bleibt ein bestehender Callback
        unverändert und eine neue Destination erhält keinen Callback.
      </p>
      <div class="client-fields">
        <label>
          Callback-Adresse
          <input v-model="url" type="url" maxlength="4096" />
        </label>
        <div>
          <label :for="`${fieldId}-secret`">Neues Callback-Secret</label>
          <input
            :id="`${fieldId}-secret`"
            :aria-describedby="`${fieldId}-hint`"
            v-model="secret"
            type="password"
            autocomplete="new-password"
            maxlength="512"
          />
          <small :id="`${fieldId}-hint`">
            32 bis 512 Zeichen. Auch an der Callback-Gegenstelle einrichten.
          </small>
        </div>
      </div>
      <button type="button" class="button secondary" @click="callback">Callback vormerken</button>
      <p v-if="callbackNotice" role="status">{{ callbackNotice }}</p>
    </template>
  </fieldset>
</template>
