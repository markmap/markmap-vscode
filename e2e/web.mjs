// E2E in VS Code for the Web (@vscode/test-web) driven by Playwright + Chrome.
// Needs a built extension: `pnpm build:js`.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import {
  chooseExport, createReporter, extensionPath, findNodeId, openSampleAsMarkmap, prepareWorkspace, runCommand, sleep,
} from './lib.mjs';

const port = process.env.E2E_PORT || '3123';
const { workspace } = prepareWorkspace();
const t = createReporter();

const server = spawn(
  'pnpm',
  ['exec', 'vscode-test-web', '--browserType=none', `--port=${port}`, '--quality=stable', `--extensionDevelopmentPath=${extensionPath}`, workspace],
  { cwd: extensionPath, stdio: ['ignore', 'pipe', 'inherit'] },
);
await new Promise((resolve, reject) => {
  server.once('exit', () => reject(new Error('vscode-test-web exited early')));
  server.stdout.on('data', (d) => /Listening on/.test(String(d)) && resolve());
  setTimeout(() => reject(new Error('vscode-test-web did not start in 5 min (first run downloads VS Code)')), 300000);
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 240)));
page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message.slice(0, 240)));

try {
  await page.goto(`http://localhost:${port}/`);
  const frame = await openSampleAsMarkmap(page);
  t.ok('webview loads', !!frame);
  if (!frame) throw new Error('no webview');
  const v = (fn, arg) => frame.evaluate(fn, arg);

  const info = await v(() => {
    const el = document.querySelector('markmap-view');
    const sr = el.shadowRoot;
    return {
      status: document.querySelector('.status').textContent,
      toolbar: [...sr.querySelectorAll('.markmap-toolbar button')].map((b) => b.title),
      imgs: [...sr.querySelectorAll('image')].map((i) => i.getAttribute('href')),
      theme: el.mm.theme.name,
    };
  });
  t.ok('legacy option warning shown', info.status.includes('maxWidth'), info.status);
  t.ok('local image rewritten to a webview URI', info.imgs.length === 1 && /vscode-resource/.test(info.imgs[0]), info.imgs[0]);
  t.ok('frontmatter theme applied', info.theme === 'cards', info.theme);
  t.ok('toolbar has Export and Edit', info.toolbar.includes('Export') && info.toolbar.includes('Edit'));
  const imgWidth = await v((u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = u; }), info.imgs[0]);
  t.ok('image loads', imgWidth > 0, imgWidth);

  const editor = page.locator('.monaco-editor').first();
  const goLine = async (n) => {
    await editor.click();
    await page.keyboard.press('Control+g');
    await sleep(300);
    await page.keyboard.type(String(n));
    await page.keyboard.press('Enter');
  };
  const flash = () => v(() => new Promise((res) => {
    const timer = setInterval(() => { if (document.querySelector('.node-flash')) { clearInterval(timer); res(true); } }, 20);
    setTimeout(() => { clearInterval(timer); res(false); }, 1500);
  }));
  const folded = () => v(() => document.querySelector('markmap-view').mm.foldedIds.size);

  // cursor -> map
  let p = flash();
  await goLine(23);
  t.ok('cursor flashes the node', await p);

  // toggle commands
  await goLine(13);
  await sleep(500);
  await runCommand(page, 'Toggle the active node');
  await sleep(800);
  t.ok('toggle folds the active node', (await folded()) === 1, await folded());
  await v(() => document.querySelector('markmap-view').mm.expandAll());
  await sleep(800);

  // cursor into a folded branch unfolds it
  const firstId = await findNodeId(frame, 'First');
  await v((id) => document.querySelector('markmap-view').mm.setFolded(id, true), firstId);
  await sleep(700);
  await goLine(14);
  await sleep(900);
  t.ok('cursor inside a folded branch unfolds it', !(await v((id) => document.querySelector('markmap-view').mm.foldedIds.has(id), firstId)));
  await v(() => document.querySelector('markmap-view').mm.fit());
  await sleep(800);

  // map -> cursor
  const frameBox = await frame.frameElement().then((e) => e.boundingBox());
  const secondId = await findNodeId(frame, 'Second');
  const r = await v((id) => document.querySelector('markmap-view').mm.screenRect(id), secondId);
  await page.mouse.dblclick(r.x + frameBox.x + r.width / 2, r.y + frameBox.y + r.height / 2);
  await sleep(800);
  const pos = await page.locator('[aria-label*="Ln "]').first().textContent().catch(() => '?');
  t.ok('double-click jumps to the source line', /Ln 21/.test(pos), pos);

  // label link opens the relative file
  const link = await v(() => {
    const a = document.querySelector('markmap-view').shadowRoot.querySelector('svg a rect');
    const b = a.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.click(link.x + frameBox.x, link.y + frameBox.y);
  await sleep(1200);
  const tabs = (await page.locator('.tabs-container .tab').allTextContents()).join(',');
  t.ok('relative link opens the file', tabs.includes('other.md'), tabs);

  // live update while typing (the link above left other.md active, so reopen sample.md from the explorer)
  await page.locator('.explorer-folders-view').getByText('sample.md', { exact: true }).first().click();
  await sleep(800);
  await goLine(24);
  await page.keyboard.type('- typed live');
  await sleep(1200);
  t.ok('typing updates the map', !!(await findNodeId(frame, 'typed live')));

  // theme
  await runCommand(page, 'Preferences: Color Theme');
  await page.keyboard.type('Dark Modern');
  await sleep(500);
  await page.keyboard.press('Enter');
  await sleep(1500);
  t.ok('map follows the dark theme', (await v(() => document.querySelector('markmap-view').mm.options.colorScheme)) === 'dark');

  // note popover anchor
  await v(() => document.querySelector('markmap-view').mm.openNotes('root'));
  await sleep(600);
  p = flash();
  await v(() => [...document.querySelectorAll('.markmap-popover a')].find((a) => a.getAttribute('href') === '#second').click());
  t.ok('anchor link in a note flashes the heading', await p);

  // export: picker + save dialog (the web filesystem is in-memory, so files are not checked)
  for (const format of ['svg', 'png', 'html']) {
    const rows = await chooseExport(page, frame, format);
    if (format === 'svg') t.ok('export picker lists SVG, PNG and HTML', ['SVG', 'PNG', 'HTML'].every((f) => rows.some((x) => x.startsWith(f))), JSON.stringify(rows));
    const input = page.locator('.quick-input-box input').first();
    const shown = await input.isVisible().catch(() => false);
    const name = shown ? await input.inputValue() : '';
    t.ok(`export ${format} opens a save dialog`, shown && name.endsWith(`.${format}`), name);
    await page.keyboard.press('Escape');
    await sleep(500);
  }

  const bad = [...new Set(errors)].filter((e) => !/favicon|404/.test(e));
  t.ok('no console errors', bad.length === 0, bad.join(' | '));
} catch (e) {
  t.ok('test run completed', false, e.message);
  await page.screenshot({ path: 'e2e-web-failure.png' }).catch(() => {});
} finally {
  await browser.close();
  server.kill();
}
process.exit(t.finish());
