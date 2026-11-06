<script setup lang="ts">
import { useMessageFields } from './useMessageFields.ts';
import type { Scenario, Variable } from './types.ts';
import { messageFor } from './messages.ts';
import { messageFields } from './fields.ts';
const scenario = defineModel<Scenario>({ required: true });
const { caseId, scope, path, item, fields, selected, options } = useMessageFields(() => scenario.value);
function sourceFields(id: string) {
  const item = scenario.value.pack.cases.find((c) => c.id === id);
  try {
    return item ? messageFields(item.request.data, item.request.mimeType) : [];
  } catch {
    return [];
  }
}
function jsonVariable(variable: Variable) {
  return (
    messageFor(scenario.value.pack, scenario.value.followups, variable.caseId, variable.scope)?.mimeType ===
    'application/json'
  );
}
function add() {
  if (!selected.value || scenario.value.variables.length >= 32) return;
  scenario.value.variables.push({
    id: crypto.randomUUID(),
    label: selected.value.label.slice(0, 160),
    caseId: item.value.id,
    scope: scope.value,
    path: path.value,
    kind:
      selected.value.type === 'number' ? 'number' : selected.value.type === 'boolean' ? 'boolean' : 'text',
    value: selected.value.type === 'text' ? JSON.parse(selected.value.raw) : selected.value.raw,
  });
}
function remove(id: string) {
  scenario.value.variables = scenario.value.variables.filter((v) => v.id !== id);
  for (const variant of scenario.value.variants)
    variant.values = variant.values.filter((v) => v.variableId !== id);
}
function variant() {
  if (scenario.value.variants.length < 16)
    scenario.value.variants.push({
      id: crypto.randomUUID(),
      name: `Variante ${scenario.value.variants.length + 1}`,
      values: [],
    });
}
function setValue(variantId: string, variable: Variable, event: Event) {
  const variant = scenario.value.variants.find((v) => v.id === variantId);
  if (!variant || !(event.target instanceof HTMLInputElement)) return;
  const entry = variant.values.find((v) => v.variableId === variable.id);
  if (entry) entry.value = event.target.value;
  else variant.values.push({ variableId: variable.id, value: event.target.value });
}
</script>
<template>
  <section aria-labelledby="scenario-variables-title" class="scenario-section">
    <h3 id="scenario-variables-title">Variable Testdaten</h3>
    <p class="small-note">
      Wählen Sie Angaben, die sich pro Durchlauf ändern sollen. Unveränderte Inhalte bleiben im Testfall.
    </p>
    <div class="scenario-fields">
      <label>
        Testfall für variable Angaben
        <select v-model="caseId">
          <option v-for="c in scenario.pack.cases" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
      <label>
        Nachricht für variable Angaben
        <select v-model="scope">
          <option v-for="o in options" :key="o.value" :value="o.value">{{ o.name }}</option>
        </select>
      </label>
    </div>
    <label>
      Feld für variable Angabe
      <select v-model="path">
        <option value="">Feld auswählen</option>
        <option v-for="f in fields" :key="f.path" :value="f.path">
          {{ f.label }} · {{ f.raw.slice(0, 60) }}
        </option>
      </select>
    </label>
    <button class="button secondary" :disabled="!selected || scenario.variables.length >= 32" @click="add">
      Variable Angabe hinzufügen
    </button>
    <p v-if="!fields.length" class="small-note">
      Für die Feldauswahl werden gültige, eindeutig lesbare Fachdaten benötigt.
    </p>
    <fieldset v-for="variable in scenario.variables" :key="variable.id" class="scenario-entry">
      <legend>{{ variable.label }}</legend>
      <div class="scenario-fields">
        <label>
          Bezeichnung der variablen Angabe
          <input v-model="variable.label" maxlength="160" />
        </label>
        <label>
          Wert erzeugen als
          <select v-model="variable.kind">
            <option value="text">Text</option>
            <option v-if="jsonVariable(variable)" value="number">Zahl</option>
            <option v-if="jsonVariable(variable)" value="boolean">Ja oder Nein als true/false</option>
            <option value="date">Datum, leer für heutiges Datum</option>
            <option value="uuid">Neue Kennung pro Durchlauf</option>
            <option v-if="variable.scope !== 'request'" value="reference">Wert aus der Einreichung</option>
          </select>
        </label>
      </div>
      <label v-if="variable.kind === 'reference'">
        Feld in der Einreichung
        <select v-model="variable.value">
          <option value="">Feld auswählen</option>
          <option v-for="f in sourceFields(variable.caseId)" :key="f.path" :value="f.path">
            {{ f.label }}
          </option>
        </select>
      </label>
      <label v-else-if="variable.kind !== 'uuid'">
        Standardwert
        <input v-model="variable.value" maxlength="4096" />
      </label>
      <p class="small-note">
        {{ variable.scope === 'request' ? 'Einreichung' : 'Antwort' }} · {{ variable.path }}
      </p>
      <button class="button secondary" @click="remove(variable.id)">Angabe entfernen</button>
    </fieldset>
    <template v-if="scenario.variables.length">
      <h4>Datensätze</h4>
      <p class="small-note">
        Jeder Datensatz erhält einen eigenen Durchlauf. Ohne eigenen Eintrag gilt der Standardwert. Ein
        ausdrücklich geleertes Textfeld ist ein leerer Wert.
      </p>
      <fieldset v-for="(variant, index) in scenario.variants" :key="variant.id" class="scenario-entry">
        <legend>{{ variant.name }}</legend>
        <label>
          Datensatzname
          <input v-model="variant.name" maxlength="160" />
        </label>
        <label
          v-for="variable in scenario.variables.filter((v) => v.kind !== 'uuid' && v.kind !== 'reference')"
          :key="variable.id"
        >
          {{ variable.label }}
          <input
            :value="variant.values.find((v) => v.variableId === variable.id)?.value ?? variable.value"
            maxlength="4096"
            @input="setValue(variant.id, variable, $event)"
          />
        </label>
        <button v-if="index > 0" class="button secondary" @click="scenario.variants.splice(index, 1)">
          Datensatz entfernen
        </button>
      </fieldset>
      <button class="button secondary" :disabled="scenario.variants.length >= 16" @click="variant">
        Datensatz hinzufügen
      </button>
    </template>
  </section>
</template>
