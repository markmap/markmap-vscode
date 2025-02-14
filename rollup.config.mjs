import babelPlugin from '@rollup/plugin-babel';
import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import resolvePlugin from '@rollup/plugin-node-resolve';
import replacePlugin from '@rollup/plugin-replace';
import terserPlugin from '@rollup/plugin-terser';
import { createRequire } from 'module';
import { dirname, isAbsolute, relative, resolve } from 'path';
import { readPackageUp } from 'read-package-up';
import { defineConfig } from 'rollup';

async function getVersion(module) {
  const require = createRequire(import.meta.url);
  const cwd = dirname(require.resolve(module));
  const { packageJson } = await readPackageUp({ cwd });
  return packageJson.version;
}

function defineExternal(externals) {
  return (id) =>
    externals.some((pattern) => {
      if (typeof pattern === 'function') return pattern(id);
      if (pattern && typeof pattern.test === 'function')
        return pattern.test(id);
      if (isAbsolute(pattern))
        return !relative(pattern, resolve(id)).startsWith('..');
      return id === pattern || id.startsWith(pattern + '/');
    });
}

function definePlugins(options) {
  const {
    esm = true,
    extensions = ['.ts', '.tsx', '.mjs', '.js', '.jsx'],
    replaceValues,
    browser = false,
    minimize = isProd,
    commonjs,
  } = options;
  return [
    babelPlugin({
      // import helpers from '@babel/runtime'
      babelHelpers: 'runtime',
      plugins: [
        [
          import.meta.resolve('@babel/plugin-transform-runtime'),
          {
            useESModules: esm,
            version: '^7.5.0', // see https://github.com/babel/babel/issues/10261#issuecomment-514687857
          },
        ],
      ],
      exclude: 'node_modules/**',
      extensions,
    }),
    replacePlugin({
      values: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        ...replaceValues,
      },
      preventAssignment: true,
    }),
    resolvePlugin({ browser, extensions }),
    commonjsPlugin(commonjs),
    jsonPlugin(),
    minimize && terserPlugin({ ...minimize }),
  ].filter(Boolean);
}

const { packageJson } = await readPackageUp();
const isProd = process.env.NODE_ENV === 'production';
const replaceValues = {
  'process.env.TOOLBAR_VERSION': JSON.stringify(
    await getVersion('markmap-toolbar')
  ),
};

export default defineConfig([
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
  {
    input: {
      // Must build separately because VSCode web extension only accepts a single file
      extension: 'src/extension.ts',
    },
    plugins: definePlugins({
      replaceValues,
    }),
    external: defineExternal(['path', 'vscode']),
    output: {
      format: 'cjs',
      dir: 'dist',
    },
  },
  {
    input: {
      postbuild: 'src/postbuild.ts',
    },
    plugins: definePlugins({
      replaceValues,
    }),
    external: defineExternal([
      'path',
      ...Object.keys(packageJson.devDependencies),
    ]),
    output: {
      format: 'cjs',
      dir: 'dist',
    },
  },
]);
