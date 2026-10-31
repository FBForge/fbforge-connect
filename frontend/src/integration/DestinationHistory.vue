<script setup>
import { ref, watch } from 'vue';
import { invoke } from '../native.js';
import { profileWorkspace } from './destination-templates.js';
const props = defineProps({ session: Object, busy: Boolean, revision: String });
const rows = ref([]),
  error = ref(''),
  pending = ref(false),
  available = ref(false);
let generation = 0;
watch(
  () => props.session?.sessionId,
  () => {
    generation++;
    rows.value = [];
    available.value = false;
    error.value = '';
  },
);
async function load() {
  if (props.busy || pending.value || !props.session) return;
  const stamp = generation;
  pending.value = true;
  error.value = '';
  try {
    const data = await profileWorkspace(invoke, props.session);
    if (stamp === generation) {
      rows.value = data?.history || [];
      available.value = Boolean(data);
    }
  } catch {
    if (stamp === generation) error.value = 'Änderungshistorie konnte nicht gelesen werden.';
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <details>
    <summary>Lokale Änderungshistorie</summary>
    <p>
      Bis zu 100 aktuelle Änderungsvorgänge aus FBForge Connect, mit Vorher-/Nachher-Werten, geschützt mit
      Windows-DPAPI für dieses Profil, diese Umgebung und API. Änderungen anderer Anwendungen sind hier nicht
      enthalten. „uncertain“ bedeutet: Ergebnis nicht sicher gespeichert oder bestätigt. Vor Wiederholung
      Serverzustand prüfen.
    </p>
    <button class="button secondary" type="button" :disabled="busy || pending || !session" @click="load">
      Historie laden
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!available">Für die dauerhafte Historie muss ein gespeichertes Profil verbunden sein.</p>
    <p v-else-if="!rows.length">Noch keine Änderungen aufgezeichnet.</p>
    <details v-for="row in rows" :key="row.snapshot.attemptId">
      <summary>
        {{ new Date(row.recordedAt).toLocaleString('de-DE') }} · {{ row.snapshot.status }} ·
        {{ row.snapshot.changes.length }} Destination(s)
      </summary>
      <article v-for="item in row.snapshot.changes" :key="item.destinationId">
        <h4>{{ item.name || item.destinationId }} · {{ item.status }}</h4>
        <dl>
          <dt>Vorher</dt>
          <dd>
            <pre>{{ item.beforeJson }}</pre>
          </dd>
          <dt>Nachher</dt>
          <dd>
            <pre>{{ item.afterJson }}</pre>
          </dd>
        </dl>
      </article>
    </details>
  </details>
</template>
