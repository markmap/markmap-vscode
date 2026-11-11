import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const e2eDir = dirname(fileURLToPath(import.meta.url));
export const extensionPath = dirname(e2eDir);

/** Copy the fixture to a temp dir so exports never dirty the repo. */
export function prepareWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'markmap-e2e-'));
  const workspace = join(root, 'workspace');
  cpSync(join(e2eDir, 'fixture'), workspace, { recursive: true });
  return { root, workspace };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Collects PASS/FAIL results; `finish()` sets the exit code. */
export function createReporter() {
  const failures = [];
  return {
    ok(name, value, detail = '') {
      console.log(value ? 'PASS' : 'FAIL', name, detail);
      if (!value) failures.push(name);
    },
    info: (...args) => console.log('INFO', ...args),
    finish() {
      console.log(failures.length ? `\n${failures.length} failed: ${failures.join(', ')}` : '\nAll passed');
      return failures.length ? 1 : 0;
    },
  };
}

/** Run a command from the command palette (F1). */
export async function runCommand(page, text) {
  await page.keyboard.press('F1');
  await sleep(500);
  await page.keyboard.type(text);
  await sleep(800);
  await page.keyboard.press('Enter');
  await sleep(1000);
}

/** Find the webview frame that hosts the map. */
export async function findMapFrame(page, tries = 60) {
  for (let i = 0; i < tries; i++) {
    for (const frame of page.frames()) {
      try {
        if (await frame.evaluate(() => !!document.querySelector('markmap-view'))) return frame;
      } catch {}
    }
    await sleep(250);
  }
  return null;
}

/** Open sample.md from the explorer and run "Open as markmap". */
export async function openSampleAsMarkmap(page) {
  await page.waitForSelector('.explorer-folders-view .monaco-list-row', { timeout: 30000 });
  await page.getByText('sample.md', { exact: true }).first().click();
  await sleep(1500);
  await page.locator('.monaco-editor').first().click();
  await runCommand(page, 'Open as markmap');
  const frame = await findMapFrame(page);
  if (frame) await sleep(2500);
  return frame;
}

/** Id of the node whose text contents include `text`. IDs are hashes, so look them up. */
export function findNodeId(frame, text) {
  return frame.evaluate((text) => {
    let found;
    const walk = (n) => {
      if (!found && n.content.some((c) => (c.value || c.url || '').includes(text))) found = n.id;
      n.children.forEach(walk);
    };
    walk(document.querySelector('markmap-view').mm.tree);
    return found;
  }, text);
}

/** Click the toolbar Export button and choose a format in the picker. Returns the picker rows. */
export async function chooseExport(page, frame, format) {
  await frame.evaluate(() =>
    [...document.querySelector('markmap-view').shadowRoot.querySelectorAll('.markmap-toolbar button')]
      .find((b) => b.title === 'Export')
      .click(),
  );
  await sleep(1000);
  const rows = await page.locator('.quick-input-list .monaco-list-row').allInnerTexts();
  await page.keyboard.type(format);
  await sleep(400);
  await page.keyboard.press('Enter');
  await sleep(1200);
  return rows;
}
