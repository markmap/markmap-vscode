# markmap-vscode

![vscode](https://img.shields.io/visual-studio-marketplace/v/gera2ld.markmap-vscode)
![open vsx](https://img.shields.io/open-vsx/v/gera2ld/markmap-vscode)

This extension integrates [markmap](https://markmap.js.org/) into VSCode.

## Features

- Preview markdown files as markmap
- Edit markdown files in a text editor and the markmap will update on the fly
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

Extra CSS to customize the style of markmap.

### Default Options

A JSON object that will be overridden by `markmap` object in `frontmatter`, passed to markmap-view.

```json
{
  "color": "#2980b9",
  "embedAssets": false
}
```

- `color`: *string | string[]*

    Define the color of lines and circles in markmap. If only one color is provided, the markmap will be rendered in solid color.

- `embedAssets`: *boolean*

    Whether to embed all critical assets in HTML to remove CDN dependencies (jsdelivr). This is helpful to regions that block CDNs. The downside is that the exported HTML file will be bloated.

    Note: Plugin assets will not be embedded for now.
