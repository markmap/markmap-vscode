import { join } from 'path';
import { transform, getAssets, getUsedAssets } from 'markmap-lib/dist/transform';
import { fillTemplate } from 'markmap-lib/dist/template';
import {
  CustomTextEditorProvider,
  ExtensionContext,
  TextDocument,
  WebviewPanel,
  CancellationToken,
  Uri,
  window,
  ViewColumn,
  workspace,
} from 'vscode';
import { debounce } from 'lodash';

const TOOLBAR_VERSION = '0.1.3';
const TOOLBAR_CSS = `npm/markmap-toolbar@${TOOLBAR_VERSION}/dist/style.min.css`;
const TOOLBAR_JS = `npm/markmap-toolbar@${TOOLBAR_VERSION}/dist/index.umd.min.js`;
const renderToolbar = new Function(`\
const toolbar = new markmap.Toolbar();
toolbar.attach(mm);
const el = toolbar.render();
el.setAttribute('style', 'position:absolute;bottom:20px;right:20px');
document.body.append(el);`);

export function activate(context: ExtensionContext) {
  context.subscriptions.push(window.registerCustomEditorProvider(
    MarkmapEditor.viewType,
    new MarkmapEditor(context),
    { webviewOptions: { retainContextWhenHidden: true } },
  ));
}

// this method is called when your extension is deactivated
export function deactivate() {}

class MarkmapEditor implements CustomTextEditorProvider {
  static readonly viewType = 'markmap-vscode.markmap';

  constructor(public context: ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: TextDocument,
    webviewPanel: WebviewPanel,
    token: CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    const jsUri = webviewPanel.webview.asWebviewUri(Uri.file(join(this.context.extensionPath, 'assets/app.js')));
    const cssUri = webviewPanel.webview.asWebviewUri(Uri.file(join(this.context.extensionPath, 'assets/style.css')));
    let assets = getAssets();
    assets = {
      styles: [
        ...assets.styles || [],
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
        ...assets.scripts || [],
        {
          type: 'script',
          data: {
            src: `https://cdn.jsdelivr.net/combine/npm/@gera2ld/jsx-dom@1.2.1/dist/index.min.js,${TOOLBAR_JS}`,
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
    webviewPanel.webview.html = fillTemplate(undefined, assets);
    const update = () => {
      const md = document.getText();
      const { root } = transform(md);
      webviewPanel.webview.postMessage({
        type: 'setData',
        data: root,
      });
    };
    const debouncedUpdate = debounce(update, 300);

    const messageHandlers: { [key: string]: (data?: any) => void } = {
      refresh: update,
      editAsText: () => {
        const editor = window.showTextDocument(document, {
          viewColumn: ViewColumn.Beside,
        });
      },
      exportAsHtml: async () => {
        const targetUri = await window.showSaveDialog({
          saveLabel: 'Export',
          filters: {
            HTML: ['html'],
          },
        });
        if (!targetUri) return;
        const md = document.getText();
        const { root, features } = transform(md);
        let assets = getUsedAssets(features);
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
                src: `https://cdn.jsdelivr.net/combine/npm/@gera2ld/jsx-dom@1.2.1/dist/index.min.js,${TOOLBAR_JS}`,
              },
            },
            {
              type: 'iife',
              data: {
                fn: (renderToolbar) => {
                  setTimeout(renderToolbar);
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
          console.error("Cannot write file", e);
          await window.showErrorMessage(`Cannot write file "${targetUri.toString()}"!`);
        }
      },
      log: (data) => {
        console.log('log:', data);
      },
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
