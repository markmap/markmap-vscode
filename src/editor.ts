import { createPage } from '@markmap/page';
import { debounce } from 'es-toolkit';
import GithubSlugger from 'github-slugger';
import {
  CustomTextEditorProvider,
  DocumentSymbol,
  ExtensionContext,
  Position,
  Selection,
  SymbolInformation,
  SymbolKind,
  TabInputText,
  TextDocument,
  TextEditorRevealType,
  Uri,
  ViewColumn,
  Webview,
  WebviewPanel,
  commands,
  window as vscodeWindow,
  workspace,
} from 'vscode';
import { Utils } from 'vscode-uri';
import { isSafeRelPath } from './paths';
import type { HostMessage, WebviewMessage } from './protocol';

const EXPORT_FORMATS = [
  { label: 'SVG', format: 'svg', detail: 'Vector image' },
  { label: 'PNG', format: 'png', detail: 'Bitmap image' },
  {
    label: 'HTML',
    format: 'html',
    detail: 'Interactive page that works offline',
  },
] as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function writeFile(targetUri: Uri, content: string | Uint8Array) {
  try {
    await workspace.fs.writeFile(
      targetUri,
      typeof content === 'string' ? encoder.encode(content) : content,
    );
  } catch {
    vscodeWindow.showErrorMessage(
      `Cannot write file "${targetUri.toString()}"!`,
    );
  }
}

/** The document's name in its folder, with the extension of the export. */
function defaultExportUri(document: TextDocument, format: string) {
  if (document.isUntitled) return undefined;
  const ext = Utils.extname(document.uri);
  const name = Utils.basename(document.uri).slice(0, -ext.length || undefined);
  return Utils.joinPath(Utils.dirname(document.uri), `${name}.${format}`);
}

function readDefaultOptions() {
  const raw = workspace
    .getConfiguration('markmap')
    .get<string>('defaultOptions');
  try {
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export class MarkmapEditor implements CustomTextEditorProvider {
  private webviewPanelMap = new Map<TextDocument, WebviewPanel>();

  constructor(private context: ExtensionContext) {}

  private resolveAsset(relPath: string) {
    return Utils.joinPath(this.context.extensionUri, relPath);
  }

  private async createHtml(document: TextDocument, title: string) {
    const markdown = document.getText();
    const client = markdown.includes('$') ? 'client-math.js' : 'client.js';
    const script = await workspace.fs.readFile(
      this.resolveAsset(`dist/page/${client}`),
    );
    return createPage({
      title,
      data: { markdown, images: {}, toolbar: true },
      script: decoder.decode(script),
    });
  }

  private renderWebview(webview: Webview) {
    const asset = (relPath: string) =>
      webview.asWebviewUri(this.resolveAsset(relPath)).toString();
    const { cspSource } = webview;
    const csp = [
      `default-src 'none'`,
      `img-src ${cspSource} https: data:`,
      `style-src ${cspSource} 'unsafe-inline'`,
      `script-src ${cspSource}`,
      `font-src ${cspSource}`,
    ].join('; ');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${asset('assets/style.css')}">
</head>
<body>
<script type="module" src="${asset('dist/webview/main.js')}"></script>
</body>
</html>
`;
  }

  resolveCustomTextEditor(document: TextDocument, webviewPanel: WebviewPanel) {
    const { webview } = webviewPanel;
    const documentDir = Utils.dirname(document.uri);
    this.webviewPanelMap.set(document, webviewPanel);
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.resolveAsset('dist'),
        this.resolveAsset('assets'),
        documentDir,
      ],
    };
    webview.html = this.renderWebview(webview);

    const post = (message: HostMessage) => webview.postMessage(message);
    let pendingImageUri: Uri | undefined;

    const updateCursor = () => {
      const editor = vscodeWindow.activeTextEditor;
      if (editor?.document === document) {
        post({
          type: 'setCursor',
          data: document.offsetAt(editor.selection.active),
        });
      }
    };
    const updateCSS = () => {
      const css = workspace
        .getConfiguration('markmap')
        .get<string>('customCSS');
      post({ type: 'setCSS', data: css || '' });
    };
    const update = () => {
      post({
        type: 'setContent',
        data: {
          markdown: document.getText(),
          defaultOptions: readDefaultOptions(),
          baseUri: webview.asWebviewUri(documentDir).toString(),
        },
      });
      updateCursor();
    };
    const debouncedUpdateCursor = debounce(updateCursor, 200);
    const debouncedUpdate = debounce(update, 300);

    const handlers: {
      [T in WebviewMessage['type']]: (
        data: T extends 'ready' | 'editAsText'
          ? undefined
          : Extract<WebviewMessage, { type: T; data: unknown }>['data'],
      ) => void;
    } = {
      ready() {
        updateCSS();
        update();
      },
      editAsText() {
        vscodeWindow.showTextDocument(document, {
          viewColumn: ViewColumn.Beside,
        });
      },
      export: async ({ title }) => {
        const choice = await vscodeWindow.showQuickPick(EXPORT_FORMATS, {
          title: 'Export the map',
          placeHolder: 'Choose a format',
        });
        if (!choice) return;
        const { label, format } = choice;
        const targetUri = await vscodeWindow.showSaveDialog({
          saveLabel: 'Export',
          defaultUri: defaultExportUri(document, format),
          filters: { [label]: [format] },
        });
        if (!targetUri) return;
        if (format === 'html') {
          await writeFile(targetUri, await this.createHtml(document, title));
        } else {
          pendingImageUri = targetUri;
          post({ type: 'exportImage', data: format });
        }
      },
      async exportResult({ content, error }) {
        const targetUri = pendingImageUri;
        pendingImageUri = undefined;
        if (error)
          vscodeWindow.showErrorMessage(`Cannot export the map: ${error}`);
        if (targetUri && content != null) await writeFile(targetUri, content);
      },
      async openFile(relPath) {
        try {
          if (/^[a-z][a-z\d+.-]*:/i.test(relPath)) return;
          // A schemeless URI would otherwise be parsed as an absolute file path.
          const link = Uri.parse(`relative:${relPath}`);
          if (
            link.authority ||
            link.query ||
            !link.path ||
            !isSafeRelPath(link.path)
          )
            return;
          const uri = Utils.joinPath(documentDir, link.path);
          if (!link.fragment) {
            await commands.executeCommand('vscode.open', uri);
            return;
          }
          const target = await workspace.openTextDocument(uri);
          if (target.languageId !== 'markdown') {
            await commands.executeCommand(
              'vscode.open',
              uri.with({ fragment: link.fragment }),
            );
            return;
          }
          const editor = await vscodeWindow.showTextDocument(target);
          const symbols = await commands.executeCommand<
            (DocumentSymbol | SymbolInformation)[]
          >('vscode.executeDocumentSymbolProvider', uri);
          const headings: { text: string; position: Position }[] = [];
          const collect = (items: typeof symbols) => {
            for (const symbol of items || []) {
              // Markdown headings are String symbols named "# Heading";
              // link definitions are Constant symbols and must not consume slugs.
              if (symbol.kind === SymbolKind.String) {
                headings.push({
                  text: symbol.name.replace(/^#{1,6}\s+/, '').trim(),
                  position:
                    'selectionRange' in symbol
                      ? symbol.selectionRange.start
                      : symbol.location.range.start,
                });
              }
              if ('children' in symbol) collect(symbol.children);
            }
          };
          collect(symbols);
          // Duplicate slugs are assigned in source order, not provider tree order.
          headings.sort(
            (a, b) =>
              a.position.line - b.position.line ||
              a.position.character - b.position.character,
          );
          const slugger = new GithubSlugger();
          const heading = headings.find(
            (item) => slugger.slug(item.text) === link.fragment,
          );
          if (!heading) {
            vscodeWindow.showWarningMessage(
              `Cannot find Markdown heading "#${link.fragment}".`,
            );
            return;
          }
          const position = new Position(heading.position.line, 0);
          editor.selection = new Selection(position, position);
          editor.revealRange(editor.selection, TextEditorRevealType.InCenter);
        } catch {
          vscodeWindow.showErrorMessage(`Cannot open link "${relPath}"!`);
        }
      },
      async setFocus(offset) {
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
        const { line, character }: Position = document.positionAt(offset);
        const position = new Position(line, character);
        editor.selection = new Selection(position, position);
        editor.revealRange(editor.selection);
      },
    };

    const disposables = [
      webview.onDidReceiveMessage((message: WebviewMessage) => {
        const data = 'data' in message ? message.data : undefined;
        (handlers[message.type] as (value: typeof data) => void)?.(data);
      }),
      workspace.onDidChangeTextDocument((e) => {
        if (e.document === document) debouncedUpdate();
      }),
      vscodeWindow.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document === document) debouncedUpdateCursor();
      }),
      workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('markmap.defaultOptions')) update();
        if (e.affectsConfiguration('markmap.customCSS')) updateCSS();
      }),
    ];
    webviewPanel.onDidDispose(() => {
      debouncedUpdate.cancel();
      debouncedUpdateCursor.cancel();
      disposables.forEach((disposable) => disposable.dispose());
      this.webviewPanelMap.delete(document);
    });
  }

  toggleActiveNode(document: TextDocument, recursive = false) {
    this.webviewPanelMap.get(document)?.webview.postMessage({
      type: 'toggleNode',
      data: recursive,
    } satisfies HostMessage);
  }
}
