<script setup>
defineProps({ detail: Object, labels: Object });
</script>
<template>
  <dl>
    <dt>Status</dt>
    <dd>{{ detail.status }}</dd>
    <dt>Metadatenversionen</dt>
    <dd>{{ detail.metadataVersions.join(', ') }}</dd>
    <template v-for="(value, key) in detail.contact" :key="key">
      <dt>{{ labels[key] }}</dt>
      <dd class="receipt-description">
        {{ Array.isArray(value) ? value.join(', ') : value || 'Nicht gesetzt' }}
      </dd>
    </template>
  </dl>
</template>
