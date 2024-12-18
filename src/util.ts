import { buildCSSItem, buildJSItem } from 'markmap-common';
import { builtInPlugins, IAssets, ITransformPlugin, Transformer } from 'markmap-lib';
import { baseJsPaths } from 'markmap-render';

const TOOLBAR_VERSION = process.env.TOOLBAR_VERSION;
const TOOLBAR_CSS = `markmap-toolbar@${TOOLBAR_VERSION}/dist/style.css`;
const TOOLBAR_JS = `markmap-toolbar@${TOOLBAR_VERSION}/dist/index.js`;
const APP_CSS = 'assets/style.css';
const APP_JS = 'dist/app.js';

export const ASSETS_PREFIX = 'dist/web_assets/';

export function localProvider(path: string) {
  return `${ASSETS_PREFIX}${path}`;
}

export function mergeAssets(...args: IAssets[]): IAssets {
  return {
    styles: args.flatMap((arg) => arg.styles || []),
    scripts: args.flatMap((arg) => arg.scripts || []),
  };
}

const local = 'local';

export function getLocalTransformer(plugins: ITransformPlugin[] = []) {
  const transformerLocal = new Transformer([...builtInPlugins, ...plugins]);
  transformerLocal.urlBuilder.setProvider(local, localProvider);
  transformerLocal.urlBuilder.provider = local;
  return transformerLocal;
}

export const transformerExport = new Transformer();
let bestProvider = transformerExport.urlBuilder.provider;
transformerExport.urlBuilder.getFastestProvider().then((provider) => {
  bestProvider = provider;
});

export function setExportMode(offline: boolean) {
  if (offline) {
    transformerExport.urlBuilder.setProvider(local, localProvider);
    transformerExport.urlBuilder.provider = local;
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
    styles: [APP_CSS].map((path) => buildCSSItem(path)),
    scripts: [APP_JS].map((path) => buildJSItem(path)),
  });
  return { toolbarAssets, baseAssets, allAssets };
}
