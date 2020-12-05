const gulp = require('gulp');
const concat = require('gulp-concat');
const rollup = require('rollup');
const del = require('del');
const components = require('prismjs/components');

const DIST = 'dist';

function clean() {
  return del([DIST]);
}

const languages = Object.keys(components.languages).filter(key => key !== 'meta');
const keys = [];
languages.forEach(addLanguage);

function addLanguage(key) {
  if (keys.includes(key)) return;
  let req = components.languages[key].require;
  if (typeof req === 'string') req = [req];
  if (req) req.forEach(addLanguage);
  keys.push(key);
}

function buildPrism() {
  return gulp.src([
    'node_modules/prismjs/components/prism-core.min.js',
    ...keys.map(key => `node_modules/prismjs/components/prism-${key}.min.js`),
  ])
    .pipe(concat('prism.js', { newLine: ';' }))
    .pipe(gulp.dest(DIST));
}

function buildJs() {
  const rollupConfig = require('./rollup.conf');
  return Promise.all(rollupConfig.map(async (config) => {
    const bundle = await rollup.rollup(config);
    await bundle.write(config.output);
  }));
}

function watch() {
  gulp.watch('src/**', buildJs);
}

exports.clean = clean;
exports.build = gulp.series(buildPrism, buildJs);
exports.dev = gulp.series(buildPrism, buildJs, watch);
