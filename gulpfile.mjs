import gulp from 'gulp';
import { rollup } from 'rollup';
import { deleteAsync } from 'del';

const DIST = 'dist';
const webPaths = [
  'd3/dist/d3.min.js',
  'markmap-toolbar/dist/index.js',
  'markmap-toolbar/dist/style.css',
  'markmap-view/dist/browser/index.js',
  'katex/dist/katex.min.css',
  'katex/dist/fonts/**',
  'webfontloader/webfontloader.js',
  'highlight.js/styles/default.css',
];

const rollupConfig = (async () => {
  /** @type any */
  let config = await import('./rollup.config.mjs');
  if (config.default) config = config.default;
  if (typeof config === 'function') config = config();
  if (typeof config?.then === 'function') config = await config;
  if (!Array.isArray(config)) config = [config];
  return config;
})();

export function clean() {
  return deleteAsync([DIST]);
}

async function buildJs() {
  const configArr = await rollupConfig;
  return Promise.all(
    configArr.map(async (config) => {
      const bundle = await rollup(config);
      await bundle.write(config.output);
    })
  );
}

function watch() {
  gulp.watch('src/**', buildJs);
}

export function copy() {
  return gulp
    .src(webPaths.map((path) => `node_modules/${path}`), {
      base: 'node_modules',
    })
    .pipe(gulp.dest(DIST));
}

export const build = gulp.series(clean, copy, buildJs);
export const dev = gulp.series(copy, buildJs, watch);
