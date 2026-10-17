<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { helpTopics } from './help/topics.js';
import ContentPreview from './ContentPreview.vue';
const props = defineProps({ topic: { type: String, default: 'start' } });
const emit = defineEmits(['navigate']);
const query = ref(''),
  selectedId = ref(props.topic),
  heading = ref(null),
  searchInput = ref(null),
  illustration = ref(null);
const images = import.meta.glob('./help/screenshots/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const selected = computed(() => helpTopics.find((t) => t.id === selectedId.value) || helpTopics[0]);
const filtered = computed(() =>
  helpTopics.filter((t) =>
    [t.title, t.intro, ...t.steps, ...t.notes]
      .join(' ')
      .toLocaleLowerCase('de')
      .includes(query.value.trim().toLocaleLowerCase('de')),
  ),
);
watch(
  () => props.topic,
  (value) => {
    selectedId.value = value;
    query.value = '';
  },
);
async function open(id) {
  selectedId.value = id;
  await nextTick();
  heading.value?.focus({ preventScroll: true });
  heading.value?.scrollIntoView({ block: 'start' });
}
function showTopics() {
  searchInput.value?.focus({ preventScroll: true });
  searchInput.value?.scrollIntoView({ block: 'center' });
}
function enlarge() {
  illustration.value = {
    kind: 'image',
    url: images[`./help/screenshots/${selected.value.image}.png`],
    filename: selected.value.title,
    notice: selected.value.caption,
    footer: 'Abbildung mit fiktiven Testdaten. Bedienelemente innerhalb des Bildes sind Teil der Anleitung.',
  };
}
</script>
<template>
  <div class="application-help">
    <section class="tool-section">
      <h2>Hilfe und Anleitung</h2>
      <p>Alle Schritte direkt in der Anwendung. Die Abbildungen zeigen ausschließlich fiktive Testdaten.</p>
      <label for="help-search">
        Anleitung durchsuchen
        <input
          id="help-search"
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="Zum Beispiel: Antworten, Schlüssel oder PDF"
        />
      </label>
      <nav aria-label="Hilfethemen" class="help-topics">
        <button
          v-for="topicItem in filtered"
          :key="topicItem.id"
          class="button secondary"
          type="button"
          :aria-current="selected.id === topicItem.id ? 'page' : undefined"
          @click="open(topicItem.id)"
        >
          {{ topicItem.title }}
        </button>
      </nav>
      <p v-if="!filtered.length" role="status">
        Keine passenden Hilfethemen. Versuche einen anderen Begriff.
      </p>
    </section>
    <article class="tool-section help-article" aria-labelledby="help-topic-title">
      <button class="button secondary" type="button" @click="showTopics">Alle Hilfethemen</button>
      <h2 id="help-topic-title" ref="heading" tabindex="-1">{{ selected.title }}</h2>
      <p>{{ selected.intro }}</p>
      <figure v-if="images[`./help/screenshots/${selected.image}.png`]">
        <img
          :src="images[`./help/screenshots/${selected.image}.png`]"
          :alt="selected.caption"
          loading="lazy"
        />
        <figcaption>{{ selected.caption }}</figcaption>
        <button class="button secondary" type="button" @click="enlarge">Abbildung vergrößern</button>
      </figure>
      <h3>Schritt für Schritt</h3>
      <ol>
        <li v-for="step in selected.steps" :key="step">{{ step }}</li>
      </ol>
      <h3>Gut zu wissen</h3>
      <ul>
        <li v-for="note in selected.notes" :key="note">{{ note }}</li>
      </ul>
      <button
        v-if="selected.section"
        class="button"
        type="button"
        @click="emit('navigate', selected.section)"
      >
        Zum Bereich {{ selected.section }}
      </button>
    </article>
    <ContentPreview v-if="illustration" :preview="illustration" @close="illustration = null" />
  </div>
</template>
