# markmap-vscode

[![vscode](https://img.shields.io/visual-studio-marketplace/v/gera2ld.markmap-vscode)](https://marketplace.visualstudio.com/items?itemName=gera2ld.markmap-vscode)
[![open vsx](https://img.shields.io/open-vsx/v/gera2ld/markmap-vscode)](https://open-vsx.org/extension/gera2ld/markmap-vscode)

This extension integrates [markmap](https://markmap.js.org/) into VSCode.

## Features

- Preview markdown files as markmap
- Edit markdown files in a text editor and the markmap will update on the fly
- Themes and layouts, set in frontmatter
- Export as HTML, SVG or PNG
- Works offline

<img width="1014" alt="markmap" src="https://user-images.githubusercontent.com/3139113/97068999-5f9e8480-15ff-11eb-8222-43d26cecade5.png">

## Usage

### Command Palette

Open a markdown file. Then open the Command Palette (⇧⌘P) and search `Open as markmap`, press enter.

### Context menu

Right click on a markdown file, then choose `Open as markmap`.

### Button on title-bar

Open a markdown file. Find the markmap icon on the editor title-bar and click it.

![title button](https://user-images.githubusercontent.com/3139113/110966366-25f0cf00-8390-11eb-9a16-3c4d66712f47.png)

## Configuration

### Custom CSS

Extra CSS for the page around the map. To change colors, set `--mm-*` properties on `markmap-view`. See [Themes and layouts](https://markmap.js.org/docs/guide/themes-and-layouts) for the list.

```css
markmap-view {
  --mm-link: rebeccapurple;
}
```

### Default Options

Default options for Markmap as JSON, see [Options](https://markmap.js.org/docs/guide/options). Options in the frontmatter of a document win over these.
