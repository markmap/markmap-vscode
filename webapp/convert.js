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
              // If no newline found after marker (e.g., end of file), treat end of string as end of line
              if (endOfLine === -1) endOfLine = rawContent.length;
              // Content starts *after* the newline following the marker line
              actualStartIndex = endOfLine + 1;
          } else {
              // For '```\n' or '```\r\n', content starts right after the marker
              actualStartIndex = startIndexMarker + marker.length;
          }
          console.log(`Found start marker "${marker}" at index ${startIndexMarker}. Content starts after index ${actualStartIndex -1}.`);
          break; // Stop after finding the first valid marker
      }
  }


  // If no start marker found, we cannot proceed reliably
  if (actualStartIndex === -1) {
     console.error("ERROR: Could not find starting ``` marker (e.g., '```markdown' or '```\\n'). Cannot extract markdown content.");
     // Return original content as a fallback, but warn user it might fail transformation
     console.warn("Processing the raw input file content directly. Markmap conversion may fail if non-markdown text is present.");
     return rawContent;
  }

  // Find the last '```' occurring *after* the beginning of the start marker
  // (startIndexMarker ensures we don't find an end marker before our start marker)
  const endIndexMarker = rawContent.lastIndexOf('```');

  // Check if the last marker is valid and occurs after the start of the content
  if (endIndexMarker !== -1 && endIndexMarker >= actualStartIndex) {
    console.log(`Found last end marker " \`\`\` " at index ${endIndexMarker}. Extracting content between index ${actualStartIndex} and ${endIndexMarker}.`);
    // Extract the substring between the character *after* the start marker line/newline
    // and the character *before* the start of the last end marker
    return rawContent.substring(actualStartIndex, endIndexMarker).trim();
  } else if (endIndexMarker !== -1 && endIndexMarker < actualStartIndex) {
      // This case should be rare if actualStartIndex is calculated correctly, but check anyway
      console.error("ERROR: Found end ``` marker, but it appears *before* the detected start of content. Cannot extract reliably.");
      return ""; // Return empty string as extraction failed
  } else {
     // No '```' found after the start marker at all
     console.warn("WARN: Found starting ``` marker but could not find any closing ``` marker afterwards. Extracting potentially incomplete content from start marker to end of file.");
     // Return everything after the start marker - might be useful sometimes
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

  ${scripts
    .map((js) => `<script>${js}</script>`)
    .join("\n")}

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
        // Provide feedback in the HTML if library fails
        var el = document.getElementById('mindmap');
        if (el) {
          el.outerHTML = '<p style="color:red; font-family: sans-serif; padding: 20px;">Error: Markmap library failed to load from CDN. Cannot render mindmap. Check browser console and network requests.</p>';
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

  // Resolve absolute paths for clarity
  const absoluteInputFile = path.resolve(inputFile);
  const absoluteOutputFile = path.resolve(outputFile);
  console.log(`Input file: ${absoluteInputFile}`);
  console.log(`Output file: ${absoluteOutputFile}`);


  // 1) Read local file content
  let rawContent;
  try {
    rawContent = fs.readFileSync(absoluteInputFile, "utf8");
  } catch (err) {
    console.error(`Error reading input file "${absoluteInputFile}": ${err.message}`);
    process.exit(1);
  }

  // 2) **UPDATED:** Extract the markdown content robustly
  const md = extractMarkdownContentRobust(rawContent);

  if (md === rawContent) {
      console.log("Note: Proceeding with raw file content due to extraction issues or absence of markers.");
  } else if (md.trim() === "") {
       console.warn("WARN: Extracted markdown content is empty. The resulting mindmap will be empty or show an error.");
  }


  // 3) Transform the *extracted* Markdown to Markmap AST
  let root, features;
  try {
    const transformer = new Transformer();
    // It's okay to pass an empty string to transform, it usually yields an empty node.
    ({ root, features } = transformer.transform(md)); // Use extracted 'md' content
    console.log("Markdown transformed successfully.");
  } catch (err) {
    console.error(`Error transforming Markdown: ${err.message}`);
    console.error("This might happen if the extracted content is malformed.");
    // Create a root node indicating the error
    root = { t: 'r', d: 0, c: [{ t: 'p', d: 1, c: [{ t: 't', d: 2, p: { content: `Error: Failed to process Markdown from ${path.basename(inputFile)}` } }] }] };
  }


  // 4) Minimal custom CSS
  const defaultCSS = `
/* Basic styling for SVG container */
body { margin: 0; padding: 0; background-color: #f8f9fa; }
svg#mindmap {
  display: block; /* Prevents potential bottom margin */
  width: 100vw;
  height: 100vh;
  background-color: white; /* Optional: set a background for the SVG area */
}
`;

  // 5) Define CDN URLs for d3 and markmap-view
  const cdnUrls = [
    "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js",
    "https://cdn.jsdelivr.net/npm/markmap-view@0.18.10/dist/browser/index.js",
  ];

  // 6) Load each script as text from CDN
  const scripts = [];
  try {
    console.log("Fetching required JavaScript libraries from CDN...");
    for (const url of cdnUrls) {
      const js = await fetchText(url);
      scripts.push(js);
    }
    console.log("JavaScript libraries fetched successfully.");
  } catch (err) {
     console.error(`CRITICAL Error fetching dependencies from CDN: ${err.message}. HTML will be generated, but the mindmap will not render.`);
     // Continue to generate HTML structure, but it will fail client-side.
  }


  // 7) Build final HTML
  console.log("Building HTML output...");
  const html = buildHtml({
    rootData: root,
    scripts,
    css: defaultCSS,
    markmapOptions: {
      initialExpandLevel: 2, // Expand first 2 levels
      duration: 500,         // Animation duration
      // Add other Markmap options as needed: https://markmap.js.org/docs/json-options
    },
  });
  console.log("HTML structure built.");


  // 8) Write the single-file HTML
  try {
    fs.writeFileSync(absoluteOutputFile, html, "utf8");
    console.log(`Success! HTML mindmap created: ${absoluteOutputFile}`);
  } catch (err) {
     console.error(`Error writing output file "${absoluteOutputFile}": ${err.message}`);
     process.exit(1);
  }
}

// --- Run the main function ---
main().catch((err) => {
  console.error("An unexpected error occurred during conversion:", err);
  process.exit(1);
});