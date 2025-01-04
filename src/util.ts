import { buildCSSItem, buildJSItem } from 'markmap-common';
import { IAssets, Transformer } from 'markmap-lib';

const TOOLBAR_VERSION = process.env.TOOLBAR_VERSION;
const TOOLBAR_CSS = `markmap-toolbar@${TOOLBAR_VERSION}/dist/style.css`;
const TOOLBAR_JS = `markmap-toolbar@${TOOLBAR_VERSION}/dist/index.js`;
const APP_CSS = 'assets/style.css';
const APP_JS = 'dist/app.js';

export const ASSETS_PREFIX = 'dist/web_assets/';

export const toolbarAssets: IAssets = {
  styles: [buildCSSItem(TOOLBAR_CSS)],
  scripts: [buildJSItem(TOOLBAR_JS)],
};

export const appAssets: IAssets = {
  styles: [buildCSSItem(APP_CSS)],
  scripts: [buildJSItem(APP_JS)],
};

export function localProvider(path: string) {
  return `${ASSETS_PREFIX}${path}`;
}

const local = 'local';

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
