import { defineExternal, definePlugins } from '@gera2ld/plaid-rollup';
import { createRequire } from 'module';
import { dirname } from 'path';
import { readPackageUp } from 'read-package-up';
import { defineConfig } from 'rollup';

async function getVersion(module) {
  const require = createRequire(import.meta.url);
  const cwd = dirname(require.resolve(module));
  const { packageJson } = await readPackageUp({ cwd });
  return packageJson.version;
}

const replaceValues = {
  'process.env.TOOLBAR_VERSION': JSON.stringify(
    await getVersion('markmap-toolbar'),
  ),
};

const external = defineExternal(['path', 'vscode']);

export default defineConfig([
  {
    input: {
      extension: 'src/extension.ts',
      postbuild: 'src/postbuild.ts',
    },
    plugins: definePlugins({
      replaceValues,
    }),
    external,
    output: {
      format: 'cjs',
      dir: 'dist',
    },
  },
  {
    input: {
      app: 'src/app.ts',
    },
    plugins: definePlugins({
      replaceValues,
    }),
    external: ['markmap-toolbar', 'markmap-view'],
    output: {
      format: 'iife',
      dir: 'dist',
      globals: {
        'markmap-common': 'markmap',
        'markmap-toolbar': 'markmap',
        'markmap-view': 'markmap',
      },
    },
  },
]);
