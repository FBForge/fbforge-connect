<script setup>
defineProps({ details: Object, pending: Boolean });
</script>
<template>
  <div class="event-payload">
    <p v-if="!details" class="small-note" role="status">
      {{
        pending
          ? 'Ereignisdetails werden geladen …'
          : 'Ereignisdetails sind noch nicht verfügbar. Bitte erneut prüfen.'
      }}
    </p>
    <p v-else-if="details.error" role="alert">
      Die Ereignisdetails konnten nicht gelesen werden. Laden Sie den Event Log erneut.
    </p>
    <dl v-else aria-label="Ereignisdetails" class="event-payload-fields">
      <template v-for="(row, index) in details.rows" :key="index">
        <dt :title="row.path">{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>
  </div>
</template>
<style scoped>
.event-payload {
  margin-block: 16px;
}
.event-payload-fields {
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) minmax(0, 2fr);
  gap: 0;
  border-top: 1px solid var(--line);
}
dt,
dd {
  margin: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
dt {
  color: var(--muted);
  background: var(--surface-soft);
  font-size: 13px;
}
@media (max-width: 700px) {
  .event-payload-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  dt {
    border-bottom: 0;
    padding-bottom: 4px;
  }
  dd {
    padding-top: 0;
  }
}
</style>
