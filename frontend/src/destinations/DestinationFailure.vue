<script setup>
defineProps({ failure: { type: Object, required: true } });
</script>
<template>
  <details class="destination-failure">
    <summary>Technische Fehlerdetails</summary>
    <p>
      Fehlercode:
      <code data-destination-error>{{ failure.error }}</code>
    </p>
    <p v-if="failure.httpStatus">
      HTTP-Status:
      <code data-destination-http>{{ failure.httpStatus }}</code>
    </p>
    <p v-if="failure.problemType">
      Problemtyp:
      <code data-destination-problem>{{ failure.problemType }}</code>
    </p>
  </details>
</template>
