import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { extractAssets } from 'markmap-common';
import { Transformer } from 'markmap-lib';
import { baseJsPaths } from 'markmap-render';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ASSETS_PREFIX, localProvider, toolbarAssets } from './util';

const providerName = 'local-hook';

async function fetchAssets(assetsDir: string) {
  const transformer = new Transformer();
  transformer.urlBuilder.providers[providerName] = localProvider;
  transformer.urlBuilder.provider = providerName;
  const assets = transformer.getAssets();
  delete transformer.urlBuilder.providers[providerName];
  const pluginPaths = extractAssets(assets)
    .filter((url) => url.startsWith(ASSETS_PREFIX))
    .map((url) => url.slice(ASSETS_PREFIX.length));
  const resources = transformer.plugins.flatMap(
    (plugin) => plugin.config?.resources || [],
  );
  const paths = [
    ...baseJsPaths,
    ...pluginPaths,
    ...resources,
    ...extractAssets(toolbarAssets),
  ];
  const fastest = await transformer.urlBuilder.getFastestProvider();
  await Promise.all(
    paths.map((path) =>
      downloadAsset(
        resolve(assetsDir, path),
        transformer.urlBuilder.getFullUrl(path, fastest),
      ),
    ),
  );
}

async function downloadAsset(fullPath: string, url: string) {
  console.log(`${url} -> ${fullPath}`);
  try {
    const result = await stat(fullPath);
    // Skip existing files
    if (result.isFile()) return;
  } catch {
    // ignore
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download: ${url}`);
  await mkdir(dirname(fullPath), { recursive: true });
  await pipeline(res.body, createWriteStream(fullPath));
}

fetchAssets(ASSETS_PREFIX).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
