import { join } from 'path';
import {
  Transformer, fillTemplate,
} from 'markmap-lib';
import {
  CustomTextEditorProvider,
  ExtensionContext,
  TextDocument,
  WebviewPanel,
  CancellationToken,
  Uri,
  window as vscodeWindow,
  ViewColumn,
  workspace,
  commands,
} from 'vscode';
import debounce from 'lodash.debounce';

const PREFIX = 'markmap-vscode';
const TOOLBAR_VERSION = process.env.TOOLBAR_VERSION;
const TOOLBAR_CSS = `npm/markmap-toolbar@${TOOLBAR_VERSION}/dist/style.min.css`;
const TOOLBAR_JS = `npm/markmap-toolbar@${TOOLBAR_VERSION}/dist/index.umd.min.js`;
const renderToolbar = (win: any) => {
  const { markmap, mm } = win;
  const toolbar = new markmap.Toolbar();
  toolbar.attach(mm);
  const el = toolbar.render();
  el.setAttribute('style', 'position:absolute;bottom:20px;right:20px');
  document.body.append(el);
};

const transformer = new Transformer();

class MarkmapEditor implements CustomTextEditorProvider {
  static readonly viewType = `${PREFIX}.markmap`;

  constructor(public context: ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: TextDocument,
    webviewPanel: WebviewPanel,
    token: CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    const jsUri = webviewPanel.webview.asWebviewUri(Uri.file(join(this.context.extensionPath, 'assets/app.js')));
    const cssUri = webviewPanel.webview.asWebviewUri(Uri.file(join(this.context.extensionPath, 'assets/style.css')));
    let allAssets = transformer.getAssets();
    allAssets = {
      styles: [
        ...allAssets.styles || [],
        {
          type: 'stylesheet',
          data: {
            href: `https://cdn.jsdelivr.net/${TOOLBAR_CSS}`,
          },
        },
        {
          type: 'stylesheet',
          data: {
            href: `${cssUri}`,
          },
        },
      ],
      scripts: [
        ...allAssets.scripts || [],
        {
          type: 'script',
          data: {
            src: `https://cdn.jsdelivr.net/${TOOLBAR_JS}`,
          },
        },
        {
          type: 'script',
          data: {
            src: `${jsUri}`,
          },
        },
      ],
    };
    webviewPanel.webview.html = fillTemplate(undefined, allAssets);
    const update = () => {
      const md = document.getText();
      const { root } = transformer.transform(md);
      webviewPanel.webview.postMessage({
        type: 'setData',
        data: root,
      });
    };
    const debouncedUpdate = debounce(update, 300);

    const messageHandlers: { [key: string]: (data?: any) => void } = {
      refresh: update,
      editAsText: () => {
        vscodeWindow.showTextDocument(document, {
          viewColumn: ViewColumn.Beside,
        });
      },
      exportAsHtml: async () => {
        const targetUri = await vscodeWindow.showSaveDialog({
          saveLabel: 'Export',
          filters: {
            HTML: ['html'],
          },
        });
        if (!targetUri) return;
        const md = document.getText();
        const { root, features } = transformer.transform(md);
        let assets = transformer.getUsedAssets(features);
        assets = {
          styles: [
            ...assets.styles || [],
            {
              type: 'stylesheet',
              data: {
                href: `https://cdn.jsdelivr.net/${TOOLBAR_CSS}`,
              },
            },
          ],
          scripts: [
            ...assets.scripts || [],
            {
              type: 'script',
              data: {
                src: `https://cdn.jsdelivr.net/${TOOLBAR_JS}`,
              },
            },
            {
              type: 'iife',
              data: {
                fn: (r) => {
                  setTimeout(r, 0, window);
                },
                getParams: () => [renderToolbar],
              },
            },
          ],
        };
        const html = fillTemplate(root, assets);
        const encoder = new TextEncoder();
        const data = encoder.encode(html);
        try {
          await workspace.fs.writeFile(targetUri, data);
        } catch (e) {
          console.error('Cannot write file', e);
          await vscodeWindow.showErrorMessage(`Cannot write file "${targetUri.toString()}"!`);
        }
      },
      // log: (data) => {
      //   console.log('log:', data);
      // },
    };
    webviewPanel.webview.onDidReceiveMessage(e => {
      const handler = messageHandlers[e.type];
      handler?.(e.data);
    });
    workspace.onDidChangeTextDocument(e => {
      if (e.document === document) {
        debouncedUpdate();
      }
    });
  }
}

export function activate(context: ExtensionContext) {
  context.subscriptions.push(commands.registerCommand(`${PREFIX}.open`, () => {
    commands.executeCommand(
      'vscode.openWith',
      vscodeWindow.activeTextEditor.document.uri,
      MarkmapEditor.viewType,
      ViewColumn.Beside,
    );
  }));
  context.subscriptions.push(vscodeWindow.registerCustomEditorProvider(
    MarkmapEditor.viewType,
    new MarkmapEditor(context),
    { webviewOptions: { retainContextWhenHidden: true } },
  ));
}

export function deactivate() {}
