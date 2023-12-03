import { dirname } from 'path';
import { createRequire } from 'module';
import { readPackageUp } from 'read-pkg-up';
import plaid from '@gera2ld/plaid';

const { getRollupExternal, getRollupPlugins } = plaid;

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

  const external = getRollupExternal(['path', 'vscode']);
  const rollupConfig = {
    input: {
      extension: 'src/extension.ts',
      postbuild: 'src/postbuild.ts',
    },
    plugins: getRollupPlugins({
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
