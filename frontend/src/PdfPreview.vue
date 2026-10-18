<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
const fonts = import.meta.glob('../../node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', {
  eager: true,
  query: '?url',
  import: 'default',
});
class LocalFonts {
  async fetch({ kind, filename }) {
    if (kind !== 'standardFontDataUrl') throw new Error('resource_blocked');
    const url = fonts[`../../node_modules/pdfjs-dist/standard_fonts/${filename}`];
    if (!url) throw new Error('font_unavailable');
    const response = await fetch(url);
    if (!response.ok) throw new Error('font_unavailable');
    return new Uint8Array(await response.arrayBuffer());
  }
}
const props = defineProps({ bytes: Uint8Array });
const canvas = ref(null),
  pageNumber = ref(1),
  pages = ref(0),
  pending = ref(true),
  error = ref(''),
  text = ref('');
let document,
  task,
  worker,
  workerWrapper,
  rendering,
  timer,
  revision = 0,
  disposed = false;
function cleanup() {
  rendering?.cancel();
  void task?.destroy().catch(() => {});
  workerWrapper?.destroy();
  worker?.terminate();
  task = null;
  document = null;
}
async function render() {
  if (!document || disposed) return;
  const stamp = ++revision;
  rendering?.cancel();
  pending.value = true;
  text.value = '';
  error.value = '';
  try {
    const page = await document.getPage(pageNumber.value);
    if (stamp !== revision || disposed) return;
    const normal = page.getViewport({ scale: 1 });
    if (normal.width <= 0 || normal.height <= 0 || normal.width * normal.height > 16000000)
      throw new Error('limit');
    const scale = Math.min(1.5, 1500 / normal.width, 2000 / normal.height);
    const viewport = page.getViewport({ scale });
    canvas.value.width = Math.ceil(viewport.width);
    canvas.value.height = Math.ceil(viewport.height);
    rendering = page.render({
      canvasContext: canvas.value.getContext('2d'),
      viewport,
      annotationMode: 0,
      intent: 'display',
    });
    await rendering.promise;
    const content = await page.getTextContent({ disableNormalization: true });
    if (stamp === revision && !disposed) {
      let remaining = 100000;
      const excerpts = [];
      for (const item of content.items.slice(0, 10000)) {
        if (remaining <= 0) break;
        const value = (item.str || '').slice(0, remaining);
        excerpts.push(value);
        remaining -= value.length + 1;
      }
      text.value = excerpts.join(' ');
    }
    page.cleanup();
  } catch (cause) {
    if (stamp === revision && !disposed && cause?.name !== 'RenderingCancelledException')
      error.value =
        'Diese PDF-Seite konnte innerhalb der Vorschaugrenzen nicht dargestellt werden. Bitte das Original herunterladen.';
  } finally {
    if (stamp === revision) pending.value = false;
  }
}
watch(pageNumber, () => {
  timer = setTimeout(() => {
    error.value = 'Die PDF-Vorschau hat zu lange benötigt. Der Originaldownload bleibt verfügbar.';
    cleanup();
    pending.value = false;
  }, 20000);
  void render().finally(() => clearTimeout(timer));
});
onMounted(async () => {
  timer = setTimeout(() => {
    error.value =
      'Die PDF-Vorschau wurde nach 20 Sekunden abgebrochen. Der Originaldownload bleibt verfügbar.';
    cleanup();
    pending.value = false;
  }, 20000);
  try {
    const pdf = await import('pdfjs-dist/build/pdf.mjs');
    if (disposed) return;
    pdf.GlobalWorkerOptions.workerSrc = workerUrl;
    worker = new Worker(workerUrl, { type: 'module' });
    workerWrapper = new pdf.PDFWorker({ port: worker });
    task = pdf.getDocument({
      worker: workerWrapper,
      data: props.bytes.slice(),
      isEvalSupported: false,
      enableXfa: false,
      disableAutoFetch: true,
      disableStream: true,
      useWorkerFetch: false,
      BinaryDataFactory: LocalFonts,
      useSystemFonts: false,
      disableFontFace: true,
      useWasm: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      maxImageSize: 16000000,
      stopAtErrors: true,
    });
    document = await task.promise;
    if (disposed) return;
    if (document.numPages > 50) {
      cleanup();
      throw new Error('limit');
    }
    pages.value = document.numPages;
    await render();
  } catch {
    if (!disposed && !error.value)
      error.value =
        'Die PDF-Datei ist beschädigt, geschützt oder überschreitet die Vorschaugrenze von 50 Seiten. Der Originaldownload bleibt verfügbar.';
  } finally {
    clearTimeout(timer);
    pending.value = false;
  }
});
onBeforeUnmount(() => {
  disposed = true;
  revision++;
  clearTimeout(timer);
  cleanup();
  if (canvas.value) {
    canvas.value.width = 0;
    canvas.value.height = 0;
  }
});
</script>
<template>
  <div class="pdf-preview" :aria-busy="pending">
    <div v-if="pages" class="client-actions" role="group" aria-label="PDF-Seiten">
      <button
        class="button secondary"
        type="button"
        :disabled="pending || pageNumber <= 1"
        @click="pageNumber--"
      >
        Vorherige Seite
      </button>
      <span aria-live="polite">Seite {{ pageNumber }} von {{ pages }}</span>
      <button
        class="button secondary"
        type="button"
        :disabled="pending || pageNumber >= pages"
        @click="pageNumber++"
      >
        Nächste Seite
      </button>
    </div>
    <p v-if="pending" role="status">PDF wird lokal dargestellt …</p>
    <p v-if="error" role="status">{{ error }}</p>
    <canvas
      v-show="!error"
      ref="canvas"
      role="img"
      :aria-label="`PDF-Seite ${pageNumber}; zugänglicher Text folgt unter der Vorschau`"
    />
    <details v-if="text">
      <summary>Seitentext lesen</summary>
      <p class="pdf-page-text">{{ text }}</p>
    </details>
    <p v-else-if="!pending && !error" class="small-note">
      Diese Seite enthält keinen auslesbaren Text. Für gescannte Dokumente steht keine Texterkennung zur
      Verfügung.
    </p>
  </div>
</template>
