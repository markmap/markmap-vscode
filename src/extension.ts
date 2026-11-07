import {
  ExtensionContext,
  Uri,
  ViewColumn,
  commands,
  window as vscodeWindow,
} from 'vscode';
import { MarkmapEditor } from './editor';

const PREFIX = 'markmap-vscode';
const VIEW_TYPE = `${PREFIX}.markmap`;

export function activate(context: ExtensionContext) {
  const markmapEditor = new MarkmapEditor(context);
  context.subscriptions.push(
    commands.registerCommand(`${PREFIX}.open`, (uri?: Uri) => {
      uri ??= vscodeWindow.activeTextEditor?.document.uri;
      commands.executeCommand(
        'vscode.openWith',
        uri,
        VIEW_TYPE,
        ViewColumn.Beside,
      );
    }),
    commands.registerCommand(`${PREFIX}.toggle`, () => {
      const document = vscodeWindow.activeTextEditor?.document;
      if (document) markmapEditor.toggleActiveNode(document);
    }),
    commands.registerCommand(`${PREFIX}.toggle-recursively`, () => {
      const document = vscodeWindow.activeTextEditor?.document;
      if (document) markmapEditor.toggleActiveNode(document, true);
    }),
  );
  context.subscriptions.push(
    vscodeWindow.registerCustomEditorProvider(VIEW_TYPE, markmapEditor, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate() {
  // noop
}
