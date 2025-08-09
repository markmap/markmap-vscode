/**
 * convert.js
 *
 * Usage:
 * node convert.js path/to/input.md path/to/output.html
 *
 * Modified to robustly extract content between the first '```markdown'
 * (or similar) marker and the last '```' marker found afterwards.
 */

const fs = require("fs");
const path = require("path"); // Using path for consistency
const { Transformer } = require("markmap-lib");

/**
 * Helper: built-in fetch to load JS from a CDN
 * (Node v18+ automatically has fetch in global scope).
 */
async function fetchText(url) {
  console.log(`Workspaceing dependency: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return res.text();
}

/**
 * **UPDATED:** Function to robustly extract content.
 * Finds first ```markdown (or ``` followed by newline) start marker.
 * Finds last ``` end marker occurring *after* the start marker.
 * Extracts content between them.
 */
function extractMarkdownContentRobust(rawContent) {
  let actualStartIndex = -1;
  let startIndexMarker = -1;
  const markers = ['```markdown', '```\n', '```\r\n']; // Markers to check for start

  for (const marker of markers) {
    startIndexMarker = rawContent.indexOf(marker);
    if (startIndexMarker !== -1) {
      if (marker === '```markdown') {
        // Find the end of the line containing '```markdown'
        let endOfLine = rawContent.indexOf('\n', startIndexMarker);
        if (endOfLine === -1) endOfLine = rawContent.length;
        actualStartIndex = endOfLine + 1;
      } else {
        // For '```\n' or '```\r\n', content starts right after the marker
        actualStartIndex = startIndexMarker + marker.length;
      }
      console.log(`Found start marker "${marker}" at index ${startIndexMarker}. Content starts after index ${actualStartIndex - 1}.`);
      break;
    }
  }

  if (actualStartIndex === -1) {
    console.error("ERROR: Could not find starting ``` marker. Cannot extract markdown content.");
    console.warn("Processing the raw input file content directly. Markmap conversion may fail if non-markdown text is present.");
    return rawContent;
  }

  const endIndexMarker = rawContent.lastIndexOf('```');

  if (endIndexMarker !== -1 && endIndexMarker >= actualStartIndex) {
    console.log(`Found last end marker at index ${endIndexMarker}. Extracting content between ${actualStartIndex} and ${endIndexMarker}.`);
    return rawContent.substring(actualStartIndex, endIndexMarker).trim();
  } else if (endIndexMarker !== -1 && endIndexMarker < actualStartIndex) {
    console.error("ERROR: Found end ``` marker before content start. Cannot extract reliably.");
    return "";
  } else {
    console.warn("WARN: Found starting ``` marker but no closing ``` marker. Extracting rest of content.");
    return rawContent.substring(actualStartIndex).trim();
  }
}

/**
 * Builds the final HTML structure for the Markmap.
 */
function buildHtml({ rootData, scripts, css, markmapOptions = {} }) {
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

  ${scripts.map(js => `<script>${js}</script>`).join("\n")}

  <script>
    (function() {
      if (window.markmap && window.markmap.Markmap && window.markmap.deriveOptions) {
        var root = ${JSON.stringify(rootData)};
        var options = ${JSON.stringify(markmapOptions)};
        window.mm = window.markmap.Markmap.create(
          "svg#mindmap",
          window.markmap.deriveOptions(options),
          root
        );
      } else {
        console.error("Markmap library not loaded correctly.");
        var el = document.getElementById('mindmap');
        if (el) {
          el.outerHTML = '<p style="color:red;font-family:sans-serif;padding:20px;">Error: Markmap library failed to load. Check console and network.</p>';
        }
      }
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

  const absoluteInputFile = path.resolve(inputFile);
  const absoluteOutputFile = path.resolve(outputFile);
  console.log(`Input file: ${absoluteInputFile}`);
  console.log(`Output file: ${absoluteOutputFile}`);

  let rawContent;
  try {
    rawContent = fs.readFileSync(absoluteInputFile, "utf8");
  } catch (err) {
    console.error(`Error reading input file "${absoluteInputFile}": ${err.message}`);
    process.exit(1);
  }

  const md = extractMarkdownContentRobust(rawContent);
  if (md === rawContent) {
    console.log("Proceeding with raw content due to extraction issues.");
  } else if (md.trim() === "") {
    console.warn("WARN: Extracted markdown content is empty. Resulting mindmap may be empty.");
  }

  let root, features;
  try {
    const transformer = new Transformer();
    ({ root, features } = transformer.transform(md));
    console.log("Markdown transformed successfully.");
  } catch (err) {
    console.error(`Error transforming Markdown: ${err.message}`);
    root = { t: 'r', d: 0, c: [{ t: 'p', d: 1, c: [{ t: 't', d: 2, p: { content: `Error: Failed to process Markdown.` } }] }] };
  }

  const defaultCSS = `
/* Basic styling for SVG container */
body { margin: 0; padding: 0; background-color: #f8f9fa; }
svg#mindmap {
  display: block;
  width: 100vw;
  height: 100vh;
  background-color: white;
}
`;

  const cdnUrls = [
    "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js",
    "https://cdn.jsdelivr.net/npm/markmap-view@0.18.10/dist/browser/index.js",
  ];

  const scripts = [];
  try {
    console.log("Fetching required JavaScript libraries from CDN...");
    for (const url of cdnUrls) {
      const js = await fetchText(url);
      scripts.push(js);
    }
    console.log("JavaScript libraries fetched successfully.");
  } catch (err) {
    console.error(`CRITICAL: Could not fetch dependencies: ${err.message}. HTML may not render mindmap.`);
  }

  console.log("Building HTML output...");
  const html = buildHtml({
    rootData: root,
    scripts,
    css: defaultCSS,
    markmapOptions: {
      initialExpandLevel: 2,
      duration: 500,
    },
  });
  console.log("HTML structure built.");

  try {
    fs.writeFileSync(absoluteOutputFile, html, "utf8");
    console.log(`Success! HTML mindmap created: ${absoluteOutputFile}`);
  } catch (err) {
    console.error(`Error writing output file "${absoluteOutputFile}": ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("An unexpected error occurred during conversion:", err);
  process.exit(1);
});