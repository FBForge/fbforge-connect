<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { invoke } from '../native.ts';
import { destinationBackups } from '../destination-backups.js';
import { errorMessage } from '../diagnostics.js';
import { resetsSessions } from '../sessions.ts';
const props = defineProps({ session: Object, destinations: Array, busy: Boolean });
const emit = defineEmits(['busy', 'activity', 'fatal', 'saved']);
const pending = ref(false),
  stopped = ref(false),
  results = ref([]),
  error = ref('');
let generation = 0;
watch(
  () => [props.session?.sessionId, props.destinations],
  () => {
    generation++;
    stopped.value = true;
    results.value = [];
  },
);
onBeforeUnmount(() => {
  generation++;
  stopped.value = true;
});
async function save() {
  if (pending.value || props.busy || !props.session) return;
  const active = { ...props.session },
    rows = [...props.destinations],
    stamp = generation,
    started = performance.now();
  const current = () => stamp === generation;
  if (!rows.length || rows.length > 10) return;
  pending.value = true;
  stopped.value = false;
  error.value = '';
  results.value = [];
  emit('busy', true);
  try {
    const saved = await destinationBackups(invoke, active, { action: 'list' });
    if (saved.length + rows.length > 20) throw Error('vault_limit');
    for (const row of rows) {
      if (!current() || stopped.value) break;
      try {
        await destinationBackups(invoke, active, {
          action: 'capture',
          destinationId: row.destinationId,
          name: (row.name || row.destinationId).slice(0, 160),
        });
        if (current())
          results.value.push({ id: row.destinationId, name: row.name || row.destinationId, saved: true });
      } catch (cause) {
        if (current())
          results.value.push({
            id: row.destinationId,
            name: row.name || row.destinationId,
            saved: false,
            error: errorMessage(cause),
          });
        if (resetsSessions(cause)) {
          emit('fatal', cause);
          break;
        }
      }
    }
  } catch (cause) {
    if (current())
      error.value =
        cause.message === 'vault_limit'
          ? 'Im Profil ist Platz für 20 Sicherungen. Entfernen Sie nicht mehr benötigte Sicherungen oder verkleinern Sie die Auswahl.'
          : errorMessage(cause);
  } finally {
    pending.value = false;
    emit('busy', false);
    await nextTick();
    if (current()) {
      emit('saved');
      emit('activity', {
        api: active.apiVersion,
        role: 'Destination-Verwaltung',
        action: 'Ausgewählte Zustellpunkte sichern',
        started,
        status:
          error.value || results.value.some((r) => !r.saved)
            ? 'Fehlgeschlagen'
            : stopped.value
              ? 'Abgebrochen'
              : 'Erfolgreich',
      });
    }
  }
}
</script>
<template>
  <section aria-label="Ausgewählte Zustellpunkte sichern">
    <h3>{{ destinations.length }} Zustellpunkte sichern</h3>
    <p>
      Die aktuelle öffentliche Konfiguration und öffentlichen Schlüssel werden jeweils als eigene Sicherung im
      Profil gespeichert.
    </p>
    <ul>
      <li v-for="row in destinations" :key="row.destinationId">{{ row.name || row.destinationId }}</li>
    </ul>
    <div class="client-actions">
      <button class="button" :disabled="busy || pending || results.some((r) => r.saved)" @click="save">
        Auswahl im Profil speichern
      </button>
      <button v-if="pending" class="button secondary" :disabled="stopped" @click="stopped = true">
        Nach aktueller Sicherung abbrechen
      </button>
    </div>
    <p v-if="pending || results.length" role="status">
      {{ results.filter((r) => r.saved).length }} von {{ destinations.length }} gesichert{{
        stopped ? ' · Abgebrochen' : pending ? ' · Wird gesichert …' : ''
      }}.
    </p>
    <ul v-if="results.length">
      <li v-for="row in results" :key="row.id">
        {{ row.name }} · {{ row.saved ? 'Gespeichert' : row.error }}
      </li>
    </ul>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
