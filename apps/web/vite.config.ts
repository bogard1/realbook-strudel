import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'realbook-strudel';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: process.env.GITHUB_ACTIONS ? `/${repository}/` : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
