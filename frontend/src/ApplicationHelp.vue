<script setup>
import { documentationTopics } from './documentation.js';
import DocumentationLink from './DocumentationLink.vue';
</script>
<template>
  <section class="tool-section" aria-labelledby="help-title">
    <h2 id="help-title">Anleitungen und Beispiele</h2>
    <p>
      Die bebilderte Anleitung finden Sie auf der FBForge-Website. Sie wird dort laufend gepflegt. Die Links
      öffnen Ihren Browser und benötigen Internet.
    </p>
    <p>
      Kurze Erklärungen finden Sie direkt bei den Eingaben. Sie können die Anwendung auch ohne geöffnete
      Anleitung bedienen.
    </p>
    <ul class="documentation-topics">
      <li v-for="item in documentationTopics" :key="item.id">
        <DocumentationLink :topic="item.id">{{ item.title }}</DocumentationLink>
      </li>
    </ul>
  </section>
</template>
