import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

// The Midnight on-chain runtime ships as a WASM ES module; esnext keeps its top-level await.
export default defineConfig({
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('onchain-runtime-v3') ? 'wasm' : undefined),
      },
    },
  },
  plugins: [react(), tailwindcss(), wasm()],
  optimizeDeps: {
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
  },
});
