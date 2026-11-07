import { toPNG } from '@markmap/canvas';
import { toPlainText, walkTree, type MarkmapNode } from '@markmap/core';
import { MarkmapViewElement } from '@markmap/element';
import { mathContent, remarkMath } from '@markmap/plugin-math';
import { defaultContentPlugins, toSVGString } from '@markmap/render';
import { defaultToolbarItems } from '@markmap/toolbar';
import { resolveViewOptions } from '@markmap/view';
import { debounce } from 'es-toolkit';
import type { HostMessage, ImageFormat, WebviewMessage } from '../protocol';
import { remarkLocalImages } from './local-images';
import { createFlash, isInView, nodeAtEvent, nodeAtOffset } from './sync';

const vscode = acquireVsCodeApi();
const post = (message: WebviewMessage) => vscode.postMessage(message);

const flash = createFlash();
const status = document.createElement('div');
status.className = 'status';
const customStyle = document.createElement('style');
document.head.append(customStyle);

let baseUri = '';
let defaultOptions: unknown;
let defaultWarnings: readonly string[] = [];
let appliedOptions: string | undefined;
let placed = false;
/** The node under the editor's cursor. */
let active: MarkmapNode | undefined;

const view = new MarkmapViewElement();
view.toolbar = true;
view.toolbarItems = [
  ...defaultToolbarItems,
  { label: 'Edit', onClick: () => post({ type: 'editAsText' }) },
  {
    label: 'Export',
    onClick: (mm) => {
      const title = mm.tree && toPlainText(mm.tree.content);
      post({ type: 'export', data: { title: title || 'Markmap' } });
    },
  },
];
view.parseOptions = { plugins: [remarkMath, remarkLocalImages(() => baseUri)] };
view.addEventListener('render', showWarnings);
view.addEventListener('dblclick', (event) => {
  const position = view.mm && nodeAtEvent(view.mm, event)?.position;
  if (position) post({ type: 'setFocus', data: position.start });
});
document.body.append(view, status);
applyOptions();

new MutationObserver(applyOptions).observe(document.body, {
  attributes: true,
  attributeFilter: ['class'],
});

let observedSize = false;
const refit = debounce(() => view.mm?.fit(), 200);
new ResizeObserver(() => {
  // The first call only reports the starting size.
  if (observedSize) refit();
  observedSize = true;
}).observe(view);

document.addEventListener('click', handleLinkClick);

const handlers: {
  [T in HostMessage['type']]: (
    data: Extract<HostMessage, { type: T }>['data'],
  ) => void;
} = {
  setContent(data) {
    baseUri = data.baseUri;
    defaultOptions = data.defaultOptions;
    applyOptions();
    view.markdown = data.markdown;
    if (!placed) {
      placed = true;
      // Images and math change the drawing's size once they are ready.
      view.mm?.result?.pending?.then(() => view.mm?.fit());
    }
  },
  setCursor(offset) {
    const mm = view.mm;
    const node = mm?.tree && nodeAtOffset(mm.tree, offset);
    if (!node || node.id === active?.id) return;
    active = node;
    reveal(node);
  },
  setCSS(css) {
    customStyle.textContent = css;
  },
  toggleNode(recursive) {
    const mm = view.mm;
    if (!mm || !active) return;
    if (!recursive) mm.toggle(active.id);
    else if (mm.foldedIds.has(active.id)) mm.expandAll(active.id);
    else mm.foldAll(active.id);
  },
  exportImage,
};

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const { type, data } = event.data;
  (handlers[type] as (value: typeof data) => void)?.(data);
});

post({ type: 'ready' });

function isDark() {
  // https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content
  const { classList } = document.body;
  return (
    classList.contains('vscode-dark') ||
    (classList.contains('vscode-high-contrast') &&
      !classList.contains('vscode-high-contrast-light'))
  );
}

/** Light or dark follows VS Code unless the document or the settings say otherwise. */
function applyOptions() {
  const colorScheme = isDark() ? 'dark' : 'light';
  const key = JSON.stringify([colorScheme, defaultOptions]);
  if (key === appliedOptions) return;
  appliedOptions = key;
  const { options, warnings } = resolveViewOptions(
    { plugins: [...defaultContentPlugins, mathContent], colorScheme },
    defaultOptions,
  );
  defaultWarnings = warnings;
  view.options = options;
}

function showWarnings() {
  const warnings = [...defaultWarnings, ...view.warnings];
  status.textContent = warnings.join(' · ');
  status.hidden = !warnings.length;
}

function reveal(node: MarkmapNode) {
  const mm = view.mm;
  if (!mm) return;
  if (!isInView(mm, node.id)) mm.focusNode(node.id);
  flash(mm, node.id);
}

function findHeading(id: string) {
  let target: MarkmapNode | undefined;
  if (view.mm?.tree) {
    walkTree(view.mm.tree, (node) => {
      const text = toPlainText(node.content).trim();
      if (
        node.type === 'heading' &&
        text.replace(/\W/g, '-').toLowerCase() === id
      ) {
        target ??= node;
      }
    });
  }
  return target;
}

/** Links in labels and notes: go to headings and open local files in VS Code. */
function handleLinkClick(event: MouseEvent) {
  const link = event
    .composedPath()
    .find((target) => target instanceof Element && target.localName === 'a') as
    | Element
    | undefined;
  const href = link?.getAttribute('href');
  if (!href) return;
  if (href.startsWith('#')) {
    event.preventDefault();
    const node = findHeading(href.slice(1));
    if (node) reveal(node);
  } else if (!/^[a-z][a-z\d+.-]*:/i.test(href)) {
    event.preventDefault();
    post({ type: 'openFile', data: href });
  }
}

async function exportImage(format: ImageFormat) {
  const mm = view.mm;
  try {
    if (!mm?.result) throw new Error('The map is not ready');
    const scheme = mm.options.colorScheme ?? 'light';
    let content: string | Uint8Array;
    if (format === 'svg') {
      content = toSVGString(mm.result, { colorScheme: scheme });
    } else {
      const dark = matchMedia('(prefers-color-scheme: dark)').matches;
      const blob = await toPNG(mm.result, {
        colorScheme: scheme === 'auto' ? (dark ? 'dark' : 'light') : scheme,
      });
      content = new Uint8Array(await blob.arrayBuffer());
    }
    post({ type: 'exportResult', data: { content } });
  } catch (err) {
    post({
      type: 'exportResult',
      data: {
        error: err instanceof Error ? err.message : 'Could not export the map',
      },
    });
  }
}
