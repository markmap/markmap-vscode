import { dirname } from 'path';
import { createRequire } from 'module';
import { readPackageUp } from 'read-pkg-up';
import plaid from '@gera2ld/plaid';
import pkg from './package.json' assert { type: 'json' };

const { defaultOptions, getRollupExternal, getRollupPlugins, loadConfigSync } =
  plaid;

async function getVersion(module) {
  const require = createRequire(import.meta.url);
  const cwd = dirname(require.resolve(module));
  const { packageJson } = await readPackageUp({ cwd });
  return packageJson.version;
}

export default async () => {
  const DIST = defaultOptions.distDir;
  const FILENAME = 'extension';
  const BANNER = `/*! ${pkg.name} v${pkg.version} | ${pkg.license} License */`;
  const replaceValues = {
    'process.env.DIST': JSON.stringify('dist'),
    'process.env.TOOLBAR_VERSION': JSON.stringify(
      await getVersion('markmap-toolbar')
    ),
  };

  const external = getRollupExternal(['path', 'vscode']);
  const postcssConfig =
    loadConfigSync('postcss') ||
    (await import('@gera2ld/plaid/config/postcssrc.js'));
  const postcssOptions = {
    ...postcssConfig,
    inject: false,
  };
  const rollupConfig = [
    {
      input: 'src/extension.ts',
      plugins: getRollupPlugins({
        extensions: defaultOptions.extensions,
        postcss: postcssOptions,
        replaceValues,
      }),
      external,
      output: {
        format: 'cjs',
        file: `${DIST}/${FILENAME}.js`,
      },
    },
  ];

  rollupConfig.forEach((item) => {
    item.output = {
      indent: false,
      // If set to false, circular dependencies and live bindings for external imports won't work
      externalLiveBindings: false,
      ...item.output,
      ...(BANNER && {
        banner: BANNER,
      }),
    };
  });

  return rollupConfig;
};
