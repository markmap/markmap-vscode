/**
 * convert.js
 *
 * Usage:
 * node convert.js path/to/input.md path/to/output.html
 *
 * This uses Node ≥18’s built-in fetch. If you're on Node 18+, no need to install node-fetch.
 */

const fs = require("fs");
const { Transformer } = require("markmap-lib");

/**
 * Helper: built-in fetch to load JS from a CDN
 * (Node v18+ automatically has fetch in global scope).
 */
async function fetchText(url) {
  console.log(`Workspaceing: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return res.text();
}

/**
 * We’ll create final HTML by hand so we don’t rely on
 * markmap-lib’s "fillTemplate" subpath (which isn't exported).
 */
function buildHtml({ rootData, scripts, css, markmapOptions = {} }) {
  // Scripts are plain JS strings that we’ll inline in <script> tags
  // rootData is the Markmap AST from Transformer.transform()
  // css is a single string with your styling
  // markmapOptions, if you want to pass some JSON options to Markmap.

  // We’ll produce a single HTML with:
  //   1) <style> ... </style>
  //   2) <script> d3 + markmap-view ...
  //   3) <script> that calls Markmap.create(...)

  // All local & offline. No external references.

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Markmap</title>
  <style>
${css}
  </style>
</head>
<body>
  <svg id="mindmap"></svg>

  ${scripts
    .map((js) => `<script>${js}</script>`)
    .join("\n")}

  <script>
    (function() {
      var root = ${JSON.stringify(rootData)};
      // pass optional config if you want
      var options = ${JSON.stringify(markmapOptions)};

      // If markmap is loaded, it should attach to window.markmap:
      var markmap = window.markmap;
      // Create mindmap
      window.mm = markmap.Markmap.create(
        "svg#mindmap",
        markmap.deriveOptions(options),
        root
      );
    })();
  </script>
</body>
</html>`;
}

async function main() {
  const [, , inputFile, outputFile] = process.argv;
  if (!inputFile || !outputFile) {
    console.error("Usage: node convert.js <input.md> <output.html>");
    process.exit(1);
  }

  // 1) Read local Markdown
  const md = fs.readFileSync(inputFile, "utf8");

  // 2) Transform to Markmap AST
  //    (No subpath import needed; we can just use 'Transformer' from markmap-lib)
  const transformer = new Transformer();
  const { root, features } = transformer.transform(md);

  // 3) Minimal custom CSS
  const defaultCSS = `
body { margin: 0; padding: 0; }
svg#mindmap { display: block; width: 100vw; height: 100vh; }
  `;

  // 4) We want d3 and markmap-view from CDN
  //    We'll embed them by fetching their JS and inlining it.
  const cdnUrls = [
    "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js",
    "https://cdn.jsdelivr.net/npm/markmap-view@0.18.10/dist/browser/index.js",
  ];

  // 5) Load each script as text
  const scripts = [];
  for (const url of cdnUrls) {
    const js = await fetchText(url);
    scripts.push(js);
  }

  // 6) Build final HTML
  //    Markmap can read the “root” data and create the mindmap
  //    completely offline, because we inlined the code from CDN
  const html = buildHtml({
    rootData: root,
    scripts,
    css: defaultCSS,
    markmapOptions: {
      // ***** MODIFICATION ADDED HERE *****
      initialExpandLevel: 1,
      // ***********************************
      // Put your Markmap config here if you want
      // e.g. "colorFreezeLevel": 2, etc.
    },
  });

  // 7) Write the single-file HTML
  fs.writeFileSync(outputFile, html, "utf8");
  console.log(`Done! Created: ${outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});