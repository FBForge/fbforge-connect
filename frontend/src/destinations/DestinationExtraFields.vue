<script setup>
import { computed, ref, watch, useId } from 'vue';
import { useEnvironment } from '../environments.js';
const fieldId = useId();
const props = defineProps({
  modelValue: { type: Object, required: true },
  callbackUrl: String,
  disabled: Boolean,
  baseline: { type: Object, default: () => ({}) },
});
const environment = useEnvironment();
const value = computed(() => ({ ...props.baseline, ...props.modelValue }));
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
  const next = { ...props.modelValue, [field]: value };
  if (JSON.stringify(value) === JSON.stringify(props.baseline[field])) delete next[field];
  emit('update:modelValue', next);
}
function access(field, value) {
  update('senderAccessRestricted', {
    enabled: false,
    ...props.baseline.senderAccessRestricted,
    ...props.modelValue.senderAccessRestricted,
    [field]: value,
  });
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
    <legend>Routing, Absender und Benachrichtigungen</legend>
    <label v-if="environment === 'TEST'" class="checkbox-label">
      <input
        type="checkbox"
        :checked="value.publicForRouting || false"
        @change="update('publicForRouting', $event.target.checked)"
      />
      Im vereinfachten TEST-Routing sichtbar
    </label>
    <details>
      <summary>Absender beschränken</summary>
      <label class="checkbox-label">
        <input
          type="checkbox"
          :checked="value.senderAccessRestricted?.enabled || false"
          @change="access('enabled', $event.target.checked)"
        />
        Absender beschränken
      </label>
      <label>
        Erlaubte Absender-Destination-IDs
        <textarea
          aria-label="Erlaubte Absender-Destination-IDs"
          rows="3"
          :value="(value.senderAccessRestricted?.allowedSenderDestinations || []).join('\n')"
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
      <div v-if="value.senderAccessRestricted?.allowedSenders?.length" class="notice warning">
        <p>
          Die Sicherung enthält alte Client-Freigaben. Über API v3 dürfen diese nur entfernt werden. Verwenden
          Sie für neue Freigaben Absender-Destination-IDs.
        </p>
        <button type="button" class="button secondary" @click="access('allowedSenders', [])">
          Alte Client-Freigaben entfernen
        </button>
      </div>
    </details>
    <label>
      Kopie der Kontaktbenachrichtigung an (E-Mail)
      <textarea
        aria-label="Kopie der Kontaktbenachrichtigung an (E-Mail)"
        rows="2"
        :value="(value.contactInformation?.cc || []).join('\n')"
        @input="update('contactInformation', { cc: $event.target.value.split(/[\s,;]+/).filter(Boolean) })"
      ></textarea>
      <small>Eine E-Mail-Adresse pro Zeile.</small>
    </label>
    <details>
      <summary>Callback einrichten oder ändern</summary>
      <p class="small-note">
        FIT-Connect gibt ein bestehendes Callback-Secret nicht zurück. Zum Einrichten oder Ändern benötigen
        Sie ein neues Secret. Erst Ihre Bestätigung der Vorschau speichert die Änderung.
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
      <button
        v-if="callbackUrl || value.callback"
        type="button"
        class="button secondary"
        @click="
          update('callback', null);
          callbackNotice = 'Entfernen vorgemerkt. Bitte in der Änderungsvorschau bestätigen.';
        "
      >
        Callback entfernen
      </button>
      <p v-if="callbackNotice" role="status">{{ callbackNotice }}</p>
    </details>
  </fieldset>
</template>
