import { defineConfig } from 'vite';

// base './' so the build works from any sub-path (GitHub Pages serves it under /waqu-waqu/).
export default defineConfig({
  base: './',
  build: { target: 'es2019', assetsInlineLimit: 0 },
});
