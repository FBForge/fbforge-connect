<script setup lang="ts">
import { useMessageFields } from './useMessageFields.ts';
import type { Scenario } from './types.ts';
import { messageFields } from './fields.ts';
const scenario = defineModel<Scenario>({ required: true });
const { caseId, scope, path, item, fields, selected } = useMessageFields(() => scenario.value);
function sourceFields(id: string) {
  const item = scenario.value.pack.cases.find((c) => c.id === id);
  try {
    return item ? messageFields(item.request.data, item.request.mimeType) : [];
  } catch {
    return [];
  }
}
function add() {
  if (!selected.value || scenario.value.rules.length >= 64) return;
  scenario.value.rules.push({
    id: crypto.randomUUID(),
    caseId: item.value.id,
    scope: scope.value,
    path: path.value,
    operator: 'equals',
    value: selected.value.type === 'text' ? JSON.parse(selected.value.raw) : selected.value.raw,
  });
}
</script>
<template>
  <section class="scenario-section" aria-labelledby="scenario-expectations-title">
    <h3 id="scenario-expectations-title">Was soll geprüft werden?</h3>
    <label>
      Inhaltsvergleich
      <select v-model="scenario.comparison">
        <option value="exact">Vollständiger Inhalt</option>
        <option value="xml-structure">XML-Struktur, JSON vollständig</option>
        <option value="rules">Nur ausgewählte Fachdatenfelder</option>
      </select>
    </label>
    <p v-if="scenario.comparison === 'rules'" class="scenario-notice">
      Andere Fachdatenfelder werden nicht verglichen. Hinterlegen Sie für jede Nachricht mindestens eine
      Erwartung. Anlagen werden weiterhin vollständig verglichen.
    </p>
    <p v-else-if="scenario.comparison === 'xml-structure'" class="small-note">
      XML-Attributreihenfolge und gleichbedeutende Namensraumpräfixe dürfen abweichen. Text, Leerzeichen und
      Elementreihenfolge bleiben relevant.
    </p>
    <div class="scenario-fields">
      <label>
        Testfall für Erwartung
        <select v-model="caseId">
          <option v-for="c in scenario.pack.cases" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
      <label>
        Nachricht für Erwartung
        <select v-model="scope">
          <option value="request">Einreichung</option>
          <option v-if="item.reply" value="reply">Antwort</option>
        </select>
      </label>
    </div>
    <label>
      Feld für Erwartung
      <select v-model="path">
        <option value="">Feld auswählen</option>
        <option v-for="f in fields" :key="f.path" :value="f.path">
          {{ f.label }} · {{ f.raw.slice(0, 60) }}
        </option>
      </select>
    </label>
    <button class="button secondary" :disabled="!selected || scenario.rules.length >= 64" @click="add">
      Erwartung hinzufügen
    </button>
    <fieldset v-for="rule in scenario.rules" :key="rule.id" class="scenario-entry">
      <legend>{{ rule.scope === 'request' ? 'Einreichung' : 'Antwort' }} · {{ rule.path }}</legend>
      <label>
        Bedingung
        <select v-model="rule.operator">
          <option value="equals">Entspricht dem Wert</option>
          <option value="present">Ist vorhanden</option>
          <option value="date">Ist ein gültiges Datum</option>
          <option v-if="rule.scope === 'reply'" value="reference">
            Entspricht einem Feld der Einreichung
          </option>
        </select>
      </label>
      <label v-if="rule.operator === 'reference'">
        Feld in der Einreichung
        <select v-model="rule.value">
          <option value="">Feld auswählen</option>
          <option v-for="f in sourceFields(rule.caseId)" :key="f.path" :value="f.path">{{ f.label }}</option>
        </select>
      </label>
      <label v-else-if="rule.operator === 'equals'">
        Erwarteter Wert
        <input v-model="rule.value" maxlength="4096" />
      </label>
      <button
        class="button secondary"
        @click="scenario.rules = scenario.rules.filter((r) => r.id !== rule.id)"
      >
        Erwartung entfernen
      </button>
    </fieldset>
    <label v-if="scenario.pack.cases.some((c) => c.receipt !== 'none')">
      Erwarteter Problemtyp der Empfangsbestätigung, optional
      <input
        v-model="scenario.expectedProblem"
        maxlength="4096"
        placeholder="https://schema.fitko.de/fit-connect/events/problems/…"
      />
    </label>
  </section>
</template>
