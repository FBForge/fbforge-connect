<script setup>
defineProps({ warnings: { type: Array, default: () => [] } });
const warning = (stage) =>
  ({
    MALWARE_SCAN_PASSED: 'Der eingerichtete Scanner hat die Inhalte freigegeben.',
    MALWARE_ATTACHMENT_BLOCKED:
      'Gesperrte Anlagen bleiben unzugänglich. Die Annahme bestätigt die gesamte Nachricht und meldet die Anlagen als Problem an FIT-Connect. Eine zusätzliche Bestätigung ist erforderlich.',
    MALWARE_SCAN_NOT_CONFIGURED: 'Kein Malwarescan durchgeführt.',
    XML_SCHEMA_NOT_CHECKED: 'Keine XSD-Prüfung durchgeführt.',
    DATA_SCHEMA_INVALID:
      'Die Fachdaten weichen vom Schema ab. Bei der Annahme wird dies als Problem an FIT-Connect gemeldet.',
  })[stage] || `SDK-Prüfhinweis: ${stage}`;
</script>

<template>
  <ul v-if="warnings.length">
    <li v-for="stage in warnings" :key="stage">{{ warning(stage) }}</li>
  </ul>
</template>
