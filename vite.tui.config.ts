import { defineConfig } from 'vite';

// Strudel packages publish their browser build through `module`, while Node
// otherwise resolves a CommonJS compatibility entry. Bundling these packages
// lets the terminal player use the same evaluator as the web application.
export default defineConfig({
  ssr: {
    noExternal: [
      '@strudel/core',
      '@strudel/mini',
      '@strudel/tonal',
      '@strudel/transpiler',
      '@kabelsalat/web',
      '@kabelsalat/core',
      '@kabelsalat/lib',
    ],
  },
});
