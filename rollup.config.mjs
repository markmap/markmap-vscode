import { defineExternal, definePlugins } from '@gera2ld/plaid-rollup';
import { createRequire } from 'module';
import { dirname } from 'path';
import { readPackageUp } from 'read-pkg-up';

async function getVersion(module) {
  const require = createRequire(import.meta.url);
  const cwd = dirname(require.resolve(module));
  const { packageJson } = await readPackageUp({ cwd });
  return packageJson.version;
}

export default async () => {
  const replaceValues = {
    'process.env.TOOLBAR_VERSION': JSON.stringify(
      await getVersion('markmap-toolbar'),
    ),
  };

  const external = defineExternal(['path', 'vscode']);
  const rollupConfig = {
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
  };

  return rollupConfig;
};
