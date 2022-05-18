import {
  Transformer, fillTemplate,
} from 'markmap-lib';
import type { CSSItem, JSItem, IMarkmapJSONOptions } from 'markmap-common';
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
const TOOLBAR_CSS = `https://cdn.jsdelivr.net/npm/markmap-toolbar@${TOOLBAR_VERSION}/dist/style.css`;
const TOOLBAR_JS = `https://cdn.jsdelivr.net/npm/markmap-toolbar@${TOOLBAR_VERSION}/dist/index.umd.min.js`;
const LOCAL_ASSETS = {
  js: {
    app: 'assets/app.js',
    toolbar: 'dist/toolbar/index.umd.min.js',
    d3: 'dist/d3/d3.min.js',
    markmapView: 'dist/markmap-view/index.min.js',
  },
  css: {
    app: 'assets/style.css',
    toolbar: 'dist/toolbar/style.css',
  },
};

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

  private async loadAsset(relPath: string) {
    const bytes = await workspace.fs.readFile(this.resolveAssetPath(relPath))
    const decoder = new TextDecoder();
    const data = decoder.decode(bytes);
    return data;
  }

  public async resolveCustomTextEditor(
    document: TextDocument,
    webviewPanel: WebviewPanel,
    token: CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    const jsUri = webviewPanel.webview.asWebviewUri(this.resolveAssetPath(LOCAL_ASSETS.js.app));
    const cssUri = webviewPanel.webview.asWebviewUri(this.resolveAssetPath(LOCAL_ASSETS.css.app));
    const toolbarJs = webviewPanel.webview.asWebviewUri(this.resolveAssetPath(LOCAL_ASSETS.js.toolbar));
    const toolbarCss = webviewPanel.webview.asWebviewUri(this.resolveAssetPath(LOCAL_ASSETS.css.toolbar));
    const baseJs: JSItem[] = [
      webviewPanel.webview.asWebviewUri(this.resolveAssetPath(LOCAL_ASSETS.js.d3)),
      webviewPanel.webview.asWebviewUri(this.resolveAssetPath(LOCAL_ASSETS.js.markmapView)),
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
        const jsonOptions = {
          ...defaultOptions,
          ...(frontmatter as any)?.markmap,
        };
        const { embedAssets } = jsonOptions as { embedAssets?: boolean };
        let assets = transformer.getUsedAssets(features);
        assets = {
          styles: [
            ...assets.styles || [],
            embedAssets ? {
              type: 'style',
              data: await this.loadAsset(LOCAL_ASSETS.css.toolbar),
            } : {
              type: 'stylesheet',
              data: {
                href: TOOLBAR_CSS,
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
              data: embedAssets ? {
                textContent: await this.loadAsset(LOCAL_ASSETS.js.toolbar),
              } : {
                src: TOOLBAR_JS,
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
        const extra = {
          jsonOptions,
        } as Parameters<typeof fillTemplate>[2];
        if (embedAssets) {
          extra.baseJs = (await Promise.all([
            this.loadAsset(LOCAL_ASSETS.js.d3),
            this.loadAsset(LOCAL_ASSETS.js.markmapView),
          ])).map(textContent => ({
            type: 'script',
            data: {
              textContent,
            },
          }));
        }
        const html = fillTemplate(root, assets, extra);
        const encoder = new TextEncoder();
        const data = encoder.encode(html);
        try {
          await workspace.fs.writeFile(targetUri, data);
        } catch (e) {
          vscodeWindow.showErrorMessage(`Cannot write file "${targetUri.toString()}"!`);
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
