<script setup lang="ts">
import TestFlowContext from '../TestFlowContext.vue';
import { useScenarioSeries } from './useScenarioSeries.ts';
import { seriesLabels } from './series.ts';
import type { useScenarioWorkspace } from './useScenarioWorkspace.ts';
import type { Environment } from '../../contracts.d.ts';
const props = defineProps<{ controller: ReturnType<typeof useScenarioWorkspace>; disabled: boolean }>();
const c = props.controller;
const {
  environment,
  name,
  series,
  saved,
  choice,
  error,
  pending,
  variants,
  apis,
  contexts,
  rows,
  context,
  create,
  open,
  launch,
  attach,
  canAttach,
  restore,
  detach,
  remove,
  exportResults,
  refresh,
} = useScenarioSeries(c);
const emit = defineEmits<{ context: [value: object] }>();
</script>
<template>
  <details class="scenario-series">
    <summary>Testserien planen und fortsetzen</summary>
    <div class="scenario-section">
      <p class="small-note">
        Eine Serie hält die Testdefinition fest und führt durch ausgewählte Datensätze und API-Versionen.
        Jeder Durchlauf wird ausdrücklich gestartet. Versand und Empfangsbestätigung nutzen die normalen
        Freigaben.
      </p>
      <template v-if="c.definition.value && !series">
        <label>
          Name der Testserie
          <input v-model="name" maxlength="160" :disabled="disabled || pending" />
        </label>
        <fieldset>
          <legend>Datensätze für die Serie</legend>
          <label v-for="v in c.definition.value.variants" :key="v.id" class="checkbox-label">
            <input v-model="variants" type="checkbox" :value="v.id" :disabled="disabled || pending" />
            {{ v.name }}
          </label>
        </fieldset>
        <fieldset>
          <legend>API-Versionen</legend>
          <label v-for="api in ['v2', 'v3'] as const" :key="api" class="checkbox-label">
            <input v-model="apis" type="checkbox" :value="api" :disabled="disabled || pending" />
            API {{ api }}
          </label>
        </fieldset>
        <section v-for="api in apis" :key="api" class="scenario-section">
          <h3>Zuordnung für API {{ api }}</h3>
          <TestFlowContext
            :context="context(api)"
            :environment="environment as Environment"
            fixed-api
            :disabled="disabled || pending"
            @update:context="contexts[api] = { ...$event, apiVersion: api }"
            @open="emit('context', $event)"
          />
        </section>
        <button
          class="button secondary"
          :disabled="disabled || pending || !name.trim() || !variants.length || !apis.length"
          @click="create"
        >
          Testserie anlegen
        </button>
        <p class="small-note">
          Die Serie speichert eine eigene Definition. Spätere Änderungen an der Vorbereitung ändern diese
          Serie nicht. Prozessnachrichten und Nachreichungen im selben Case sind unter API v2 als nicht
          anwendbar gekennzeichnet.
        </p>
      </template>
      <template v-if="saved.length">
        <label>
          Gespeicherte Testserie
          <select v-model="choice" :disabled="disabled || pending">
            <option value="">Serie auswählen</option>
            <option v-for="s in saved" :key="s.id" :value="s.id">
              {{ s.name }} · {{ s.environment }} · {{ s.total }} Durchläufe
            </option>
          </select>
        </label>
        <button class="button secondary" :disabled="disabled || pending || !choice" @click="open">
          Testserie öffnen
        </button>
      </template>
      <template v-if="series">
        <h3>{{ series.name }}</h3>
        <p>
          <strong>
            {{ rows.filter((r) => r.outcome === 'passed').length }} von {{ rows.length }} Durchläufen
            automatisch nachgewiesen.
          </strong>
          {{ rows.filter((r) => r.outcome === 'not_started').length }} nicht ausgeführt.
          {{ rows.filter((r) => r.outcome === 'inapplicable').length }} nicht anwendbar.
        </p>
        <div class="table-scroll" tabindex="0" aria-label="Durchläufe der Testserie">
          <table>
            <thead>
              <tr>
                <th>Datensatz</th>
                <th>API</th>
                <th>Prüfstand</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id">
                <th scope="row">{{ r.name }}</th>
                <td>{{ r.assignment.apiVersion }}</td>
                <td>
                  <span :class="['scenario-series-status', r.outcome]">{{ seriesLabels[r.outcome] }}</span>
                </td>
                <td>
                  <div class="client-actions">
                    <button
                      v-if="r.outcome !== 'inapplicable'"
                      class="button secondary"
                      :disabled="disabled || pending"
                      @click="
                        emit('context', {
                          ...r.assignment,
                          side: series.definition.mode === 'receiver' ? 'receiver' : 'sender',
                          step: series.definition.mode === 'receiver' ? 'receive' : 'send',
                        })
                      "
                    >
                      Passendes Profil öffnen
                    </button>
                    <button
                      v-if="!r.runId && r.outcome !== 'inapplicable'"
                      class="button secondary"
                      :disabled="disabled || pending || !c.sessionId.value"
                      @click="launch(r.id)"
                    >
                      Durchlauf starten
                    </button>
                    <button
                      v-if="r.runId && r.outcome !== 'unavailable'"
                      class="button secondary"
                      :disabled="disabled || pending"
                      @click="restore(r.runId)"
                    >
                      {{
                        ['passed', 'manual'].includes(r.outcome) ? 'Ergebnis öffnen' : 'Durchlauf fortsetzen'
                      }}
                    </button>
                    <button
                      v-if="r.outcome === 'unavailable'"
                      class="button secondary"
                      :disabled="disabled || pending"
                      @click="detach(r.id)"
                    >
                      Fehlende Verknüpfung lösen
                    </button>
                    <button
                      v-if="canAttach(r) && r.outcome !== 'inapplicable'"
                      class="button secondary"
                      :disabled="disabled || pending"
                      @click="attach(r.id)"
                    >
                      Aktuellen Durchlauf zuordnen
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="client-actions">
          <button class="button secondary" :disabled="pending" @click="refresh">
            Prüfstand aktualisieren
          </button>
          <button class="button secondary" :disabled="pending" @click="exportResults">
            Serienergebnis exportieren
          </button>
          <button class="button secondary" :disabled="disabled || pending" @click="remove">
            Serie entfernen
          </button>
          <button
            v-if="c.definition.value"
            class="button secondary"
            :disabled="disabled || pending"
            @click="series = null"
          >
            Weitere Serie vorbereiten
          </button>
        </div>
        <p class="small-note">
          „Serie entfernen“ entfernt die Zusammenstellung. Einzelne Durchläufe und Referenzen bleiben
          gespeichert.
        </p>
      </template>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </details>
</template>
