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
export default defineConfig(({ mode }) => ({
  base: './',
  build: { target: 'es2019', assetsInlineLimit: 0 },
  define: {
    __BUILD__: JSON.stringify(build()),
    __UNLOCK_ALL__: JSON.stringify(mode === 'trial' || process.env.WAQU_UNLOCK_ALL === '1'),
    __AUTO_DEMO__: JSON.stringify(mode === 'trial' || process.env.WAQU_AUTO === '1'),
  },
}));
