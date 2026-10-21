import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Which build a play statistic came from: commit and build date, e.g. "445b0c2.1021". */
function build() {
  let rev = 'local';
  try {
    rev = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    /* not a git checkout */
  }
  const d = new Date();
  return `${rev}.${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// base './' so the build works from any sub-path (GitHub Pages serves it under /waqu-waqu/).
export default defineConfig({
  base: './',
  build: { target: 'es2019', assetsInlineLimit: 0 },
  define: { __BUILD__: JSON.stringify(build()) },
});
