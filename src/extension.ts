import debounce from 'lodash.debounce';
import { JSItem, type CSSItem } from 'markmap-common';
import { fillTemplate } from 'markmap-render';
import { type IMarkmapJSONOptions } from 'markmap-view';
import {
  CustomTextEditorProvider,
  ExtensionContext,
  Position,
  Selection,
  TabInputText,
  TextDocument,
  Uri,
  ViewColumn,
  WebviewPanel,
  commands,
  window as vscodeWindow,
  workspace,
} from 'vscode';
import { Utils } from 'vscode-uri';
import localImage from './plugins/local-image';
import {
  getAssets,
  getLocalTransformer,
  mergeAssets,
  setExportMode,
  transformerExport,
} from './util';

const PREFIX = 'markmap-vscode';
const VIEW_TYPE = `${PREFIX}.markmap`;

function renderToolbar() {
  const { markmap, mm } = window as any;
  const { el } = markmap.Toolbar.create(mm);
  el.setAttribute('style', 'position:absolute;bottom:20px;right:20px');
  document.body.append(el);
}

async function writeFile(targetUri: Uri, text: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  try {
    await workspace.fs.writeFile(targetUri, data);
  } catch {
    vscodeWindow.showErrorMessage(
      `Cannot write file "${targetUri.toString()}"!`,
    );
  }
}

class MarkmapEditor implements CustomTextEditorProvider {
  private webviewPanelMap = new Map<TextDocument, WebviewPanel>();

  constructor(private context: ExtensionContext) {}

  private resolveAssetPath(relPath: string) {
    return Utils.joinPath(this.context.extensionUri, relPath);
  }

  private async loadAsset(relPath: string) {
    const bytes = await workspace.fs.readFile(this.resolveAssetPath(relPath));
    const decoder = new TextDecoder();
    const data = decoder.decode(bytes);
    return data;
  }

  resolveCustomTextEditor(document: TextDocument, webviewPanel: WebviewPanel) {
    this.webviewPanelMap.set(document, webviewPanel);
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    const resolveUrl = (relPath: string) =>
      webviewPanel.webview
        .asWebviewUri(this.resolveAssetPath(relPath))
        .toString();
    const transformerLocal = getLocalTransformer([
      localImage((relPath) =>
        webviewPanel.webview
          .asWebviewUri(Utils.joinPath(Utils.dirname(document.uri), relPath))
          .toString(),
      ),
    ]);
    const { allAssets } = getAssets(transformerLocal);
    const resolvedAssets = {
      ...allAssets,
      styles: allAssets.styles?.map((item) => {
        if (item.type === 'stylesheet') {
          return {
            ...item,
            data: {
              href: resolveUrl(item.data.href),
            },
          };
        }
        return item;
      }),
      scripts: allAssets.scripts?.map((item) => {
        if (item.type === 'script' && item.data.src) {
          return {
            ...item,
            data: {
              ...item.data,
              src: resolveUrl(item.data.src),
            },
          };
        }
        return item;
      }),
    };
    webviewPanel.webview.html = fillTemplate(undefined, resolvedAssets, {
      baseJs: [],
      urlBuilder: transformerLocal.urlBuilder,
    });
    const updateCursor = () => {
      const editor = vscodeWindow.activeTextEditor;
      if (editor?.document === document) {
        webviewPanel.webview.postMessage({
          type: 'setCursor',
          data: {
            line: editor.selection.active.line,
            autoExpand: globalOptions?.autoExpand,
          },
        });
      }
    };
    let globalOptions: IMarkmapJSONOptions & {
      autoExpand?: boolean;
      htmlParser?: unknown;
    };
    let customCSS: string;
    const updateOptions = () => {
      const raw = workspace
        .getConfiguration('markmap')
        .get<string>('defaultOptions');
      try {
        globalOptions = raw && JSON.parse(raw);
      } catch {
        globalOptions = null;
      }
      update();
    };
    const updateCSS = () => {
      customCSS = workspace
        .getConfiguration('markmap')
        .get<string>('customCSS');
      webviewPanel.webview.postMessage({
        type: 'setCSS',
        data: customCSS,
      });
    };
    const updateTheme = () => {
      webviewPanel.webview.postMessage({
        type: 'checkTheme',
      });
    };
    const update = () => {
      const md = document.getText();
      const { root, frontmatter } = transformerLocal.transform(
        md,
        globalOptions?.htmlParser,
      );
      webviewPanel.webview.postMessage({
        type: 'setData',
        data: {
          root,
          jsonOptions: {
            ...globalOptions,
            ...(frontmatter as any)?.markmap,
          },
        },
      });
      updateCursor();
    };
    const debouncedUpdateCursor = debounce(updateCursor, 300);
    const debouncedUpdate = debounce(update, 300);

    const logger = vscodeWindow.createOutputChannel('Markmap');

    const exportAsHtml = async (targetUri: Uri) => {
      const md = document.getText();
      const { root, features, frontmatter } = transformerExport.transform(md);
      const jsonOptions = {
        ...globalOptions,
        ...(frontmatter as any)?.markmap,
      };
      const { embedAssets } = jsonOptions as { embedAssets?: boolean };
      setExportMode(embedAssets);
      let assets = transformerExport.getUsedAssets(features);
      const { baseAssets, toolbarAssets } = getAssets(transformerExport);
      assets = mergeAssets(baseAssets, assets, toolbarAssets, {
        styles: [
          ...(customCSS
            ? [
                {
                  type: 'style',
                  data: customCSS,
                } as CSSItem,
              ]
            : []),
        ],
        scripts: [
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
      });
      if (embedAssets) {
        const [styles, scripts] = await Promise.all([
          Promise.all(
            (assets.styles || []).map(async (item): Promise<CSSItem> => {
              if (item.type === 'stylesheet') {
                return {
                  type: 'style',
                  data: await this.loadAsset(item.data.href),
                };
              }
              return item;
            }),
          ),
          Promise.all(
            (assets.scripts || []).map(async (item): Promise<JSItem> => {
              if (item.type === 'script' && item.data.src) {
                return {
                  ...item,
                  data: {
                    textContent: await this.loadAsset(item.data.src),
                  },
                };
              }
              return item;
            }),
          ),
        ]);
        assets = {
          styles,
          scripts,
        };
      }
      const html = fillTemplate(root, assets, {
        baseJs: [],
        jsonOptions,
        urlBuilder: transformerExport.urlBuilder,
      });
      await writeFile(targetUri, html);
    };

    const messageHandlers: { [key: string]: (data?: any) => void } = {
      refresh: () => {
        update();
        updateCSS();
        updateTheme();
      },
      editAsText: () => {
        vscodeWindow.showTextDocument(document, {
          viewColumn: ViewColumn.Beside,
        });
      },
      async export() {
        const targetUri = await vscodeWindow.showSaveDialog({
          saveLabel: 'Export',
          filters: {
            HTML: ['html'],
            SVG: ['svg'],
          },
        });
        if (!targetUri) return;
        if (targetUri.path.endsWith('.html')) {
          await exportAsHtml(targetUri);
        } else if (targetUri.path.endsWith('.svg')) {
          webviewPanel.webview.postMessage({
            type: 'downloadSvg',
            data: targetUri.toString(),
          });
        }
      },
      async downloadSvg(data: { content: string; path: string }) {
        const targetUri = Uri.parse(data.path);
        await writeFile(targetUri, data.content);
      },
      openFile(relPath: string) {
        const filePath = Utils.joinPath(Utils.dirname(document.uri), relPath);
        commands.executeCommand('vscode.open', filePath);
      },
      async setFocus(line: number) {
        const viewColumn = vscodeWindow.tabGroups.all
          .flatMap((group) => group.tabs)
          .find(
            (tab) =>
              tab.input instanceof TabInputText &&
              tab.group &&
              tab.input.uri.toString() === document.uri.toString(),
          )?.group.viewColumn;
        const editor = await vscodeWindow.showTextDocument(document, {
          viewColumn,
        });
        const pos = new Position(line, 0);
        editor.selection = new Selection(pos, pos);
        editor.revealRange(editor.selection);
      },
      log(data: string) {
        logger.appendLine(data);
      },
    };

    updateOptions();
    updateCSS();
    updateTheme();

    const disposables = [
      webviewPanel.webview.onDidReceiveMessage((e) => {
        const handler = messageHandlers[e.type];
        handler?.(e.data);
      }),
      workspace.onDidChangeTextDocument((e) => {
        if (e.document !== document) return;
        debouncedUpdate();
      }),
      vscodeWindow.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document !== document) return;
        debouncedUpdateCursor();
      }),
      vscodeWindow.onDidChangeActiveColorTheme(updateTheme),
      workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('markmap.defaultOptions')) updateOptions();
        if (e.affectsConfiguration('markmap.customCSS')) updateCSS();
      }),
    ];
    webviewPanel.onDidDispose(() => {
      disposables.forEach((disposable) => disposable.dispose());
      this.webviewPanelMap.delete(document);
    });
  }

  toggleActiveNode(document: TextDocument, recursive = false) {
    const webviewPanel = this.webviewPanelMap.get(document);
    if (!webviewPanel) return;
    webviewPanel.webview.postMessage({
      type: 'toggleNode',
      data: recursive,
    });
  }
}

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
