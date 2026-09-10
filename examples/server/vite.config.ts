import { defineConfig } from 'vite'

import { serve } from '@pingid/vite/plugin/server'

export default defineConfig({
  resolve: { conditions: ['ts'] },
  plugins: [
    serve({
      // a bare fetch handler — no framework, which is the point
      '/api': { file: './src/api.ts', preview: './dist/server/api.js', upgrade: (m) => m.upgrade },
      // same app again, but ephemeral: re-transformed and re-evaluated per request
      '/fresh': { file: './src/fresh.ts', fresh: true, preview: './dist/server/fresh.js' },
      // a plain Node handler, mounted as-is
      '/legacy': './src/legacy.ts',
    }),
  ],
})
