import {
  IDeferred,
  defer,
  walkTree,
  wrapFunction,
  type INode,
} from 'markmap-common';
import { Toolbar } from 'markmap-toolbar';
import {
  defaultOptions,
  deriveOptions,
  type IMarkmapJSONOptions,
  type Markmap,
} from 'markmap-view';

declare let mm: Markmap;

const vscode = acquireVsCodeApi();
let firstTime = true;
let root: INode | undefined;
let style: HTMLStyleElement;
let active:
  | {
      node: INode;
    }
  | undefined;
const activeNodeOptions: {
  placement?: 'center' | 'visible';
} = {};
let loading: IDeferred<void> | undefined;

const handlers = {
  async setData(data: {
    root?: INode;
    jsonOptions?: IMarkmapJSONOptions & {
      activeNode?: {
        placement?: 'center' | 'visible';
      };
    };
  }) {
    loading = defer();
    await mm.setData((root = data.root), {
      ...defaultOptions,
      ...deriveOptions(data.jsonOptions),
    });
    activeNodeOptions.placement = data.jsonOptions?.activeNode?.placement;
    if (firstTime) {
      await mm.fit();
      firstTime = false;
    }
    loading.resolve();
  },
  async setCursor(options: { line: number; autoExpand?: boolean }) {
    await loading?.promise;
    const result = root && findActiveNode(options);
    if (!result) return;
    const { node, needRerender } = result;
    if (needRerender) await mm.renderData();
    highlightNode(node);
  },
  setCSS(data: string) {
    if (!style) {
      style = document.createElement('style');
      document.head.append(style);
    }
    style.textContent = data || '';
  },
  checkTheme,
  downloadSvg(path: string) {
    const content = new XMLSerializer().serializeToString(mm.svg.node());
    vscode.postMessage({ type: 'downloadSvg', data: { content, path } });
  },
  toggleNode(recursive: boolean) {
    if (!active) return;
    mm.toggleNode(active.node, recursive);
  },
};
window.addEventListener('message', (e) => {
  const { type, data } = e.data;
  const handler = handlers[type];
  handler?.(data);
});
document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement)?.closest('a');
  if (el) {
    const href = el.getAttribute('href');
    if (href.startsWith('#')) {
      const node = findHeading(href.slice(1));
      highlightNode(node);
    } else if (!href.includes('://')) {
      vscode.postMessage({
        type: 'openFile',
        data: href,
      });
    }
  }
});
vscode.postMessage({ type: 'refresh' });

const toolbar = new Toolbar();
toolbar.register({
  id: 'editAsText',
  title: 'Edit as text',
  content: createButton('Edit'),
  onClick: clickHandler('editAsText'),
});
toolbar.register({
  id: 'export',
  title: 'Export',
  content: createButton('Export'),
  onClick: clickHandler('export'),
});
toolbar.setItems([
  'zoomIn',
  'zoomOut',
  'fit',
  'recurse',
  'editAsText',
  'export',
]);

checkTheme();

setTimeout(() => {
  initialize(mm);
  toolbar.attach(mm);
  document.body.append(toolbar.el);
});

function initialize(mm: Markmap) {
  mm.renderData = wrapFunction(mm.renderData, async (fn, ...args) => {
    await fn.call(mm, ...args);
    mm.g
      .selectAll<SVGGElement, INode>(function () {
        const nodes = Array.from(this.childNodes) as Element[];
        return nodes.filter((el) => el.tagName === 'g') as SVGGElement[];
      })
      .on(
        'dblclick.focus',
        (e, d) => {
          const lines = d.payload?.lines as string | undefined;
          const line = +lines?.split(',')[0];
          if (!isNaN(line))
            vscode.postMessage({ type: 'setFocus', data: line });
        },
        true,
      )
      .on('click.toggleNode', (e, d) => {
        // markmap-view only handles clicks on the circle of a node;
        // make the whole node (text included) clickable
        if (!d?.children?.length) return;
        // the circle is handled by markmap-view itself, and links by the
        // document-level click handler
        if ((e.target as Element).closest('circle, a')) return;
        // ctrl/cmd inverts the recursive mode, same as clicking the circle
        const recursive =
          mm.options.toggleRecursively !== !!(e.metaKey || e.ctrlKey);
        mm.toggleNode(d, recursive);
      });
  });
}

function checkTheme() {
  // https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content
  const isDark = ['vscode-dark', 'vscode-high-contrast'].some((cls) =>
    document.body.classList.contains(cls),
  );
  document.documentElement.classList[isDark ? 'add' : 'remove']('markmap-dark');
}

function createButton(text: string) {
  const el = document.createElement('div');
  el.className = 'btn-text';
  el.textContent = text;
  return el;
}

function clickHandler(type: string) {
  return () => {
    vscode.postMessage({ type });
  };
}

function findHeading(id: string) {
  function dfs(node: INode) {
    if (!/^h\d$/.test(node.payload.tag as string)) return false;
    const normalizedId = node.content.trim().replace(/\W/g, '-').toLowerCase();
    if (normalizedId === id) {
      target = node;
      return true;
    }
    return node.children?.some(dfs);
  }
  let target: INode | undefined;
  dfs(root);
  return target;
}

function findActiveNode({
  line,
  autoExpand = true,
}: {
  line: number;
  autoExpand?: boolean;
}) {
  function dfs(node: INode, ancestors: INode[] = []) {
    const [start, end] =
      (node.payload?.lines as string)?.split(',').map((s) => +s) || [];
    if (start >= 0 && start <= line && line < end) {
      best = node;
      bestAncestors = ancestors;
    }
    ancestors = [...ancestors, node];
    node.children?.forEach((child) => {
      dfs(child, ancestors);
    });
  }
  let best: INode | undefined;
  let bestAncestors: INode[] = [];
  dfs(root);
  let needRerender = false;
  if (autoExpand) {
    bestAncestors.forEach((node) => {
      if (node.payload?.fold) {
        node.payload.fold = 0;
        needRerender = true;
      }
    });
  }
  return best && { node: best, needRerender };
}

async function highlightNode(node?: INode) {
  active = node && { node };
  await mm.setHighlight(node);
  if (!node) return;
  await mm[
    activeNodeOptions.placement === 'center' ? 'centerNode' : 'ensureVisible'
  ](node, {
    bottom: 80,
  });
}

/**
 * Keyboard shortcuts, available when the markmap preview is focused.
 * Single keys only, since they have no other function in the preview.
 */
const keyHandlers: {
  [key: string]: () => void;
} = {
  f: () =>
    whenReady(() => {
      mm.fit();
      pulseToolbar('fit');
    }),
  r: () => toggleRecursively(),
  '+': () => rescaleByKey(1.25),
  '=': () => rescaleByKey(1.25),
  '-': () => rescaleByKey(0.8),
  e: () => setFoldAll(0),
  c: () => setFoldAll(1),
  t: () => {
    if (active?.node) mm.toggleNode(active.node, isToggleRecursively());
  },
  '?': () => toggleHelp(),
};

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target as HTMLElement | null;
  if (el?.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'Escape') {
    hideHelp();
    return;
  }
  const handler = keyHandlers[e.key.toLowerCase()];
  if (!handler) return;
  e.preventDefault();
  handler();
});

function whenReady(fn: () => void | Promise<void>) {
  return loading?.promise.then(fn);
}

function isToggleRecursively() {
  return mm.options.toggleRecursively;
}

/**
 * Toggle `toggleRecursively` mode, same as the `recurse` toolbar button,
 * and sync the button's active state so the current mode is visible.
 */
function toggleRecursively() {
  const enabled = !mm.options.toggleRecursively;
  mm.setOptions({ toggleRecursively: enabled });
  getToolbarItemEl('recurse')?.classList.toggle('active', enabled);
}

/**
 * Get the rendered DOM element of a toolbar item.
 * `registry[id].content` holds a virtual node instead of the rendered
 * element, so look the button up by its index in the rendered items.
 */
function getToolbarItemEl(id: string) {
  const index = toolbar.items.indexOf(id);
  if (index < 0) return;
  return toolbar.el.querySelectorAll<HTMLElement>('.mm-toolbar-item')[index];
}

/**
 * Briefly highlight a toolbar item, as visual feedback for shortcuts
 * mapped to one-shot actions like `fit` and zooming.
 */
function pulseToolbar(id: string) {
  const el = getToolbarItemEl(id);
  if (!el) return;
  el.classList.add('active');
  setTimeout(() => {
    el.classList.remove('active');
  }, 200);
}

function rescaleByKey(ratio: number) {
  whenReady(() => {
    mm.rescale(ratio);
    pulseToolbar(ratio > 1 ? 'zoomIn' : 'zoomOut');
  });
}

async function setFoldAll(fold: number) {
  await whenReady();
  if (!root) return;
  let isRoot = true;
  walkTree(root, (node, next) => {
    // never fold the root node, otherwise nothing is visible
    if (!isRoot && node.children?.length) {
      node.payload = { ...node.payload, fold };
    }
    isRoot = false;
    next();
  });
  await mm.renderData();
  await mm.fit();
}

let helpEl: HTMLDivElement | undefined;

function toggleHelp() {
  if (helpEl?.isConnected) {
    hideHelp();
    return;
  }
  helpEl = document.createElement('div');
  helpEl.className = 'markmap-help';
  const title = document.createElement('div');
  title.className = 'markmap-help-title';
  title.textContent = 'Keyboard Shortcuts';
  const list = document.createElement('ul');
  const items: [string[], string][] = [
    [['F'], 'Fit window size'],
    [['R'], 'Toggle recursively'],
    [['+', '='], 'Zoom in'],
    [['-'], 'Zoom out'],
    [['E'], 'Expand all'],
    [['C'], 'Collapse all'],
    [['T'], 'Toggle the highlighted node'],
    [['?'], 'Show/hide this help'],
  ];
  items.forEach(([keys, label]) => {
    const li = document.createElement('li');
    const kbdContainer = document.createElement('span');
    keys.forEach((key, i) => {
      if (i) kbdContainer.append(' / ');
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      kbdContainer.append(kbd);
    });
    const text = document.createElement('span');
    text.textContent = label;
    li.append(kbdContainer, text);
    list.append(li);
  });
  helpEl.append(title, list);
  document.body.append(helpEl);
}

function hideHelp() {
  helpEl?.remove();
}
