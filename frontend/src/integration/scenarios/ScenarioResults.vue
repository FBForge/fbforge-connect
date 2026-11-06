<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { latestChecks } from './model.ts';
import { compareRuns } from './runs.ts';
import type { Run } from './types.ts';
const props = defineProps<{ run: Run; comparison: Run | null }>();
const heading = ref<HTMLElement>();
onMounted(() => heading.value?.focus({ preventScroll: true }));
const names: Record<string, string> = {
  passed: 'Erfolgreich',
  failed: 'Fehlgeschlagen',
  blocked: 'Blockiert',
  manual: 'Manuell bestätigt',
  cancelled: 'Abgebrochen',
  pending: 'Noch nicht ausgeführt',
};
const checks = computed(() => latestChecks(props.run));
const comparison = computed(() => (props.comparison ? compareRuns(props.run, props.comparison) : null));
</script>
<template>
  <section class="scenario-section" aria-labelledby="scenario-result-title">
    <h3 id="scenario-result-title" ref="heading" tabindex="-1">Ergebnisse dieses Durchlaufs</h3>
    <p>
      {{ run.environment }} · API {{ run.assignment.apiVersion }} ·
      {{ new Date(run.startedAt).toLocaleString('de-DE') }}
    </p>
    <p>
      <strong>
        {{ checks.filter((c) => c.attempt?.status === 'passed').length }} von {{ checks.length }} Schritten
        automatisch nachgewiesen.
      </strong>
      {{ checks.filter((c) => c.attempt?.status === 'manual').length }} manuell bestätigt.
    </p>
    <ol class="scenario-checks">
      <li
        v-for="check in checks"
        :key="check.step.id"
        :class="['scenario-check', check.attempt?.status || 'pending']"
      >
        <strong>{{ check.step.title }}</strong>
        <span>{{ names[check.attempt?.status || 'pending'] }}</span>
        <p v-if="check.attempt">{{ check.attempt.detail }}</p>
      </li>
    </ol>
    <template v-if="comparison">
      <h4>Vergleich mit dem ausgewählten Durchlauf</h4>
      <p v-if="!comparison.comparable" class="scenario-notice">
        Test, Datensatz oder Umgebung unterscheiden sich. Diese Ergebnisse sind nicht direkt vergleichbar.
      </p>
      <p v-if="comparison.changedDefinition" class="scenario-notice">
        Testdaten oder Prüferwartungen wurden geändert. Bewerten Sie Unterschiede anhand der jeweiligen
        Testdefinition.
      </p>
      <p v-if="comparison.changedApi" class="scenario-notice">
        Die Durchläufe verwenden unterschiedliche API-Versionen. Verglichen werden die fachlichen Schritte und
        Erwartungen.
      </p>
      <p v-if="comparison.changedTarget" class="scenario-notice">
        Profilzuordnung oder Destinations unterscheiden sich. Berücksichtigen Sie die geänderte Gegenstelle
        beim Vergleich.
      </p>
      <div class="table-scroll" tabindex="0" aria-label="Durchlaufvergleich">
        <table>
          <thead>
            <tr>
              <th>Prüfung</th>
              <th>Ausgewählter Durchlauf</th>
              <th>Aktuell</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in comparison.rows" :key="row.name">
              <th scope="row">{{ row.name }}</th>
              <td>{{ names[row.before] }}</td>
              <td>{{ row.regression ? 'Neue Abweichung · ' : '' }}{{ names[row.after] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <details v-if="run.attempts.length">
      <summary>Alle Prüfversuche ({{ run.attempts.length }})</summary>
      <ol>
        <li v-for="(attempt, index) in run.attempts" :key="index">
          {{ new Date(attempt.at).toLocaleString('de-DE') }} · {{ names[attempt.status] }} ·
          {{ attempt.detail }}
        </li>
      </ol>
    </details>
  </section>
</template>
