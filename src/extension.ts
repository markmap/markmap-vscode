import {
  Transformer, fillTemplate,
} from 'markmap-lib';
import type { CSSItem, JSItem } from 'markmap-common';
import type { IMarkmapJSONOptions } from 'markmap-view';
import {
  CancellationToken,
  CustomTextEditorProvider,
  ExtensionContext,
  TextDocument,
  ViewColumn,
  WebviewPanel,
  commands,
  window as vscodeWindow,
  workspace,
  Uri,
} from 'vscode';
import debounce from 'lodash.debounce';
import { Utils } from 'vscode-uri';

const PREFIX = 'markmap-vscode';
const VIEW_TYPE = `${PREFIX}.markmap`;
const TOOLBAR_VERSION = process.env.TOOLBAR_VERSION;
const TOOLBAR_CSS = `npm/markmap-toolbar@${TOOLBAR_VERSION}/dist/style.css`;
const TOOLBAR_JS = `npm/markmap-toolbar@${TOOLBAR_VERSION}/dist/index.umd.min.js`;
const renderToolbar = () => {
  const { markmap, mm } = window as any;
  const toolbar = new markmap.Toolbar();
  toolbar.attach(mm);
  const el = toolbar.render();
  el.setAttribute('style', 'position:absolute;bottom:20px;right:20px');
  document.body.append(el);
};

const transformer = new Transformer();

class MarkmapEditor implements CustomTextEditorProvider {
  constructor(private context: ExtensionContext) {}

  private resolveAssetPath(relPath: string) {
    return Utils.joinPath(this.context.extensionUri, relPath);
  }

  public async resolveCustomTextEditor(
    document: TextDocument,
    webviewPanel: WebviewPanel,
    token: CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    const jsUri = webviewPanel.webview.asWebviewUri(this.resolveAssetPath('assets/app.js'));
    const cssUri = webviewPanel.webview.asWebviewUri(this.resolveAssetPath('assets/style.css'));
    const toolbarJs = webviewPanel.webview.asWebviewUri(this.resolveAssetPath('dist/toolbar/index.umd.min.js'));
    const toolbarCss = webviewPanel.webview.asWebviewUri(this.resolveAssetPath('dist/toolbar/style.css'));
    const baseJs: JSItem[] = [
      webviewPanel.webview.asWebviewUri(this.resolveAssetPath('dist/d3/d3.min.js')),
      webviewPanel.webview.asWebviewUri(this.resolveAssetPath('dist/markmap-view/index.min.js')),
    ].map(uri => ({ type: 'script', data: { src: uri.toString() } }));
    let allAssets = transformer.getAssets();
    allAssets = {
      styles: [
        ...allAssets.styles || [],
        {
          type: 'stylesheet',
          data: {
            href: toolbarCss.toString(),
          },
        },
        {
          type: 'stylesheet',
          data: {
            href: cssUri.toString(),
          },
        },
      ],
      scripts: [
        ...allAssets.scripts || [],
        {
          type: 'script',
          data: {
            src: toolbarJs.toString(),
          },
        },
        {
          type: 'script',
          data: {
            src: jsUri.toString(),
          },
        },
      ],
    };
    webviewPanel.webview.html = fillTemplate(undefined, allAssets, {
      baseJs,
    });
    const updateCursor = () => {
      const editor = vscodeWindow.activeTextEditor;
      if (editor?.document === document) {
        webviewPanel.webview.postMessage({
          type: 'setCursor',
          data: editor.selection.active.line,
        });
      }
    };
    let defaultOptions: IMarkmapJSONOptions;
    let customCSS: string;
    const updateOptions = () => {
      const raw = workspace.getConfiguration('markmap').get<string>('defaultOptions');
      try {
        defaultOptions = raw && JSON.parse(raw);
      } catch {
        defaultOptions = null;
      }
      update();
    };
    const updateCSS = () => {
      customCSS = workspace.getConfiguration('markmap').get<string>('customCSS');
      webviewPanel.webview.postMessage({
        type: 'setCSS',
        data: customCSS,
      });
    };
    const update = () => {
      const md = document.getText();
      const { root, frontmatter } = transformer.transform(md);
      webviewPanel.webview.postMessage({
        type: 'setData',
        data: {
          root,
          jsonOptions: {
            ...defaultOptions,
            ...(frontmatter as any)?.markmap,
          },
        },
      });
      updateCursor();
    };
    const debouncedUpdateCursor = debounce(updateCursor, 300);
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
        const { root, features, frontmatter } = transformer.transform(md);
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
            ...customCSS ? [
              {
                type: 'style',
                data: customCSS,
              } as CSSItem,
            ] : [],
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
                fn: (r: typeof renderToolbar) => {
                  setTimeout(r);
                },
                getParams: () => [renderToolbar],
              },
            },
          ],
        };
        const html = fillTemplate(root, assets, {
          jsonOptions: {
            ...defaultOptions,
            ...(frontmatter as any)?.markmap,
          },
        });
        const encoder = new TextEncoder();
        const data = encoder.encode(html);
        try {
          await workspace.fs.writeFile(targetUri, data);
        } catch (e) {
          console.error('Cannot write file', e);
          await vscodeWindow.showErrorMessage(`Cannot write file "${targetUri.toString()}"!`);
        }
      },
      openFile(relPath: string) {
        const filePath = Utils.joinPath(Utils.dirname(document.uri), relPath);
        commands.executeCommand(
          'vscode.open',
          filePath,
        );
      },
    };
    // const logger = vscodeWindow.createOutputChannel('Markmap');
    // messageHandlers.log = (data: string) => {
    //   logger.appendLine(data);
    // };
    webviewPanel.webview.onDidReceiveMessage(e => {
      const handler = messageHandlers[e.type];
      handler?.(e.data);
    });
    workspace.onDidChangeTextDocument(e => {
      if (e.document === document) {
        debouncedUpdate();
      }
    });
    vscodeWindow.onDidChangeTextEditorSelection(() => {
      debouncedUpdateCursor();
    });
    updateOptions();
    updateCSS();
    workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('markmap.defaultOptions')) updateOptions();
      if (e.affectsConfiguration('markmap.customCSS')) updateCSS();
    });
  }
}

export function activate(context: ExtensionContext) {
  context.subscriptions.push(commands.registerCommand(`${PREFIX}.open`, (uri?: Uri) => {
    uri ??= vscodeWindow.activeTextEditor?.document.uri;
    commands.executeCommand(
      'vscode.openWith',
      uri,
      VIEW_TYPE,
      ViewColumn.Beside,
    );
  }));
  const markmapEditor = new MarkmapEditor(context);
  context.subscriptions.push(vscodeWindow.registerCustomEditorProvider(
    VIEW_TYPE,
    markmapEditor,
    { webviewOptions: { retainContextWhenHidden: true } },
  ));
}

export function deactivate() {
  // noop
}
