<script setup>
defineProps({
  page: Object,
  selected: Array,
  disabled: Boolean,
  locked: Boolean,
  canEdit: Boolean,
  canSelect: Boolean,
});
const emit = defineEmits(['selection', 'toggle', 'edit-selection', 'inspect', 'edit', 'search', 'backup']);
</script>
<template>
  <section aria-label="Destination-Liste">
    <p role="status">
      {{ page.totalCount }} eigene Destinations
      <span v-if="canSelect">· {{ selected.length }} von höchstens 10 ausgewählt</span>
    </p>
    <div
      v-if="selected.length"
      class="client-actions destination-selection-actions"
      aria-label="Ausgewählte Destinations"
    >
      <button v-if="canEdit" class="button" :disabled="disabled || locked" @click="emit('edit-selection')">
        {{ selected.length }}
        {{ selected.length === 1 ? 'Destination bearbeiten' : 'Destinations gemeinsam bearbeiten' }}
      </button>
      <button
        v-if="canSelect"
        class="button secondary"
        :disabled="disabled || locked"
        @click="emit('backup', selected)"
      >
        Auswahl sichern
      </button>
      <button class="button secondary" :disabled="disabled || locked" @click="emit('selection', [])">
        Auswahl aufheben
      </button>
    </div>
    <div v-if="canSelect && page.destinations.length" class="client-actions">
      <button
        class="button secondary"
        :disabled="disabled || locked"
        @click="emit('selection', page.destinations.slice(0, 10))"
      >
        {{ page.destinations.length <= 10 ? 'Alle auswählen (diese Seite)' : 'Erste 10 auswählen' }}
      </button>
      <button
        v-if="page.destinations.length > 10"
        class="button secondary"
        :disabled="disabled || locked"
        @click="emit('selection', page.destinations.slice(10, 20))"
      >
        Nächste {{ page.destinations.length - 10 }} auswählen
      </button>
    </div>
    <div class="client-table support-table">
      <table class="submission-result-table destination-manager-table">
        <thead>
          <tr>
            <th v-if="canSelect" scope="col">Auswahl</th>
            <th scope="col">Name / Destination</th>
            <th scope="col">Status</th>
            <th scope="col">Aktion</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in page.destinations" :key="row.destinationId">
            <td v-if="canSelect" data-label="Auswahl">
              <input
                type="checkbox"
                :aria-label="`${row.name || row.destinationId} auswählen`"
                :checked="selected.some((item) => item.destinationId === row.destinationId)"
                :disabled="
                  disabled ||
                  locked ||
                  (!selected.some((item) => item.destinationId === row.destinationId) &&
                    selected.length >= 10)
                "
                @change="emit('toggle', row, $event.target.checked)"
              />
            </td>
            <td data-label="Name / Destination">
              {{ row.name || 'Ohne Namen' }}
              <br />
              <code>{{ row.destinationId }}</code>
            </td>
            <td data-label="Status">{{ row.status || 'Unbekannt' }}</td>
            <td data-label="Aktion">
              <div class="client-actions">
                <button
                  v-if="canSelect"
                  class="button secondary"
                  :disabled="disabled"
                  @click="emit('backup', [row])"
                >
                  Sichern
                </button>
                <button
                  class="button secondary"
                  :data-open-destination="row.destinationId"
                  :disabled="disabled"
                  @click="emit('inspect', row)"
                >
                  Ansehen
                </button>
                <button
                  v-if="canEdit && !locked && selected.length < 2"
                  class="button secondary"
                  :data-edit-destination="row.destinationId"
                  :disabled="disabled"
                  @click="emit('edit', row)"
                >
                  Bearbeiten
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="client-actions">
      <button
        class="button secondary"
        :disabled="disabled || page.offset === 0"
        @click="emit('search', page.offset - 20)"
      >
        Vorherige Seite
      </button>
      <button
        class="button secondary"
        :disabled="
          disabled || page.offset + page.destinations.length >= page.totalCount || page.offset >= 10000
        "
        @click="emit('search', page.offset + 20)"
      >
        Nächste Seite
      </button>
    </div>
  </section>
</template>
