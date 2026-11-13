// E2E in desktop VS Code, driven over the Chrome DevTools Protocol by Playwright.
// Needs a built extension (`pnpm build:js`) and VS Code installed.
// Set VSCODE_PATH if VS Code is not at the default macOS location.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import {
  checkLocalLinks, chooseExport, createReporter, extensionPath, findNodeId, openSampleAsMarkmap, prepareWorkspace, sleep,
} from './lib.mjs';

const vscodePath = process.env.VSCODE_PATH || '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const port = process.env.E2E_CDP_PORT || '9333';
if (!existsSync(vscodePath)) {
  console.error(`VS Code not found at ${vscodePath}; set VSCODE_PATH`);
  process.exit(2);
}

const { root, workspace } = prepareWorkspace();
const dataDir = join(root, 'data');
mkdirSync(join(dataDir, 'User'), { recursive: true });
// simpleDialog makes the save dialog a quick-input box that Playwright can drive.
writeFileSync(
  join(dataDir, 'User', 'settings.json'),
  JSON.stringify({
    'files.simpleDialog.enable': true,
    'workbench.startupEditor': 'none',
    'update.mode': 'none',
    'telemetry.telemetryLevel': 'off',
    // Keep unrelated built-in chat/agent services out of this extension test host.
    'chat.disableAIFeatures': true,
  }),
);

const t = createReporter();
const proc = spawn(
  vscodePath,
  [`--remote-debugging-port=${port}`, `--user-data-dir=${dataDir}`, `--extensions-dir=${join(root, 'ext')}`, `--extensionDevelopmentPath=${extensionPath}`, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates', workspace],
  { stdio: 'ignore' },
);

let browser;
let page;
try {
  for (let i = 0; i < 60 && !browser; i++) {
    await sleep(500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined);
  }
  if (!browser) throw new Error('could not connect to VS Code');
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(500);
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('workbench'));
  }
  if (!page) throw new Error('workbench window not found');
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 240)));

  const frame = await openSampleAsMarkmap(page);
  t.ok('webview loads', !!frame);
  if (!frame) throw new Error('no webview');
  const v = (fn, arg) => frame.evaluate(fn, arg);

  const info = await v(() => {
    const sr = document.querySelector('markmap-view').shadowRoot;
    return { imgs: [...sr.querySelectorAll('image')].map((x) => x.getAttribute('href')), math: /<path/.test(sr.innerHTML) };
  });
  t.ok('local image rewritten to a webview URI', info.imgs.length === 1 && /vscode-resource/.test(info.imgs[0]), info.imgs[0]);
  t.ok('math is rendered', info.math);

  const firstId = await findNodeId(frame, 'dot.png');
  await v((id) => document.querySelector('markmap-view').mm.openNotes(id), firstId);
  await sleep(700);
  t.ok('code block in a note is highlighted (lazy chunk loads)', await v(() => !!document.querySelector('.markmap-popover .hljs-keyword')));
  await v(() => document.querySelector('markmap-view').mm.closeNotes());

  await checkLocalLinks(page, frame, t);

  const signatures = { svg: (b) => /<svg/.test(b.subarray(0, 400).toString()), png: (b) => b.subarray(1, 4).toString() === 'PNG', html: (b) => /<html|<!doctype/i.test(b.subarray(0, 400).toString()) };
  for (const format of ['svg', 'png', 'html']) {
    const rows = await chooseExport(page, frame, format);
    if (format === 'svg') t.ok('export picker lists SVG, PNG and HTML', ['SVG', 'PNG', 'HTML'].every((f) => rows.some((x) => x.startsWith(f))), JSON.stringify(rows));
    const input = page.locator('.quick-input-box input').first();
    const target = join(workspace, `exported.${format}`);
    await input.fill(target);
    await sleep(400);
    await page.keyboard.press('Enter');
    await sleep(800);
    await page.keyboard.press('Enter').catch(() => {}); // confirm if prompted
    await sleep(2000);
    const written = existsSync(target) && signatures[format](readFileSync(target));
    t.ok(`export ${format} writes a valid file`, written, existsSync(target) ? readFileSync(target).length + ' bytes' : 'missing');
  }

  const bad = [...new Set(errors)].filter((e) => !/favicon|404/.test(e));
  t.ok('no console errors', bad.length === 0, bad.join(' | '));
} catch (e) {
  t.ok('test run completed', false, e.message);
  const screenshot = join(root, 'failure.png');
  await page?.screenshot({ path: screenshot }).catch(() => {});
  t.info('Failure screenshot:', screenshot);
} finally {
  await browser?.close().catch(() => {});
  proc.kill();
}
process.exit(t.finish());
