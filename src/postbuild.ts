import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { dirname, resolve } from 'path';
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';
import { finished } from 'stream/promises';
import { Transformer } from 'markmap-lib';
import { ASSETS_PREFIX, getAssets, localProvider } from './util';

const providerName = 'local-hook';

async function fetchAssets() {
  const transformer = new Transformer();
  const { provider } = transformer.urlBuilder;
  transformer.urlBuilder.setProvider(providerName, localProvider);
  transformer.urlBuilder.provider = providerName;
  const { allAssets: assets } = getAssets(transformer);
  delete transformer.urlBuilder.providers[providerName];
  transformer.urlBuilder.provider = provider;
  const paths = [
    ...(assets.scripts?.map(
      (item) => (item.type === 'script' && item.data.src) || '',
    ) || []),
    ...(assets.styles?.map(
      (item) => (item.type === 'stylesheet' && item.data.href) || '',
    ) || []),
  ]
    .filter((url) => url.startsWith(ASSETS_PREFIX))
    .map((url) => url.slice(ASSETS_PREFIX.length));
  const fastest = await transformer.urlBuilder.getFastestProvider();
  await Promise.all(
    paths.map((path) =>
      downloadAsset(
        resolve(ASSETS_PREFIX, path),
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
  await finished(
    Readable.fromWeb(res.body as ReadableStream).pipe(
      createWriteStream(fullPath),
    ),
  );
}

fetchAssets().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
