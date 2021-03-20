const vscode = acquireVsCodeApi();
let firstTime = true;
let root;
const handlers = {
  setData(data) {
    mm.setData(data);
    root = data;
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
};
window.addEventListener('message', e => {
  const { type, data } = e.data;
  const handler = handlers[type];
  handler?.(data);
});
vscode.postMessage({ type: 'refresh' });

const toolbar = new markmap.Toolbar();
toolbar.register({
  id: 'editAsText',
  title: 'Edit as text',
  content: '<div class="btn-text">Edit</div>',
  onClick: clickHandler('editAsText'),
});
toolbar.register({
  id: 'exportAsHtml',
  title: 'Export as HTML',
  content: '<div class="btn-text">Export</div>',
  onClick: clickHandler('exportAsHtml'),
});
toolbar.setItems(['zoomIn', 'zoomOut', 'fit', 'editAsText', 'exportAsHtml']);
setTimeout(() => {
  toolbar.attach(mm);
  document.body.append(toolbar.render());
});

function clickHandler(type) {
  return () => {
    vscode.postMessage({ type });
  };
}

function findActiveNode(line) {
  function dfs(node) {
    const lines = node.p?.lines;
    if (lines && lines[0] <= line && line < lines[1]) {
      best = node;
    }
    node.c?.forEach(dfs);
  }
  let best;
  dfs(root);
  return best;
}
