import type { INode } from 'markmap-common';
import { Toolbar } from 'markmap-toolbar';
import {
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
      el: Element;
    }
  | undefined;

const handlers = {
  async setData(data: { root?: INode; jsonOptions?: IMarkmapJSONOptions }) {
    await mm.setData((root = data.root), deriveOptions(data.jsonOptions) || {});
    if (firstTime) {
      mm.fit();
      firstTime = false;
    }
  },
  async setCursor(options: { line: number; autoExpand?: boolean }) {
    const result = root && findActiveNode(options);
    if (!result) return;
    const { node, needRerender } = result;
    if (needRerender) await mm.renderData();
    if (node) highlightNode(node);
  },
  setCSS(data: string) {
    if (!style) {
      style = document.createElement('style');
      document.head.append(style);
    }
    style.textContent = data || '';
  },
  setTheme(dark: boolean) {
    document.documentElement.classList[dark ? 'add' : 'remove']('markmap-dark');
  },
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
      if (node) highlightNode(node);
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
const highlightEl = document.createElement('div');
highlightEl.className = 'markmap-highlight-area';
setTimeout(() => {
  toolbar.attach(mm);
  document.body.append(toolbar.el);
  checkHighlight();
});

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

function highlightNode(node: INode) {
  mm.ensureView(node, {
    bottom: 80,
  });
  const g = mm.findElement(node)?.g;
  const el = g?.querySelector('foreignObject');
  active = el && { el, node };
}

function checkHighlight() {
  if (!active) {
    highlightEl.remove();
  } else {
    const rect = active.el.getBoundingClientRect();
    highlightEl.setAttribute(
      'style',
      `--mm-highlight-x:${rect.x}px;--mm-highlight-y:${rect.y}px;--mm-highlight-width:${rect.width}px;--mm-highlight-height:${rect.height}px`,
    );
    document.body.append(highlightEl);
  }
  requestAnimationFrame(checkHighlight);
}
