<script setup>
import { computed, ref, watch } from 'vue';
import { invoke } from './native.js';
import { generateTestKeys, listGeneratedKeys, useGeneratedKeys } from './destination-setup.js';
import {
  prepareDestinationRotation,
  executeDestinationRotation,
  cancelDestinationRotation,
  destinationRotationState,
} from './destination-rotation.js';
import { diagnosticCode, errorMessage } from './diagnostics.js';
import { resetsSessions } from './sessions.js';
const props = defineProps({ session: Object, selected: { type: Array, default: () => [] }, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'changed', 'receive']);
const pending = ref(false),
  preview = ref(null),
  error = ref(''),
  progress = ref('');
const disabled = computed(
  () =>
    props.busy ||
    pending.value ||
    !props.session ||
    props.session.apiVersion !== 'v3' ||
    props.selected.some((row) => row.type === 'C'),
);
const statuses = {
  prepared: 'Zur Bestätigung',
  unchanged: 'Bereits registriert',
  updated: 'Schlüsselwechsel geprüft',
  failed: 'Fehlgeschlagen',
  uncertain: 'Ergebnis ungewiss',
  skipped: 'Nicht ausgeführt',
  completed: 'Abgeschlossen',
  partial: 'Teilweise abgeschlossen',
  conflict: 'Zwischenzeitlich geändert',
  expired: 'Vorschau abgelaufen',
  cancelled: 'Abgebrochen',
  running: 'Wird ausgeführt',
};
let generation = 0;
watch(
  () => `${props.session?.sessionId}/${props.selected.map((row) => row.destinationId).join(',')}`,
  () => {
    generation++;
    const old = preview.value;
    preview.value = null;
    error.value = '';
    progress.value = '';
    if (old?.status === 'prepared' && props.session)
      void cancelDestinationRotation(invoke, { ...props.session }, old.attemptId).catch(() => {});
  },
);
async function run(action, operation) {
  if (disabled.value) return;
  const session = { ...props.session },
    stamp = generation,
    started = performance.now();
  pending.value = true;
  error.value = '';
  emit('busy', true);
  let status = 'Erfolgreich';
  try {
    await operation(session, () => stamp === generation);
  } catch (cause) {
    status = 'Fehlgeschlagen';
    if (stamp === generation) error.value = `${errorMessage(cause)} (${diagnosticCode(cause)})`;
    if (resetsSessions(cause)) emit('fatal', cause);
  } finally {
    pending.value = false;
    progress.value = '';
    emit('busy', false);
    emit('activity', { api: session.apiVersion, role: 'Zustellpunktverwaltung', action, status, started });
  }
}
function prepare() {
  return run('Schlüsselwechsel vorbereiten', async (session, current) => {
    if (preview.value?.status === 'prepared')
      await cancelDestinationRotation(invoke, session, preview.value.attemptId);
    preview.value = null;
    const selected = props.selected.map((row) => ({ ...row })),
      available = [...(await listGeneratedKeys(invoke, session))],
      used = new Set(),
      targets = [];
    for (const [index, row] of selected.entries()) {
      if (!current()) return;
      progress.value = `Schlüsselpaar ${index + 1} von ${selected.length} wird lokal vorbereitet …`;
      // Resume the existing public registration after a lost response. Never replace its private material.
      let bundle = available.find(
        (item) => item.status === 'unresolved' && item.destinationId === row.destinationId,
      );
      if (!bundle) bundle = available.find((item) => item.status === 'ready' && !used.has(item.bundleId));
      if (!bundle) bundle = await generateTestKeys(invoke, session);
      used.add(bundle.bundleId);
      targets.push({
        destinationId: row.destinationId,
        bundleId: bundle.bundleId,
        encryptionKid: bundle.encryption.kid,
        signingKid: bundle.signing.kid,
      });
    }
    if (!current()) return;
    progress.value = 'Eigene Zustellpunkte und registrierte Schlüssel werden geprüft …';
    const result = await prepareDestinationRotation(invoke, session, targets);
    if (current()) preview.value = result;
    else await cancelDestinationRotation(invoke, session, result.attemptId);
  });
}
function execute() {
  const confirmed = preview.value;
  if (confirmed?.status !== 'prepared') return;
  return run('Schlüsselwechsel ausführen', async (session, current) => {
    preview.value = { ...confirmed, status: 'running' };
    try {
      const result = await executeDestinationRotation(invoke, session, confirmed);
      if (current()) {
        preview.value = result;
        emit('changed');
      }
    } catch (cause) {
      if (current()) {
        preview.value = { ...confirmed, status: 'uncertain' };
        emit('changed');
      }
      throw cause;
    }
  });
}
function cancel() {
  const old = preview.value;
  return run('Schlüsselwechsel abbrechen', async (session, current) => {
    await cancelDestinationRotation(invoke, session, old.attemptId);
    if (current()) preview.value = null;
  });
}
function recover() {
  return run('Schlüsselwechsel prüfen', async (session, current) => {
    const result = await destinationRotationState(invoke, session);
    if (current()) preview.value = result;
  });
}
function use(row) {
  return run('Neue Schlüssel für Empfang laden', async (session, current) => {
    await useGeneratedKeys(invoke, session, row.bundleId, row.destinationId);
    if (current()) {
      emit('changed');
      emit('receive', row.destinationId);
    }
  });
}
</script>
<template>
  <section class="tool-section" aria-labelledby="rotation-title" :aria-busy="pending">
    <h3 id="rotation-title">Schlüssel wechseln</h3>
    <p>
      Für die ausgewählten Zustellpunkte neue TEST-Schlüssel mit Testzertifikaten erzeugen. Der Client
      registriert beide öffentlichen Schlüssel und schaltet anschließend den Verschlüsselungsschlüssel um.
      Alte Schlüssel bleiben für frühere Nachrichten erhalten.
    </p>
    <p>
      Die privaten Schlüssel werden im gespeicherten TEST-Profil geschützt auf diesem Windows-Benutzerkonto
      aufbewahrt. Eine gespeicherte Sitzung ist erforderlich.
    </p>
    <p v-if="selected.some((row) => row.type === 'C')" role="status">
      Onlinedienst-Zustellpunkte vom Typ C haben keine Zertifikate. Wählen Sie für einen Schlüsselwechsel
      ausschließlich empfangende Zustellpunkte aus.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="progress" role="status">{{ progress }}</p>
    <button
      class="button secondary"
      :disabled="disabled || !selected.length || preview?.status === 'running'"
      @click="prepare"
    >
      {{
        preview && ['partial', 'uncertain'].includes(preview.status)
          ? 'Registrierung prüfen und Fortsetzung vorbereiten'
          : 'Neue Schlüssel vorbereiten und Vorschau zeigen'
      }}
    </button>
    <section v-if="preview" aria-labelledby="rotation-preview-title">
      <h4 id="rotation-preview-title">{{ statuses[preview.status] }}</h4>
      <p v-if="preview.status === 'prepared'">
        Noch keine Schlüssel registriert. Prüfen Sie die Zuordnung. Die Vorschau gilt zwei Minuten; vor der
        Änderung werden alle Zustellpunkte erneut gelesen.
      </p>
      <p v-if="['uncertain', 'partial'].includes(preview.status)">
        Mindestens ein Schlüsselwechsel wurde nicht vollständig bestätigt. Es wird nichts automatisch
        wiederholt. Eine neue Vorschau prüft die vorhandenen Registrierungen und bereitet nur fehlende
        Schritte vor.
      </p>
      <p v-if="preview.status === 'conflict'">
        Ein Zustellpunkt wurde zwischenzeitlich geändert. Es wurde nichts geschrieben. Bitte eine neue
        Vorschau erstellen.
      </p>
      <article v-for="row in preview.changes" :key="row.destinationId" class="tool-section">
        <h5>{{ row.name }} · {{ statuses[row.status] }}</h5>
        <dl>
          <dt>Zustellpunkt</dt>
          <dd>
            <code>{{ row.destinationId }}</code>
          </dd>
          <dt>Bisheriger Verschlüsselungsschlüssel</dt>
          <dd>
            <code>{{ row.beforeEncryptionKid }}</code>
          </dd>
          <dt>Neuer Verschlüsselungsschlüssel</dt>
          <dd>
            <code>{{ row.encryptionKid }}</code>
          </dd>
          <dt>Neuer Signaturschlüssel</dt>
          <dd>
            <code>{{ row.signingKid }}</code>
          </dd>
        </dl>
        <p v-if="row.error" role="status">
          {{ errorMessage(row.error) }} ({{ row.error
          }}{{ row.httpStatus ? `, HTTP ${row.httpStatus}` : '' }})
        </p>
        <button
          v-if="row.status === 'updated'"
          class="button secondary"
          :disabled="disabled"
          @click="use(row)"
        >
          Neue Schlüssel laden und zum Empfang
        </button>
      </article>
      <div v-if="preview.status === 'prepared'" class="client-actions">
        <button class="button" :disabled="disabled" @click="execute">
          Schlüssel dieser Zustellpunkte auf TEST wechseln
        </button>
        <button class="button secondary" :disabled="disabled" @click="cancel">Abbrechen</button>
      </div>
      <button
        v-if="preview.status === 'uncertain'"
        class="button secondary"
        :disabled="disabled"
        @click="recover"
      >
        Letztes Ergebnis abrufen
      </button>
    </section>
  </section>
</template>
