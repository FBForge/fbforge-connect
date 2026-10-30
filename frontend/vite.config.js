import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Entry-aware groups retain lazy imports; keep their filenames short on Windows.
        chunkFileNames: (chunk) => `assets/${chunk.name.split('~')[0]}-[hash].js`,
        codeSplitting: {
          groups: [
            { name: 'license-texts', test: /[\\/]licenses[\\/].*\?raw$/, entriesAware: true },
            {
              name: 'destination-tools',
              test: /[\\/]frontend[\\/]src[\\/](?:Destination[^\\/]*\.vue|destination-[^\\/]*\.js|destinations[\\/])/,
              entriesAware: true,
            },
          ],
        },
      },
    },
  },
});
