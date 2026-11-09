<script setup lang="ts">
import { computed, ref } from 'vue';
import FileDropInput from '../../FileDropInput.vue';
import { useEnvironment } from '../../environments.js';
import type { useScenarioWorkspace } from './useScenarioWorkspace.ts';
import type { useTestCollection, TestEntry } from './useTestCollection.ts';
const props = defineProps<{
  controller: ReturnType<typeof useScenarioWorkspace>;
  collection: ReturnType<typeof useTestCollection>;
  disabled: boolean;
}>();
const emit = defineEmits<{
  create: [kind: string];
  open: [entry: TestEntry];
  import: [files: File[]];
  resume: [];
  restore: [id: string];
  compare: [id: string];
  remove: [entry: TestEntry];
  'remove-run': [id: string];
  'legacy-run': [id: string];
}>();
const c = props.controller,
  library = props.collection;
const environment = useEnvironment();
const template = ref('accept'),
  search = ref('');
const filtered = computed(() =>
  library.entries.value.filter((entry) =>
    entry.name.toLocaleLowerCase('de').includes(search.value.trim().toLocaleLowerCase('de')),
  ),
);
const outcomes: Record<string, string> = {
  passed: 'Erfolgreich geprüft',
  failed: 'Abweichungen',
  blocked: 'Prüfung blockiert',
  manual: 'Manuell bestätigt',
  pending: 'In Bearbeitung',
  cancelled: 'Abgebrochen',
};
async function refresh() {
  await c.act(async () => {
    await Promise.all([c.refresh(), library.refresh()]);
  });
}
</script>
<template>
  <section v-if="c.definition.value" class="scenario-current" aria-label="Geöffneter Test">
    <div>
      <span class="small-note">Noch geöffnet</span>
      <h2>{{ c.definition.value.name }}</h2>
    </div>
    <button class="button secondary" :disabled="disabled" @click="emit('resume')">
      {{ c.run.value ? 'Durchlauf fortsetzen' : 'Vorbereitung fortsetzen' }}
    </button>
  </section>
  <section class="scenario-create" aria-labelledby="scenario-create-title">
    <div>
      <h2 id="scenario-create-title" tabindex="-1">Neuen Test vorbereiten</h2>
      <p class="small-note">
        Wählen Sie einen Nachrichtenfluss. Die Vorlage passen Sie anschließend an Ihre Gegenstelle an.
      </p>
    </div>
    <div class="scenario-create-actions">
      <div class="scenario-template-field">
        <label for="scenario-template">Testvorlage</label>
        <select id="scenario-template" v-model="template" :disabled="disabled">
          <option value="accept">Einreichung mit Annahme</option>
          <option value="reject">Einreichung mit Ablehnung</option>
          <option value="reply">Einreichung mit Antwort</option>
          <option value="process">Nachforderung und Nachreichung</option>
        </select>
      </div>
      <button class="button" :disabled="disabled" @click="emit('create', template)">Test vorbereiten</button>
    </div>
    <details>
      <summary>Testdatei importieren</summary>
      <FileDropInput
        id="scenario-import"
        label="Testdatei auswählen"
        accept=".json,application/json"
        :disabled="disabled"
        @files="emit('import', $event)"
      />
      <p class="small-note">
        Auch bisherige Testpakete und Testabläufe lassen sich hier öffnen. Verwenden Sie fiktive Testdaten.
      </p>
    </details>
  </section>
  <section class="scenario-library-section" aria-labelledby="scenario-library-title">
    <div class="scenario-section-heading">
      <h2 id="scenario-library-title">Meine Tests</h2>
      <button class="button secondary" :disabled="disabled || library.loading.value" @click="refresh">
        Sammlung aktualisieren
      </button>
    </div>
    <label v-if="library.entries.value.length > 5">
      Tests durchsuchen
      <input v-model="search" type="search" />
    </label>
    <p v-if="!library.entries.value.length && !library.loading.value" class="small-note">
      Noch keine Tests gespeichert. Bereiten Sie einen Test vor oder importieren Sie eine Datei.
    </p>
    <p v-if="library.loading.value" role="status" class="small-note">Sammlung wird geladen …</p>
    <p v-if="library.error.value" role="alert">{{ library.error.value }}</p>
    <ul v-if="filtered.length" class="scenario-library-list">
      <li
        v-for="entry in filtered"
        :key="entry.kind + entry.id"
        :data-test-entry-id="entry.kind + ':' + entry.id"
      >
        <div>
          <strong>{{ entry.name }}</strong>
          <p class="small-note">
            {{ entry.caseCount }} {{ entry.caseCount === 1 ? 'Testfall' : 'Testfälle' }}
            <template v-if="entry.kind !== 'test'">· Bisherige Sammlung</template>
          </p>
        </div>
        <div class="client-actions">
          <button
            class="button secondary"
            :aria-label="`Test öffnen: ${entry.name}`"
            :disabled="disabled"
            @click="emit('open', entry)"
          >
            Öffnen
          </button>
          <button
            class="button secondary"
            :aria-label="`Test löschen: ${entry.name}`"
            :disabled="disabled"
            @click="emit('remove', entry)"
          >
            Löschen
          </button>
        </div>
      </li>
    </ul>
    <p v-else-if="search" class="small-note">Keine passenden Tests gefunden.</p>
  </section>
  <section
    v-if="c.history.value.length || library.earlierRuns.value.length"
    class="scenario-library-section"
    aria-labelledby="scenario-history-title"
  >
    <h2 id="scenario-history-title">Durchläufe und Ergebnisse</h2>
    <ul class="scenario-library-list">
      <li v-for="run in [...c.history.value].reverse()" :key="run.id" :data-run-id="run.id">
        <div>
          <strong>{{ run.name }}</strong>
          <p class="small-note">
            {{ run.environment }} · API {{ run.apiVersion }} ·
            {{ new Date(run.startedAt).toLocaleString('de-DE') }}
          </p>
          <p class="small-note">
            {{ run.cursor }}/{{ run.total }} Schritte · {{ outcomes[run.outcome || 'pending'] }}
            <template v-if="run.reference">· Referenz geschützt</template>
          </p>
        </div>
        <div class="client-actions">
          <button
            class="button secondary"
            :aria-label="`Durchlauf öffnen: ${run.name}`"
            :disabled="disabled || run.environment !== environment"
            @click="emit('restore', run.id)"
          >
            {{ run.cursor === run.total ? 'Ergebnis öffnen' : 'Fortsetzen' }}
          </button>
          <button
            v-if="c.run.value"
            class="button secondary"
            :disabled="disabled || c.run.value.id === run.id"
            @click="emit('compare', run.id)"
          >
            Vergleichen
          </button>
          <button
            class="button secondary"
            :aria-label="`Durchlauf löschen: ${run.name}`"
            :disabled="disabled || run.reference"
            @click="emit('remove-run', run.id)"
          >
            Löschen
          </button>
        </div>
      </li>
      <li v-for="run in library.earlierRuns.value" :key="`earlier-${run.id}`">
        <div>
          <strong>{{ run.name }}</strong>
          <p class="small-note">
            Durchlauf aus 0.3 · {{ run.environment }} · {{ run.passed }}/{{ run.total }} Schritte
          </p>
        </div>
        <button
          class="button secondary"
          :disabled="disabled || run.environment !== environment"
          @click="emit('legacy-run', run.id)"
        >
          Früheren Durchlauf öffnen
        </button>
      </li>
    </ul>
  </section>
</template>
