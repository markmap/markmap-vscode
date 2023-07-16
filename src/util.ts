import { buildCSSItem, buildJSItem } from 'markmap-common';
import { Transformer, baseJsPaths, IAssets } from 'markmap-lib';

const TOOLBAR_VERSION = process.env.TOOLBAR_VERSION;
const TOOLBAR_CSS = `markmap-toolbar@${TOOLBAR_VERSION}/dist/style.css`;
const TOOLBAR_JS = `markmap-toolbar@${TOOLBAR_VERSION}/dist/index.js`;
const APP_CSS = 'assets/style.css';
const APP_JS = 'assets/app.js';

function removeVersionString(part: string) {
  return part.replace(/@.+$/, '');
}

export function localProvider(path: string) {
  const parts = path.split('/');
  // xxx@0.0.0-alpha.0+aaaaaa
  // @scope/xxx@0.0.0-alpha.0+aaaaaa
  if (parts[0].startsWith('@')) {
    parts[1] = removeVersionString(parts[1]);
  } else {
    parts[0] = removeVersionString(parts[0]);
  }
  path = parts.join('/');
  return `${process.env.DIST}/${path}`;
}

export function mergeAssets(...args: IAssets[]): IAssets {
  return {
    styles: args.flatMap((arg) => arg.styles || []),
    scripts: args.flatMap((arg) => arg.scripts || []),
  };
}

const local = 'local';

export const transformerLocal = new Transformer();
transformerLocal.urlBuilder.setProvider(local, localProvider);
transformerLocal.urlBuilder.provider = local;

export const transformerExport = new Transformer();
transformerExport.urlBuilder.setProvider(local, localProvider);
let bestProvider = transformerExport.urlBuilder.provider;
transformerExport.urlBuilder.getFastestProvider().then(provider => {
  bestProvider = provider;
});

export function setExportMode(offline: boolean) {
  if (offline) {
    transformerExport.urlBuilder.provider = 'local';
  } else {
    transformerExport.urlBuilder.provider = bestProvider;
  }
}

export function getAssets(transformer: Transformer) {
  const toolbarAssets = {
    styles: [TOOLBAR_CSS]
      .map((path) => transformer.urlBuilder.getFullUrl(path))
      .map((path) => buildCSSItem(path)),
    scripts: [TOOLBAR_JS]
      .map((path) => transformer.urlBuilder.getFullUrl(path))
      .map((path) => buildJSItem(path)),
  };
  const baseAssets = {
    scripts: baseJsPaths
      .map((path) => transformer.urlBuilder.getFullUrl(path))
      .map((path) => buildJSItem(path)),
  };
  let allAssets = transformer.getAssets();
  allAssets = mergeAssets(baseAssets, allAssets, toolbarAssets, {
    styles: [APP_CSS]
      .map((path) => buildCSSItem(path)),
    scripts: [APP_JS]
      .map((path) => buildJSItem(path)),
  });
  return { toolbarAssets, baseAssets, allAssets };
}
