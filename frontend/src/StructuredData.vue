<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, useId } from 'vue';
import { parseStructuredData, filterStructuredData } from './structured-data.js';
import { mount } from './json-viewer.js';
import ApplicationField from './ApplicationField.vue';
const props = defineProps({ text: String, format: String });
const query = ref(''), mode = ref('form'), treeHost = ref(null);
const inputId = useId(); let viewer, revision = 0;
const model = computed(() => parseStructuredData(props.text, props.format));
const filtered = computed(() => filterStructuredData(model.value.root, query.value));
watch([() => props.text, () => props.format], () => { query.value = ''; mode.value = 'form'; });
watch([() => props.text, mode], async () => {
  const stamp = ++revision; viewer?.destroy(); viewer = null;
  await nextTick();
  if (stamp === revision && mode.value === 'tree' && treeHost.value) viewer = mount(treeHost.value, { text: props.text, title: 'JSON-Struktur' });
}, { immediate: true });
onBeforeUnmount(() => { revision++; viewer?.destroy(); });
</script>
<template>
  <div class="structured-data">
    <div class="application-toolbar"><div class="application-modes" role="group" aria-label="Darstellung der Fachdaten"><button type="button" class="button secondary" :aria-pressed="mode === 'form'" @click="mode = 'form'">Formularansicht</button><button v-if="format === 'json'" type="button" class="button secondary" :aria-pressed="mode === 'tree'" @click="mode = 'tree'">JSON-Struktur</button><button type="button" class="button secondary" :aria-pressed="mode === 'source'" @click="mode = 'source'">Quelltext</button></div><span class="status-badge info">{{ format?.toUpperCase() }}</span></div>
    <p class="small-note">Nur lesende Darstellung der Originalfelder. Feldnamen werden zur Lesbarkeit getrennt; Werte bleiben erhalten. Die Formularansicht ersetzt keine fachliche Prüfung.</p>
    <p v-if="format === 'xml'" class="small-note">Elemente, Attribute und Text werden dargestellt. XML-Leerraum ist separat aufklappbar; Kommentare und Verarbeitungsanweisungen stehen im Quelltext.</p>
    <template v-if="mode === 'form' && model.status === 'ready'">
      <label class="application-search" :for="inputId">Felder durchsuchen<input :id="inputId" v-model="query" type="search" maxlength="160" placeholder="Feldname, Wert oder Pfad"></label>
      <p class="small-note" role="status">{{ query.trim() ? filtered ? 'Passende Felder und Gruppen' : 'Keine passenden Felder gefunden.' : `${model.fieldCount} Felder · verschachtelte Gruppen aufklappbar` }}</p>
      <ApplicationField v-if="filtered" :node="filtered" :query="query.trim()" />
    </template>
    <div v-else-if="mode === 'tree'" ref="treeHost"></div>
    <template v-else><p v-if="mode === 'form'" role="status">{{ model.message }}</p><pre class="application-source">{{ text }}</pre></template>
  </div>
</template>
