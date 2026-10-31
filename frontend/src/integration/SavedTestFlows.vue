<script setup>
import { ref, computed, onBeforeUnmount, nextTick, useId } from 'vue';
import { invoke } from '../native.js';
import { listTestFlows, saveTestFlow, readTestFlow, deleteTestFlow } from './test-flow-library.js';
const props = defineProps({ flow: Object, busy: Boolean });
const emit = defineEmits(['open', 'busy']);
const entries = ref([]),
  choice = ref(''),
  pending = ref(false),
  notice = ref(''),
  error = ref('');
const selected = computed(() => entries.value.find((entry) => entry.id === choice.value));
const dialog = ref(null),
  removeButton = ref(null),
  loadButton = ref(null),
  id = useId();
let alive = true;
onBeforeUnmount(() => {
  alive = false;
  dialog.value?.close();
});
async function act(operation) {
  if (pending.value || props.busy) return;
  pending.value = true;
  notice.value = error.value = '';
  emit('busy', true);
  try {
    await operation();
  } catch (cause) {
    if (alive)
      error.value =
        (typeof cause === 'string' ? cause : cause?.message) === 'vault_unsupported'
          ? 'Geschütztes Speichern ist auf diesem Betriebssystem nicht verfügbar. Sie können den Ablauf als Datei exportieren.'
          : 'Die Aktion in der Testablaufsammlung ist fehlgeschlagen. Prüfen Sie Speicherzugriff und Dateiformat. Die Sammlung umfasst höchstens 32 Abläufe mit insgesamt 64 MiB und knapp 8 MiB je Ablauf. Ihr geöffneter Ablauf bleibt erhalten.';
  } finally {
    pending.value = false;
    emit('busy', false);
  }
}
function load() {
  return act(async () => {
    const result = await listTestFlows(invoke);
    if (alive) {
      entries.value = result;
      notice.value =
        result.length === 1
          ? '1 gespeicherter Ablauf.'
          : result.length
            ? `${result.length} gespeicherte Abläufe.`
            : 'Noch keine Abläufe gespeichert.';
    }
  });
}
function save() {
  return act(async () => {
    if (!props.flow) return;
    const saved = await saveTestFlow(invoke, props.flow);
    const result = await listTestFlows(invoke);
    if (alive) {
      entries.value = result;
      choice.value = saved.id;
      notice.value = `„${saved.name}“ wurde dauerhaft für Ihr Windows-Benutzerkonto gespeichert.`;
    }
  });
}
function open() {
  return act(async () => {
    const result = await readTestFlow(invoke, choice.value);
    if (alive) {
      emit('open', result);
      notice.value = '';
    }
  });
}
function remove() {
  return act(async () => {
    const target = choice.value;
    await deleteTestFlow(invoke, target);
    if (alive) {
      entries.value = entries.value.filter((row) => row.id !== target);
      choice.value = '';
      notice.value = 'Gespeicherter Ablauf gelöscht. Der geöffnete Ablauf bleibt erhalten.';
    }
  });
}
async function close(removeEntry = false) {
  dialog.value?.close();
  if (removeEntry) await remove();
  await nextTick();
  if (removeButton.value && !removeButton.value.disabled) removeButton.value.focus();
  else loadButton.value?.focus();
}
</script>
<template>
  <section class="saved-test-flows" :aria-labelledby="`${id}-heading`">
    <h3 :id="`${id}-heading`">Gespeicherte Testabläufe</h3>
    <p class="small-note">
      Abläufe mit Testdaten und Anlagen werden lokal für Ihr Windows-Benutzerkonto verschlüsselt gespeichert.
      Sie bleiben nach einem Neustart verfügbar und sind unabhängig vom verbundenen FIT-Connect-Profil.
      Ergebnisse eines laufenden Durchlaufs bleiben nur in dieser Sitzung.
    </p>
    <div class="client-actions">
      <button class="button secondary" type="button" :disabled="busy || pending || !flow" @click="save">
        Ablauf lokal speichern
      </button>
      <button
        ref="loadButton"
        class="button secondary"
        type="button"
        :disabled="busy || pending"
        @click="load"
      >
        Gespeicherte Abläufe laden
      </button>
    </div>
    <template v-if="entries.length">
      <label :for="`${id}-choice`">
        <span :id="`${id}-choice-label`">Gespeicherten Ablauf auswählen</span>
        <select
          :id="`${id}-choice`"
          :aria-labelledby="`${id}-choice-label`"
          v-model="choice"
          :disabled="busy || pending"
        >
          <option value="">Bitte auswählen</option>
          <option v-for="entry in entries" :key="entry.id" :value="entry.id">
            {{ entry.name }} · {{ entry.stepCount }} Schritte
          </option>
        </select>
      </label>
      <div class="client-actions">
        <button class="button secondary" type="button" :disabled="busy || pending || !selected" @click="open">
          Gespeicherten Ablauf öffnen
        </button>
        <button
          ref="removeButton"
          class="button secondary"
          type="button"
          :disabled="busy || pending || !selected"
          @click="dialog.showModal()"
        >
          Gespeicherten Ablauf löschen
        </button>
      </div>
    </template>
    <p v-if="pending" role="status">Testablaufsammlung wird verarbeitet …</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <Teleport to="body">
      <dialog ref="dialog" class="tool-dialog" :aria-labelledby="`${id}-delete`" @cancel.prevent="close()">
        <h2 :id="`${id}-delete`">Gespeicherten Ablauf löschen?</h2>
        <p>
          „{{ selected?.name }}“ wird aus der lokalen Sammlung entfernt. Der geöffnete Ablauf und Ihre
          Testpakete bleiben erhalten.
        </p>
        <div class="client-actions">
          <button class="button secondary" type="button" autofocus @click="close()">Abbrechen</button>
          <button class="button" type="button" @click="close(true)">Ablauf löschen</button>
        </div>
      </dialog>
    </Teleport>
  </section>
</template>
