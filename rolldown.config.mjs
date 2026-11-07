import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import { basename } from 'path';
import { defineConfig } from 'rolldown';

const require = createRequire(import.meta.url);
const isProd = !process.env.ROLLDOWN_WATCH;

const shared = {
  // The host runs in VS Code Web too, so both bundles avoid Node modules.
  platform: 'browser',
  transform: {
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV ?? (isProd ? 'production' : 'development'),
      ),
    },
  },
};

/** Emit the scripts that exported HTML embeds. */
function pageClients() {
  return {
    name: 'page-clients',
    async generateBundle() {
      for (const client of ['client.js', 'client-math.js']) {
        const path = require.resolve(`@markmap/page/${client}`);
        this.emitFile({
          type: 'asset',
          fileName: `page/${basename(path)}`,
          source: await readFile(path, 'utf8'),
        });
      }
    },
  };
}

export default defineConfig([
  {
    ...shared,
    input: { main: 'src/webview/main.ts' },
    output: {
      format: 'es',
      dir: 'dist/webview',
      chunkFileNames: '[name]-[hash].js',
      minify: isProd,
    },
  },
  {
    ...shared,
    // Must be a single file because VSCode web extension only accepts one
    input: { extension: 'src/extension.ts' },
    plugins: [pageClients()],
    external: ['vscode'],
    output: {
      format: 'cjs',
      dir: 'dist',
      minify: isProd,
    },
  },
]);
