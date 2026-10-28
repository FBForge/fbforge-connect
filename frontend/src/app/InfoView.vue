<script setup>
import { ref } from 'vue';
defineProps({ visible: Boolean });
import AppIcon from '../AppIcon.vue';
import appLogo from '../assets/test-client.png';
import { productName, productPurpose } from '../product.js';
import packageInfo from '../../../package.json';
import licenseText from '../../../LICENSE?raw';
import bpmnLicense from '../../../licenses/bpmn-js.txt?raw';
import apacheLicense from '../../../licenses/Apache-2.0.txt?raw';
import pdfLicense from '../../../licenses/pdfjs-NOTICE.txt?raw';
const version = packageInfo.version;
const licenseDialog = ref(null);
const dependencyDialog = ref(null);
const frontendLicenses = ref('');
async function showDependencyLicenses() {
  dependencyDialog.value.showModal();
  frontendLicenses.value = 'Lizenztexte werden geladen.';
  try {
    frontendLicenses.value = (await import('../../../licenses/frontend.txt?raw')).default;
  } catch {
    frontendLicenses.value =
      'Die zusätzlichen Lizenztexte konnten nicht geladen werden. Bitte erneut öffnen.';
  }
}
</script>
<template>
  <div v-show="visible" class="info-view">
    <section class="tool-section app-info" aria-labelledby="about-title">
      <img class="app-mark large" :src="appLogo" alt="" width="64" height="64" />
      <div>
        <p class="workspace-eyebrow">Desktop-Anwendung</p>
        <h2 id="about-title">{{ productName }}</h2>
        <p>Version {{ version }}</p>
        <p>{{ productPurpose }}.</p>
      </div>
    </section>
    <section class="tool-section" aria-labelledby="scope-title">
      <h2 id="scope-title">Aktueller Funktionsumfang</h2>
      <dl class="info-facts">
        <dt>Umgebung</dt>
        <dd>FIT-Connect TEST, STAGE und PROD</dd>
        <dt>Austausch</dt>
        <dd>Senden, Empfangen, lokale Entschlüsselung und technische Fachdatenprüfung über API v2 und v3</dd>
        <dt>Verwaltung</dt>
        <dd>Vorhandene eigene Destinations ansehen. Änderungen und Bulk-Edit über API v3</dd>
      </dl>
    </section>
    <section class="tool-section" aria-labelledby="license-title">
      <h2 id="license-title">Lizenz und Einordnung</h2>
      <p>Unabhängiges Projekt. Kein offizielles Produkt der FITKO.</p>
      <p>Diese Anwendung steht unter der European Union Public Licence 1.2 (EUPL-1.2).</p>
      <div class="client-actions">
        <button type="button" class="button secondary" @click="licenseDialog.showModal()">
          Lizenztext anzeigen
        </button>
        <button type="button" class="button secondary" @click="showDependencyLicenses">
          Drittanbieter-Lizenzen anzeigen
        </button>
      </div>
    </section>
  </div>
  <dialog ref="dependencyDialog" class="tool-dialog license-dialog" aria-labelledby="dependency-title">
    <h2 id="dependency-title">Drittanbieter-Komponenten und Lizenzen</h2>
    <button class="button secondary" @click="dependencyDialog.close()">Schließen</button>
    <p>
      Lizenz- und Urheberrechtshinweise der mitgelieferten Komponenten und PDF-Schriftarten. Die Lizenz der
      Anwendung können Sie separat unter „Lizenztext anzeigen“ lesen.
    </p>
    <pre
      >{{ bpmnLicense }}

{{ apacheLicense }}
{{ pdfLicense }}

{{ frontendLicenses }}</pre>
  </dialog>
  <dialog ref="licenseDialog" class="tool-dialog license-dialog" aria-labelledby="license-dialog-title">
    <div class="tool-section-heading">
      <h2 id="license-dialog-title">European Union Public Licence 1.2</h2>
      <button
        type="button"
        class="icon-button"
        aria-label="Lizenztext schließen"
        @click="licenseDialog.close()"
      >
        <AppIcon name="close" />
      </button>
    </div>
    <pre>{{ licenseText }}</pre>
  </dialog>
</template>
