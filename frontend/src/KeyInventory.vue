<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { invoke } from './native.js';
import { loadKeyInventory, removeInventoryItem } from './key-inventory.js';
import { resetsSessions } from './sessions.js';
const props = defineProps({ session: Object, busy: Boolean });
const emit = defineEmits(['busy', 'invalidate', 'fatal']);
const rows = ref(null),
  error = ref(''),
  notice = ref(''),
  pending = ref(false),
  candidate = ref(null),
  acknowledged = ref(false);
const dialog = ref(null),
  refreshButton = ref(null),
  cancelButton = ref(null);
const disabled = computed(() => props.busy || pending.value || !props.session);
let revision = 0;
const kind = {
  imported: 'Importierter Zustellpunktschlüssel',
  generated: 'Erzeugtes Schlüsselpaar',
  reply: 'Antwortschlüssel',
};
const purpose = {
  decrypt: 'Einreichungen entschlüsseln',
  sign: 'Quittierungen signieren',
  'decrypt+sign': 'Entschlüsseln und signieren',
  reply: 'Replies entschlüsseln',
};
const status = {
  loaded: 'Für Empfang geladen',
  ready: 'Noch nicht zugeordnet',
  reserved: 'Einrichtung vorbereitet',
  bound: 'Zugeordnet',
  pending: 'Versand vorbereitet',
  unresolved: 'Ungewisser Ausgang',
  recovered: 'Über geprüftes Reply wiederhergestellt',
};
const blocked = {
  managed_pair: 'Wird zusammen mit dem erzeugten Schlüsselpaar verwaltet.',
  pending_operation:
    'Wird für eine vorbereitete Aktion benötigt. Zuerst diese Aktion abschließen oder abbrechen.',
  unresolved_operation: 'Wegen eines ungewissen Vorgangs aufbewahren. Zuerst dessen Ergebnis klären.',
};
function message(cause) {
  const code = typeof cause === 'string' ? cause : cause?.message;
  return (
    {
      vault_unavailable:
        'Die Änderung ist nicht sicher im Profil gespeichert. Die frühere Sicherung kann den Schlüssel weiterhin enthalten. Bitte den Speicherstatus prüfen.',
      key_missing: 'Dieser Eintrag hat sich geändert. Bitte den Bestand neu laden.',
      send_locked: 'Der Schlüssel wird noch benötigt und kann derzeit nicht entfernt werden.',
      engine_protocol_error: 'Der Schlüsselbestand konnte nicht zuverlässig gelesen werden.',
    }[code] || 'Der Schlüsselbestand konnte nicht aktualisiert werden. Bitte erneut laden.'
  );
}
watch(
  () => props.session?.sessionId,
  () => {
    revision++;
    rows.value = null;
    candidate.value = null;
    error.value = '';
    notice.value = '';
    acknowledged.value = false;
    dialog.value?.close();
  },
  { flush: 'sync' },
);
async function refresh() {
  if (disabled.value) return;
  const stamp = revision,
    session = { ...props.session };
  pending.value = true;
  error.value = '';
  emit('busy', true);
  try {
    const value = await loadKeyInventory(invoke, session);
    if (stamp === revision) rows.value = value;
  } catch (cause) {
    if (stamp === revision) error.value = message(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
async function ask(row) {
  if (disabled.value || !row.removable) return;
  candidate.value = row;
  acknowledged.value = false;
  await nextTick();
  dialog.value.showModal();
  cancelButton.value?.focus();
}
function cancel() {
  if (pending.value) return;
  dialog.value?.close();
  candidate.value = null;
  acknowledged.value = false;
  void nextTick(() => refreshButton.value?.focus());
}
async function remove() {
  if (disabled.value || !candidate.value?.removable || !acknowledged.value) return;
  const stamp = revision,
    session = { ...props.session },
    selected = candidate.value;
  pending.value = true;
  error.value = '';
  notice.value = '';
  emit('busy', true);
  try {
    await removeInventoryItem(invoke, session, selected.itemId);
    const value = await loadKeyInventory(invoke, session);
    if (stamp === revision) {
      rows.value = value;
      notice.value = 'Der gewählte Eintrag wurde entfernt. Bereits exportierte Sicherungen bleiben erhalten.';
    }
  } catch (cause) {
    if (stamp === revision) error.value = message(cause);
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    emit('busy', false);
    if (stamp === revision) {
      emit('invalidate');
      cancel();
    }
  }
}
</script>
<template>
  <details class="tool-section" v-if="session">
    <summary>Schlüsselbestand dieser Verbindung</summary>
    <p>
      Hier siehst du importierte Zustellpunktschlüssel, erzeugte Schlüsselpaare und Antwortschlüssel. Private
      Schlüssel werden nicht angezeigt. Fingerabdrücke dienen dem Vergleich; sie sind SHA-256-Werte des
      öffentlichen Schlüssels.
    </p>
    <button ref="refreshButton" type="button" class="button secondary" :disabled="disabled" @click="refresh">
      Schlüsselbestand aktualisieren
    </button>
    <p v-if="pending" role="status">Schlüsselbestand wird aktualisiert …</p>
    <p v-if="error" role="alert" class="status-badge error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="rows && !rows.length">In dieser Verbindung sind keine privaten Schlüssel hinterlegt.</p>
    <ul v-if="rows?.length" class="send-history-list">
      <li v-for="row in rows" :key="row.itemId">
        <strong>{{ kind[row.kind] }}</strong>
        · {{ purpose[row.purpose] }}
        <p>
          {{ status[row.status] }}
          <template v-if="row.expiresAt">
            · Zertifikat gültig bis {{ new Date(row.expiresAt).toLocaleDateString('de-DE') }}
          </template>
          <template v-else>· Keine Zertifikatslaufzeit</template>
        </p>
        <p v-if="row.destinationId">
          {{ row.kind === 'reply' ? 'Empfänger' : 'Zustellpunkt' }}:
          <code class="break-all">{{ row.destinationId }}</code>
        </p>
        <p v-if="row.caseId">
          Zugehöriger Vorgang:
          <code class="break-all">{{ row.caseId }}</code>
          . Der Schlüssel kann noch für Antworten auf diesen Vorgang benötigt werden.
        </p>
        <details>
          <summary>Kennung und Fingerabdruck anzeigen</summary>
          <p class="break-all">Kennung: {{ row.keyId }}</p>
          <p class="break-all">SHA-256: {{ row.fingerprint }}</p>
        </details>
        <p v-if="row.blockedReason" class="small-note">{{ blocked[row.blockedReason] }}</p>
        <button
          type="button"
          class="button secondary"
          :disabled="disabled || !row.removable"
          @click="ask(row)"
        >
          {{ row.kind === 'generated' ? 'Dieses Schlüsselpaar entfernen' : 'Diesen Schlüssel entfernen' }}
        </button>
      </li>
    </ul>
    <p class="small-note">
      Bei einer gespeicherten Verbindung wird auch das aktive Profil aktualisiert. Entfernen verändert keine
      öffentlichen Schlüssel am Zustellpunkt. Bereits exportierte Sicherungen bleiben erhalten. Ältere
      Schlüssel können noch für wartende Nachrichten nötig sein.
    </p>
  </details>
  <dialog ref="dialog" class="tool-dialog" aria-labelledby="inventory-remove-title" @cancel.prevent="cancel">
    <h3 id="inventory-remove-title">
      {{ candidate?.kind === 'generated' ? 'Schlüsselpaar' : 'Schlüssel' }} wirklich entfernen?
    </h3>
    <p>
      Ohne passende Sicherung können damit verschlüsselte Nachrichten oder spätere Replies möglicherweise
      nicht mehr entschlüsselt werden.
    </p>
    <p v-if="candidate?.kind === 'generated'">
      Beide erzeugten Schlüssel und ihre geladenen Kopien werden entfernt.
    </p>
    <p class="break-all">{{ candidate?.keyId }}</p>
    <label class="checkbox-label">
      <input v-model="acknowledged" type="checkbox" :disabled="pending" />
      Ich habe geprüft, dass ich diesen Schlüsselbestand nicht mehr benötige oder eine passende Sicherung
      habe.
    </label>
    <div class="client-actions">
      <button ref="cancelButton" type="button" class="button secondary" :disabled="pending" @click="cancel">
        Abbrechen
      </button>
      <button type="button" class="button" :disabled="disabled || !acknowledged" @click="remove">
        Aus diesem Schlüsselbestand entfernen
      </button>
    </div>
  </dialog>
</template>
<style scoped>
.break-all {
  overflow-wrap: anywhere;
}
</style>
