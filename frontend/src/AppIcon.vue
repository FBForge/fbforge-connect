<script setup>
defineProps({ name: String });
const paths = {
  home: 'm3 10 9-7 9 7v11h-6v-7H9v7H3V10Z',
  send: 'm21 3-7 18-4-7-7-4 18-7ZM21 3 10 14',
  receive: 'M12 3v12m-5-5 5 5 5-5M5 14H3v7h18v-7h-2',
  events: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
  process: 'M3 3h6v6H3V3Zm12 12h6v6h-6v-6ZM9 6h9v9M6 9v9h9',
  destinations: 'M4 3h16v18H4V3ZM8 7h2m4 0h2M8 11h2m4 0h2M10 21v-6h4v6',
  diagnostics: 'M3 12h4l3-8 4 16 3-8h4',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  connection: 'M8 3v4m8-4v4M6 7h12v3a6 6 0 0 1-12 0V7Zm6 9v5',
  sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M5 5 3 3m18 18-2-2M5 19l-2 2M21 3l-2 2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  close: 'm6 6 12 12M6 18 18 6',
};
</script>
<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.info" />
  </svg>
</template>
