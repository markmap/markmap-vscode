const vscode = acquireVsCodeApi();
const handlers = {
  setData(data) {
    mm.setData(data);
    mm.fit();
  },
};
window.addEventListener('message', e => {
  const { type, data } = e.data;
  const handler = handlers[type];
  handler?.(data);
});
window.addEventListener('resize', () => {
  mm.fit();
});
vscode.postMessage({ type: 'refresh' });

const toolbar = new markmap.Toolbar();
toolbar.register({
  id: 'editAsText',
  title: 'Edit as text',
  content: '<div>Edit</div>',
  onClick: clickHandler('editAsText'),
});
toolbar.register({
  id: 'saveHtml',
  title: 'Save HTML',
  content: '<div>Save</div>',
  onClick: clickHandler('saveHtml'),
});
toolbar.setItems(['zoomIn', 'zoomOut', 'fit', 'editAsText', 'saveHtml']);
document.addEventListener('DOMContentLoaded', () => {
  toolbar.attach(mm);
  document.body.append(toolbar.render());
});

function clickHandler(type) {
  return () => {
    vscode.postMessage({ type });
  };
}