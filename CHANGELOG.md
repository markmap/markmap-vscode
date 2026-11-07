# Change Log

## 0.3.0

Rebuilt on the new `@markmap/*` packages.

- Add themes (`classic`, `cards`, `minimal`) and layouts (`tree`, `two-sided`, `org-chart`), set in frontmatter
- Add PNG export, and choose the format before picking a file
- Keep folded branches while editing
- Follow the VS Code color theme
- Add a content security policy to the webview, and limit local files to the document's folder
- Paragraphs, code blocks and tables are now notes that open in a popover, not nodes
- Raw HTML is dropped, except `<!-- markmap: fold -->` comments and single `<img>` tags
- Math uses MathJax instead of KaTeX
- Option names changed, for example `initialExpandLevel` is now `foldLevel`, and old names show a warning. See the [migration guide](https://markmap.js.org/docs/migration)
- Remove the `activeNode`, `autoExpand`, `embedAssets` and `htmlParser` options
- `markmap.customCSS` can no longer style the inside of a map. Set `--mm-*` properties on `markmap-view` instead
- Exported HTML always works offline, and `markmap.defaultOptions` and `markmap.customCSS` do not apply to it

## 0.2.12

- Fix security issue in file operations requested from the webview, thanks to Brian Willows for reporting

## 0.1.1

- Use <kbd>Cmd</kbd>+click to toggle nodes recursively on macOS

## 0.1.0

- Added offline mode

## 0.0.4

- Fix nested list with depth greater than 10
- Bundle with rollup to decrease package size

## 0.0.2

- Initial release
