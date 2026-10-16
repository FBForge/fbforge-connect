<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
const props = defineProps({
  xml: String,
  selectedId: String,
  highlights: { type: Array, default: () => [] },
  visible: Boolean,
});
const emit = defineEmits(['select']);
const container = ref(null),
  notice = ref('');
let viewer,
  revision = 0,
  markers = [];
function mark() {
  if (!viewer) return;
  const canvas = viewer.get('canvas'),
    registry = viewer.get('elementRegistry');
  for (const [id, style] of markers) if (registry.get(id)) canvas.removeMarker(id, style);
  markers = [];
  for (const id of props.highlights)
    if (registry.get(id)) {
      canvas.addMarker(id, 'bpmn-message-received');
      markers.push([id, 'bpmn-message-received']);
    }
  if (props.selectedId && registry.get(props.selectedId)) {
    canvas.addMarker(props.selectedId, 'bpmn-message-selected');
    markers.push([props.selectedId, 'bpmn-message-selected']);
  }
}
async function load() {
  const stamp = ++revision;
  notice.value = '';
  if (!viewer || !props.xml) return;
  try {
    await viewer.importXML(props.xml);
    if (stamp !== revision) return;
    await nextTick();
    fit();
    mark();
  } catch {
    if (stamp === revision)
      notice.value =
        'Für dieses Modell kann keine grafische Ansicht angezeigt werden. Die Nachrichtenliste bleibt verfügbar.';
  }
}
function fit() {
  try {
    viewer?.get('canvas').resized();
    viewer?.get('canvas').zoom('fit-viewport', 'auto');
  } catch {
    /* Models without diagram use the accessible message list. */
  }
}
function zoom(factor) {
  try {
    const canvas = viewer.get('canvas');
    canvas.zoom(Math.max(0.2, Math.min(4, canvas.zoom() * factor)));
  } catch {
    /* Unavailable diagram. */
  }
}
onMounted(() => {
  viewer = new NavigatedViewer({ container: container.value });
  viewer.on('element.click', (event) => emit('select', event.element.id));
  void load();
});
watch(
  () => props.xml,
  () => void load(),
);
watch(() => [props.selectedId, props.highlights], mark, { deep: true });
watch(
  () => props.visible,
  async (value) => {
    if (value) {
      await nextTick();
      fit();
    }
  },
);
onBeforeUnmount(() => {
  revision++;
  viewer?.destroy();
  viewer = null;
});
</script>
<template>
  <div class="bpmn-diagram-panel">
    <div class="client-actions" aria-label="Modellansicht">
      <button class="button secondary" @click="fit">Modell einpassen</button>
      <button class="button secondary" aria-label="Modell vergrößern" @click="zoom(1.25)">Vergrößern</button>
      <button class="button secondary" aria-label="Modell verkleinern" @click="zoom(0.8)">Verkleinern</button>
    </div>
    <p class="small-note">
      Eine Nachricht im Modell anklicken oder in der Liste darunter auswählen. Die Liste lässt sich
      vollständig mit der Tastatur bedienen.
    </p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div
      ref="container"
      class="bpmn-diagram"
      role="region"
      aria-label="BPMN-Prozessmodell. Die gleichen Nachrichten und Kennungen stehen in der folgenden Liste."
    ></div>
  </div>
</template>
