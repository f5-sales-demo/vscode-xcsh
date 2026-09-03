import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const temmlRuntime = readFileSync(require.resolve('temml/dist/temml.min.js'), 'utf8');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'bundle-temml-runtime',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'assets/temml.min.js', source: temmlRuntime });
      },
    },
  ],
  resolve: {
    // Rolldown currently corrupts the published module's surrogate-pair lexer
    // range. Load Temml's pinned browser build unchanged and bind this shim to
    // its global so control words remain intact.
    alias: { temml: fileURLToPath(new URL('./src/temml-runtime.ts', import.meta.url)) },
  },
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
