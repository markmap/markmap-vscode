import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { URI } from 'vscode-uri';

const extension = readFileSync(new URL('../dist/extension.js', import.meta.url), 'utf8');
const position = (line) => ({ line, character: 0 });
const range = (line) => ({ start: position(line), end: position(line) });
const symbols = [{
  name: '# Other', kind: 14, range: range(0), selectionRange: range(0),
  children: [
    { name: '[duplicate]', kind: 13, range: range(2), selectionRange: range(2) },
    { name: '## 006: Café outage, naïve retries and recovery', kind: 14, range: range(4), selectionRange: range(4) },
    { name: '## Duplicate', kind: 14, range: range(8), selectionRange: range(8) },
    { name: '## Duplicate', kind: 14, range: range(12), selectionRange: range(12) },
  ],
}];

function createHost(items = symbols, { languageId = 'markdown', openError } = {}) {
  const calls = { commands: [], opened: [], warnings: [], errors: [], revealed: [] };
  class Position {
    constructor(line, character) { Object.assign(this, { line, character }); }
  }
  class Selection {
    constructor(start, end) { Object.assign(this, { start, end }); }
  }
  const editor = { revealRange: (selection) => calls.revealed.push(selection) };
  const disposable = { dispose() {} };
  let provider;
  let receive;
  const api = {
    Uri: URI, Position, Selection, SymbolKind: { String: 14 }, TextEditorRevealType: { InCenter: 1 },
    commands: {
      registerCommand: () => disposable,
      async executeCommand(command, ...args) {
        calls.commands.push({ command, args });
        if (command === 'vscode.executeDocumentSymbolProvider') return items;
      },
    },
    workspace: {
      getConfiguration: () => ({ get: () => '' }),
      async openTextDocument(uri) {
        calls.opened.push(uri);
        if (openError) throw openError;
        return { uri, languageId };
      },
      onDidChangeTextDocument: () => disposable,
      onDidChangeConfiguration: () => disposable,
    },
    window: {
      registerCustomEditorProvider(_, value) { provider = value; return disposable; },
      onDidChangeTextEditorSelection: () => disposable,
      async showTextDocument() { return editor; },
      showWarningMessage: (message) => calls.warnings.push(message),
      showErrorMessage: (message) => calls.errors.push(message),
    },
  };
  const exports = {};
  runInNewContext(extension, {
    exports, TextEncoder, TextDecoder, setTimeout, clearTimeout,
    require(name) { assert.equal(name, 'vscode'); return api; },
  });
  exports.activate({ extensionUri: URI.file('/extension'), subscriptions: [] });
  provider.resolveCustomTextEditor({
    uri: URI.file('/workspace/sample.md'),
    getText: () => '# Root',
  }, {
    webview: {
      cspSource: 'self',
      asWebviewUri: (uri) => uri,
      onDidReceiveMessage(handler) { receive = handler; return disposable; },
      postMessage: async () => true,
    },
    onDidDispose() {},
  });
  return {
    calls, editor,
    async click(href) {
      receive({ type: 'openFile', data: href });
      await setImmediate();
    },
  };
}

test('Unicode and encoded fragments select the real Markdown symbol heading', async () => {
  for (const fragment of [
    '006-café-outage-naïve-retries-and-recovery',
    encodeURIComponent('006-café-outage-naïve-retries-and-recovery'),
  ]) {
    const { click, calls, editor } = createHost();
    await click(`./other.md#${fragment}`);
    assert.equal(calls.opened[0].path, '/workspace/other.md');
    assert.equal(editor.selection?.start.line, 4);
    assert.equal(calls.revealed.length, 1);
    assert.deepEqual(calls.warnings, []);
    assert.deepEqual(calls.errors, []);
  }
});

test('duplicate headings use document order and ignore link-definition symbols', async () => {
  const { click, editor } = createHost([{
    ...symbols[0],
    children: [...symbols[0].children].reverse(),
  }]);
  await click('./other.md#duplicate-1');
  assert.equal(editor.selection?.start.line, 12);
});

test('flat SymbolInformation results resolve headings too', async () => {
  const flat = symbols[0].children.map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    location: { uri: URI.file('/workspace/other.md'), range: symbol.selectionRange },
  }));
  const { click, editor } = createHost(flat);
  await click('./other.md#duplicate-1');
  assert.equal(editor.selection?.start.line, 12);
});

test('encoded file paths are decoded separately from the heading fragment', async () => {
  const { click, calls, editor } = createHost();
  await click('./other%20notes.md#duplicate');
  assert.equal(calls.opened[0].path, '/workspace/other notes.md');
  assert.equal(editor.selection?.start.line, 8);
});

test('links without fragments retain the existing file opener', async () => {
  const { click, calls } = createHost();
  await click('./other.md');
  assert.equal(calls.commands[0].command, 'vscode.open');
  assert.equal(calls.commands[0].args[0].path, '/workspace/other.md');
  assert.deepEqual(calls.opened, []);
});

test('missing headings open the source and report the missing anchor', async () => {
  const { click, calls, editor } = createHost();
  await click('./other.md#missing');
  assert.equal(calls.opened[0].path, '/workspace/other.md');
  assert.equal(calls.warnings.length, 1);
  assert.equal(editor.selection, undefined);
});

test('non-Markdown fragments retain the VS Code file opener', async () => {
  const { click, calls } = createHost([], { languageId: 'plaintext' });
  await click('./other.txt#section');
  assert.equal(calls.commands.length, 1);
  assert.equal(calls.commands[0].command, 'vscode.open');
  assert.equal(calls.commands[0].args[0].path, '/workspace/other.txt');
  assert.equal(calls.commands[0].args[0].fragment, 'section');
  assert.deepEqual(calls.errors, []);
});

test('missing symbol providers warn without throwing', async () => {
  const { click, calls, editor } = createHost(null);
  await click('./other.md#duplicate');
  assert.equal(calls.warnings.length, 1);
  assert.equal(editor.selection, undefined);
  assert.deepEqual(calls.errors, []);
});

test('unreadable target documents report an error', async () => {
  const { click, calls } = createHost([], { openError: new Error('File not found') });
  await click('./missing.md#heading');
  assert.equal(calls.errors.length, 1);
  assert.deepEqual(calls.warnings, []);
  assert.deepEqual(calls.commands, []);
});

test('external schemes, absolute paths and encoded traversal stay blocked', async () => {
  for (const href of [
    '../other.md#duplicate', '%2e%2e/other.md#duplicate',
    '/other.md#duplicate', '//host/other.md#duplicate',
    'file:///other.md#duplicate', 'https://example.com/other.md#duplicate',
    './other.md?query#duplicate',
  ]) {
    const { click, calls } = createHost();
    await click(href);
    assert.deepEqual(calls.opened, [], href);
    assert.deepEqual(calls.commands, [], href);
  }
});
