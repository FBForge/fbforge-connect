<script setup lang="ts">
import { clone } from './model.ts';
import type { Scenario } from './types.ts';
const scenario = defineModel<Scenario>({ required: true });
const props = defineProps<{ caseId: string; disabled: boolean; expanded?: boolean }>();
function add() {
  const item = scenario.value.pack.cases.find((c) => c.id === props.caseId);
  if (!item?.reply || (scenario.value.followups || []).length >= 16) return;
  scenario.value.followups ||= [];
  scenario.value.followups.push({
    id: crypto.randomUUID(),
    caseId: item.id,
    name: `Weitere Antwort ${scenario.value.followups.filter((f) => f.caseId === item.id).length + 1}`,
    message: clone(item.reply),
  });
}
function remove(id: string) {
  scenario.value.followups = scenario.value.followups?.filter((f) => f.id !== id);
  const ids = new Set(scenario.value.variables.filter((v) => v.scope === `reply:${id}`).map((v) => v.id));
  scenario.value.variables = scenario.value.variables.filter((v) => !ids.has(v.id));
  scenario.value.rules = scenario.value.rules.filter((r) => r.scope !== `reply:${id}`);
  for (const v of scenario.value.variants) v.values = v.values.filter((row) => !ids.has(row.variableId));
}
function move(id: string, delta: number) {
  const all = scenario.value.followups || [],
    group = all.filter((f) => f.caseId === props.caseId),
    i = group.findIndex((f) => f.id === id);
  if (!group[i + delta]) return;
  const a = all.indexOf(group[i]),
    b = all.indexOf(group[i + delta]);
  [all[a], all[b]] = [all[b], all[a]];
}
</script>
<template>
  <component :is="expanded ? 'section' : 'details'" class="scenario-section">
    <component :is="expanded ? 'h4' : 'summary'">Weitere Antworten im selben Vorgang</component>
    <div class="scenario-section">
      <p class="small-note">
        Ergänzen Sie fachliche Rückmeldungen wie Bearbeitungsstand oder Nachforderung. Jede Antwort erhält
        einen eigenen Nachweis und muss zum eingerichteten Antwortangebot passen. Die technische
        Empfangsbestätigung bleibt ein eigener Schritt.
      </p>
      <ol class="scenario-response-list">
        <li
          v-for="(f, index) in (scenario.followups || []).filter((f) => f.caseId === caseId)"
          :key="f.id"
          class="scenario-entry"
        >
          <label>
            Bezeichnung der Antwort
            <input v-model="f.name" maxlength="160" :disabled="disabled" />
          </label>
          <p class="small-note">
            {{ index + 2 }}. Antwort · {{ f.message.schemaUri }} · {{ f.message.mimeType }}
          </p>
          <div class="client-actions">
            <button class="button secondary" :disabled="disabled || index === 0" @click="move(f.id, -1)">
              Nach oben
            </button>
            <button
              class="button secondary"
              :disabled="
                disabled || index === (scenario.followups || []).filter((r) => r.caseId === caseId).length - 1
              "
              @click="move(f.id, 1)"
            >
              Nach unten
            </button>
            <button class="button secondary" :disabled="disabled" @click="remove(f.id)">
              Antwort entfernen
            </button>
          </div>
        </li>
      </ol>
      <button
        class="button secondary"
        :disabled="
          disabled ||
          !scenario.pack.cases.find((c) => c.id === caseId)?.reply ||
          (scenario.followups || []).length >= 16
        "
        @click="add"
      >
        Weitere Antwort hinzufügen
      </button>
      <p v-if="!scenario.pack.cases.find((c) => c.id === caseId)?.reply" class="small-note">
        Wählen Sie einen Testfall mit Antwortangebot. Sie können mit der Vorlage „Einreichung mit Antwort“
        beginnen.
      </p>
      <p v-else class="small-note">
        Den Inhalt bearbeiten Sie unter „Testdaten → Nachricht bearbeiten“. Prozesskennungen ändern Sie in den
        weiteren Testeinstellungen unter „Adressierung und Prozessnachrichten“.
      </p>
    </div>
  </component>
</template>
