<script setup>
import { ref, useId, onMounted, onBeforeUnmount } from 'vue';

const layout = ref(null);
const id = useId();
let observer;
let updateHeight;
onMounted(() => {
  // The workspace header can wrap at larger text sizes. Use the actual reading viewport.
  const viewport = layout.value.closest('.workspace-scroll');
  updateHeight = () => {
    const bounds = viewport?.getBoundingClientRect();
    const height = bounds ? Math.min(innerHeight, bounds.bottom) - Math.max(0, bounds.top) : innerHeight;
    layout.value.style.setProperty('--document-aside-height', `${Math.max(0, height - 32)}px`);
  };
  observer = new ResizeObserver(updateHeight);
  observer.observe(viewport || document.documentElement);
  window.addEventListener('resize', updateHeight);
  updateHeight();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('resize', updateHeight);
});
</script>
<template>
  <div ref="layout" class="document-reading">
    <a class="button secondary document-shortcut" :href="`#${id}-aside`">Zu Anlagen und Aktionen</a>
    <div class="document-layout">
      <div :id="`${id}-data`" class="document-main" tabindex="-1"><slot name="data" /></div>
      <aside :id="`${id}-aside`" class="document-aside" aria-label="Anlagen und Aktionen" tabindex="-1">
        <slot name="aside" />
        <a class="document-return" :href="`#${id}-data`">Zurück zu den Fachdaten</a>
      </aside>
    </div>
  </div>
</template>
