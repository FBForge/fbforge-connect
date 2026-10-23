<script setup>
defineProps({ history: Array, busy: Boolean });
const emit = defineEmits(['event-log']);
</script>
<template>
  <section v-if="history.length" class="tool-section" aria-labelledby="receipt-history-title">
    <h2 id="receipt-history-title">Empfangsaktionen</h2>
    <p class="small-note">
      Die letzten 20 Ergebnisse dieser Anwendungssitzung. Bekannte Kennungen bleiben auch bei einem ungewissen
      Ausgang verfügbar.
    </p>
    <div class="client-table support-table">
      <table class="receipt-history-table">
        <thead>
          <tr>
            <th scope="col">API / Aktion</th>
            <th scope="col">Ergebnis</th>
            <th scope="col">Einreichung / Vorgang</th>
            <th scope="col">Aktion</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in history" :key="item.attemptId">
            <td data-label="API / Aktion">
              {{ item.apiVersion }} · {{ item.action === 'accept' ? 'Annehmen' : 'Ablehnen' }}
            </td>
            <td data-label="Ergebnis">
              {{
                item.status === 'confirmed'
                  ? 'Bestätigt'
                  : item.status === 'uncertain'
                    ? 'Ausgang ungewiss'
                    : 'Nicht abgeschlossen'
              }}
            </td>
            <td data-label="Einreichung / Vorgang">
              <code>{{ item.submissionId }}</code>
              <br />
              <code>{{ item.caseId }}</code>
            </td>
            <td data-label="Aktion">
              <button
                class="button secondary"
                type="button"
                :disabled="busy"
                @click="emit('event-log', item)"
              >
                Event Log prüfen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
