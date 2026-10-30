<script setup>
import FileDropInput from '../FileDropInput.vue';
import ProcessRepliesEditor from './ProcessRepliesEditor.vue';
import SchemaIdentifierFile from '../SchemaIdentifierFile.vue';
import { ref, watch } from 'vue';
const schemaError = ref('');
const props = defineProps({ controller: Object, session: Object, visible: Boolean });
const {
  offeredProcessMessages,
  offerReplies,
  replySchema,
  replyMime,
  attachments,
  sendStep,
  replyOptions,
  schemaContext,
  disabled,
  addFiles,
} = props.controller;
watch([replyOptions, replySchema], () => (schemaError.value = ''));
function selectReplySchema(uri) {
  const match = replyOptions.value.find(
    (item) => item.schemaUri === uri && (!item.mimeType || item.mimeType === 'application/json'),
  );
  schemaError.value = match
    ? ''
    : 'Diese Schema-Kennung wird von der gewählten Empfängerleistung noch nicht als Antwortschema angeboten. Zuerst dort hinterlegen und die Leistungen neu laden.';
  if (match) {
    replySchema.value = uri;
    replyMime.value = 'application/json';
  }
}
</script>
<template>
  <fieldset v-show="sendStep === 2" data-send-step="2" :disabled="disabled">
    <legend tabindex="-1">Antwortkanal</legend>
    <label class="checkbox-label">
      <input v-model="offerReplies" type="checkbox" :disabled="!replyOptions.length" />
      Antworten über FIT-Connect anbieten
    </label>
    <p v-if="!replyOptions.length" class="small-note">
      Für die gewählte Leistung ist kein unterstütztes Antwortschema hinterlegt.
    </p>
    <div v-if="offerReplies" class="client-fields">
      <label for="send-reply-schema">
        Antwortschema
        <select id="send-reply-schema" v-model="replySchema" required>
          <option v-for="item in replyOptions" :key="item.schemaUri" :value="item.schemaUri">
            {{ item.schemaUri }}
          </option>
        </select>
      </label>
      <label for="send-reply-mime">
        Antwortformat
        <select id="send-reply-mime" v-model="replyMime">
          <option value="application/json">JSON</option>
          <option value="application/xml">XML</option>
        </select>
      </label>
    </div>
    <template v-if="offerReplies">
      <SchemaIdentifierFile
        id="send-reply-schema-file"
        :context-key="schemaContext"
        :disabled="disabled"
        label="Angebotenes Antwortschema aus JSON-Datei auswählen"
        @select="selectReplySchema"
      />
      <p v-if="schemaError" role="alert">{{ schemaError }}</p>
      <ProcessRepliesEditor
        v-if="session?.apiVersion === 'v3'"
        v-model="offeredProcessMessages"
        :schema-uri="replySchema"
        :mime-type="replyMime"
        :disabled="disabled"
      />
    </template>
    <p v-if="offerReplies" class="small-note">
      Das SDK erzeugt einen eigenen Antwortschlüssel. Bei aktiviertem Profil wird er vor dem Versand geschützt
      gesichert und kann nach einem Neustart wiederhergestellt werden. Ohne Profil gilt er nur für diese
      Sitzung. Die Leistung muss den Antwortkanal unterstützen.
    </p>
  </fieldset>
  <fieldset v-show="sendStep === 2" data-send-step="2" :disabled="disabled">
    <legend>Anlagen</legend>
    <FileDropInput
      id="send-attachments"
      label="Anlagen hinzufügen"
      multiple
      :disabled="disabled"
      @files="addFiles"
    />
    <div v-for="item in attachments" :key="item.id" class="client-fields">
      <div>
        <strong>{{ item.file.name }}</strong>
        <p>{{ (item.file.size / 1024).toFixed(1) }} KiB · {{ item.mimeType }}</p>
      </div>
      <label :for="`description-${item.id}`">
        Beschreibung
        <input :id="`description-${item.id}`" type="text" v-model="item.description" maxlength="1000" />
      </label>
      <button
        class="button secondary"
        type="button"
        @click="attachments = attachments.filter((row) => row.id !== item.id)"
      >
        Anlage entfernen
      </button>
    </div>
    <p v-if="!attachments.length">Keine zusätzlichen Anlagen ausgewählt.</p>
    <p>
      Höchstens 32 MiB je Datei, 64 MiB insgesamt und 39 zusätzliche Anlagen. Die Grenzen der Destination
      werden zusätzlich vom SDK geprüft.
    </p>
  </fieldset>
</template>
