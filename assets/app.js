const vscode = acquireVsCodeApi();
let firstTime = true;
let root;
let style;
const handlers = {
  setData(data) {
    mm.setData(
      (root = data.root),
      markmap.deriveOptions(data.jsonOptions) || {},
    );
    if (firstTime) {
      mm.fit();
      firstTime = false;
    }
  },
  setCursor(line) {
    const active = root && findActiveNode(line);
    if (active) {
      mm.ensureView(active, {
        bottom: 80,
      });
    }
  },
  setCSS(data) {
    if (!style) {
      style = document.createElement('style');
      document.head.append(style);
    }
    style.textContent = data || '';
  },
  setTheme(dark) {
    document.documentElement.classList[dark ? 'add' : 'remove']('markmap-dark');
  },
};
window.addEventListener('message', (e) => {
  const { type, data } = e.data;
  const handler = handlers[type];
  handler?.(data);
});
document.addEventListener('click', (e) => {
  const el = e.target?.closest('a');
  if (el) {
    const href = el.getAttribute('href');
    if (!href.includes('://')) {
      vscode.postMessage({
        type: 'openFile',
        data: href,
      });
    }
  }
});
vscode.postMessage({ type: 'refresh' });

const toolbar = new markmap.Toolbar();
toolbar.register({
  id: 'editAsText',
  title: 'Edit as text',
  content: createButton('Edit'),
  onClick: clickHandler('editAsText'),
});
toolbar.register({
  id: 'exportAsHtml',
  title: 'Export as HTML',
  content: createButton('Export'),
  onClick: clickHandler('exportAsHtml'),
});
toolbar.setItems([
  'zoomIn',
  'zoomOut',
  'fit',
  'recurse',
  'editAsText',
  'exportAsHtml',
]);
setTimeout(() => {
  toolbar.attach(mm);
  document.body.append(toolbar.el);
});

function createButton(text) {
  const el = document.createElement('div');
  el.className = 'btn-text';
  el.textContent = text;
  return el;
}

function clickHandler(type) {
  return () => {
    vscode.postMessage({ type });
  };
}

function findActiveNode(line) {
  function dfs(node) {
    const [start, end] = node.payload?.lines?.split(',').map((s) => +s) || [];
    if (start >= 0 && start <= line && line < end) {
      best = node;
    }
    node.children?.forEach(dfs);
  }
  let best;
  dfs(root);
  return best;
}
