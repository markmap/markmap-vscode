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
const yaml = require("js-yaml");

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
// Node OS and crypto for caching
const os = require('os');
const crypto = require('crypto');

// Simple in-memory + disk cache for fetched scripts to avoid repeated network downloads
const scriptCache = new Map();

/**
 * getScriptFromCacheOrFetch(url) - returns script content as string.
 * First checks in-memory cache, then disk cache under /tmp/markmap_cache, then fetches and saves.
 */
async function getScriptFromCacheOrFetch(url) {
  if (scriptCache.has(url)) return scriptCache.get(url);

  const cacheDir = path.join(os.tmpdir(), 'markmap_cache');
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    console.warn('Could not ensure cache directory exists:', err.message);
  }

  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
  const cacheFile = path.join(cacheDir, `${hash}.js`);

  if (fs.existsSync(cacheFile)) {
    try {
      const data = fs.readFileSync(cacheFile, 'utf8');
      scriptCache.set(url, data);
      console.log(`Loaded cached script from ${cacheFile}`);
      return data;
    } catch (err) {
      console.warn(`Failed to read cache file ${cacheFile}: ${err.message}`);
    }
  }

  console.log(`Fetching and caching JS library: ${url}`);
  const js = await fetchText(url);
  try {
    fs.writeFileSync(cacheFile, js, 'utf8');
    console.log(`Saved fetched script to ${cacheFile}`);
  } catch (err) {
    console.warn(`Failed to write cache file ${cacheFile}: ${err.message}`);
  }

  scriptCache.set(url, js);
  return js;
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

function processMarkdownForMarkmap(md) {
  const lines = md.split('\n');
  const processed = [];
  let currentParagraph = [];
  let inList = false;
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (currentParagraph.length > 0) {
        processed.push('- ' + currentParagraph[0]);
        for (let i = 1; i < currentParagraph.length; i++) {
          processed.push('  ' + currentParagraph[i]);
        }
        currentParagraph = [];
      }
      processed.push(line);
      inList = false;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.match(/^\d+\. /)) {
      if (currentParagraph.length > 0) {
        processed.push('- ' + currentParagraph[0]);
        for (let i = 1; i < currentParagraph.length; i++) {
          processed.push('  ' + currentParagraph[i]);
        }
        currentParagraph = [];
      }
      processed.push(line);
      inList = true;
    } else if (trimmed === '') {
      if (currentParagraph.length > 0 && !inList) {
        processed.push('- ' + currentParagraph[0]);
        for (let i = 1; i < currentParagraph.length; i++) {
          processed.push('  ' + currentParagraph[i]);
        }
        currentParagraph = [];
      }
      processed.push(line);
      inList = false;
    } else {
      if (inList && processed.length > 0) {
        processed.push('  ' + line);
      } else {
        currentParagraph.push(line);
      }
    }
  }
  if (currentParagraph.length > 0) {
    processed.push('- ' + currentParagraph[0]);
    for (let i = 1; i < currentParagraph.length; i++) {
      processed.push('  ' + currentParagraph[i]);
    }
  }
  return processed.join('\n');
}

async function convertMarkdownFileToHtml(inputFile, outputFile) {
  if (!inputFile || !outputFile) {
    throw new Error("convertMarkdownFileToHtml requires inputFile and outputFile arguments.");
  }

  const absoluteInputFile = path.resolve(inputFile);
  const absoluteOutputFile = path.resolve(outputFile);
  console.log(`Input file: ${absoluteInputFile}`);
  console.log(`Output file: ${absoluteOutputFile}`);

  let rawContent;
  try {
    rawContent = fs.readFileSync(absoluteInputFile, "utf8");
  } catch (err) {
    throw new Error(`Error reading input file "${absoluteInputFile}": ${err.message}`);
  }

  const md = extractMarkdownContentRobust(rawContent);
  // Parse YAML frontmatter for markmap options
  let frontmatter = {};
  let content = md;
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmMatch) {
    try {
      frontmatter = yaml.load(fmMatch[1]) || {};
    } catch (e) {
      console.error(`Failed to parse YAML frontmatter: ${e.message}`);
    }
    content = md.slice(fmMatch[0].length);
  }
  if (md === rawContent) {
    console.log("Proceeding with raw content due to extraction issues.");
  } else if (md.trim() === "") {
    console.warn("WARN: Extracted markdown content is empty. Resulting mindmap may be empty.");
  }

  content = processMarkdownForMarkmap(content);

  let root, features;
  try {
    const transformer = new Transformer();
    ({ root, features } = transformer.transform(content));
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
    console.log("Fetching required JavaScript libraries from CDN (with caching)...");
    for (const url of cdnUrls) {
      const js = await getScriptFromCacheOrFetch(url);
      scripts.push(js);
    }
    console.log("JavaScript libraries fetched successfully (cached).");
  } catch (err) {
    console.error(`CRITICAL: Could not fetch dependencies: ${err.message}. HTML may not render mindmap.`);
  }

  console.log("Building HTML output...");
  const defaultMarkmapOptions = { initialExpandLevel: 2, duration: 500 };
  const markmapOpts = Object.assign({}, defaultMarkmapOptions, frontmatter.markmap || {});
  const html = buildHtml({
    rootData: root,
    scripts,
    css: defaultCSS,
    markmapOptions: markmapOpts,
  });
  console.log("HTML structure built.");

  try {
    fs.writeFileSync(absoluteOutputFile, html, "utf8");
    console.log(`Success! HTML mindmap created: ${absoluteOutputFile}`);
  } catch (err) {
    throw new Error(`Error writing output file "${absoluteOutputFile}": ${err.message}`);
  }
}

module.exports = {
  convertMarkdownFileToHtml,
};

// CLI compatibility: when run directly from command line
if (require.main === module) {
  (async () => {
    try {
      const [, , inputFile, outputFile] = process.argv;
      if (!inputFile || !outputFile) {
        console.error("Usage: node convert.js <input.md> <output.html>");
        process.exit(1);
      }
      await convertMarkdownFileToHtml(inputFile, outputFile);
      process.exit(0);
    } catch (err) {
      console.error("An unexpected error occurred during conversion:", err);
      process.exit(1);
    }
  })();
}