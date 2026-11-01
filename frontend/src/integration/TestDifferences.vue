<script setup>
defineProps({ differences: Array });
</script>
<template>
  <div v-if="differences.length" class="table-scroll" tabindex="0" aria-label="Unterschiede zum Testfall">
    <table>
      <thead>
        <tr>
          <th>Feld</th>
          <th>Erwartet</th>
          <th>Tatsächlich</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="difference in differences" :key="difference.path">
          <td>
            <code>{{ difference.path }}</code>
          </td>
          <td>{{ difference.expected }}</td>
          <td>{{ difference.actual }}</td>
        </tr>
      </tbody>
    </table>
    <p class="small-note">
      Bis zu 20 Abweichungen werden angezeigt. Der Vergleich prüft weiterhin den vollständigen Inhalt.
    </p>
  </div>
</template>
