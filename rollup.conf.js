const path = require('path');
const {
  defaultOptions,
  getRollupExternal,
  getRollupPlugins,
  loadConfigSync,
  rollupMinify,
} = require('@gera2ld/plaid');
const pkg = require('./package.json');

const DIST = defaultOptions.distDir;
const PRISM = path.resolve('src/prism');
const FILENAME = 'extension';
const BANNER = `/*! ${pkg.name} v${pkg.version} | ${pkg.license} License */`;
const replaceValues = {
  'process.env.TOOLBAR_VERSION': JSON.stringify(require('markmap-toolbar/package.json').version),
};

const external = getRollupExternal([
  'path',
  'vscode',
  PRISM,
]);
const bundleOptions = {
  extend: true,
  esModule: false,
};
const postcssConfig = loadConfigSync('postcss') || require('@gera2ld/plaid/config/postcssrc');
const postcssOptions = {
  ...postcssConfig,
  inject: false,
};
const rollupConfig = [
  {
    input: {
      input: 'src/extension.ts',
      plugins: getRollupPlugins({
        extensions: defaultOptions.extensions,
        postcss: postcssOptions,
        replaceValues,
        aliases: {
          entries: [
            { find: 'prismjs/components/', replacement: path.resolve('src/blackhole') },
            { find: 'prismjs', replacement: PRISM },
          ],
        },
      }),
      external,
    },
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
    ...BANNER && {
      banner: BANNER,
    },
  };
});

module.exports = rollupConfig.map(({ input, output }) => ({
  ...input,
  output,
}));
