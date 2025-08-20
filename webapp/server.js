// FILE: webapp/server.js (MODIFIED to use internal services/config)
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const MarkdownIt = require('markdown-it');

// Load dotenv *ONCE* here at the main entry point for the webapp
// It will load the ./webapp/.env file
require('dotenv').config();

// --- Import Secret Service and Load Secrets ---
const { loadSecretsIntoEnv } = require('./services/secretService.js');
const yaml = require('js-yaml');

// Define the list of secret keys your application needs
const secretKeys = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'];

// --- Main Application Start ---
async function startServer() {
    // Load secrets from GCP Secret Manager.
    // This will only run if GCP_PROJECT is set and the keys are not already in the environment.
    await loadSecretsIntoEnv(secretKeys);

    // --- Dynamically Import Services AFTER secrets are loaded ---
    // This ensures that when llmService is initialized, the environment variables are already set.
    const { generateMindmapContent } = require('./services/llmService.js');

// --- Load Prompt Template ---
const promptFilePath = path.join(__dirname, 'mindmap_prompt.txt');
let basePromptTemplate;
try {
    basePromptTemplate = fs.readFileSync(promptFilePath, 'utf8');
    console.log(`Prompt template loaded successfully from ${promptFilePath}`);
} catch (err) {
    console.error(`FATAL ERROR: Could not read prompt template file at ${promptFilePath}.`, err);
    console.error("Please ensure 'mindmap_prompt.txt' exists in the 'webapp' directory.");
    process.exit(1);
}

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// --- Routes ---

// GENERATE Mindmap from LLM (No changes needed in this route logic itself)
app.post('/generate', async (req, res) => {
    try {
    const { bookName, authorName, language, provider, model, wordCount } = req.body;
    console.log(`Received generate request: Book="${bookName}", Author="${authorName}", Language="${language || 'English'}", Provider="${provider}", Model="${model || 'Default'}", WordCount="${wordCount || 'Default'}"`);
 
        if (!bookName || !authorName || !provider) {
            console.error('Error: Missing required fields:', { bookName, authorName, provider });
            return res.status(400).json({ success: false, error: 'Missing bookName, authorName, or provider.' });
        }
        // *** CHANGE: Ensure model is provided, especially if frontend logic fails ***
        if (!model) {
             console.error('Error: Missing required field: model');
             return res.status(400).json({ success: false, error: 'Missing model selection.' });
        }
 
    // --- Construct the dynamic note about word count ---
    let noteText;
        const targetWordCount = parseInt(wordCount, 10);
 
        if (!isNaN(targetWordCount) && targetWordCount > 0) {
            noteText = `Remember it must be comprehensive in exactly ** ${targetWordCount} words**.`;
        } else {
            noteText = `Remember it must be comprehensive (default length up to 5000 words).`;
        }
        // --- End construct dynamic note ---
 
        const finalPrompt = basePromptTemplate
            .replace('${bookName}', bookName)
            .replace('${authorName}', authorName)
            .replace('${language}', language || 'English')
            .replace('${concisenessNote}', noteText);
 
        // --- Call the LLM Service ---
        console.log(`Calling LLM Service via /generate endpoint for ${provider}...`);
        const llmMarkdownOutput = await generateMindmapContent(
            provider,
            model,
            finalPrompt
            // No options passed here, so llmService will use config defaults
        );
        // --- End LLM Service Call ---

        if (!llmMarkdownOutput || llmMarkdownOutput.trim() === '') {
            console.error('Error: LLM Service returned empty content.');
            throw new Error('LLM Service returned empty content.');
        }

        // --- Process and Save LLM Output ---
        // (This processing logic remains the same as before)
        const trimmedOutput = llmMarkdownOutput.trim();
        let fencedMarkdownContent;
        let plainMarkdownContent;
        const fenceStartPattern = /^```(?:markdown)?/i;
        const fenceEnd = '```';
        if (fenceStartPattern.test(trimmedOutput) && trimmedOutput.endsWith(fenceEnd)) {
            fencedMarkdownContent = llmMarkdownOutput;
            const firstNewlineIndex = fencedMarkdownContent.indexOf('\n');
            const lastFenceIndex = fencedMarkdownContent.lastIndexOf(fenceEnd);
            if (firstNewlineIndex !== -1 && lastFenceIndex > firstNewlineIndex) {
                 plainMarkdownContent = fencedMarkdownContent.substring(firstNewlineIndex + 1, lastFenceIndex).trim();
            } else {
                 plainMarkdownContent = trimmedOutput.replace(fenceStartPattern, '').replace(/```$/, '').trim();
                 console.warn("Could not precisely find content between fences, using basic extraction.");
            }
            console.log('LLM output correctly fenced. Extracted plain content.');
        } else {
            console.warn(`WARN: LLM output did not strictly start/end with markdown fences. Using raw output and adding fences.`);
            plainMarkdownContent = llmMarkdownOutput.trim(); // Use the trimmed output directly
            // Add fences manually
            fencedMarkdownContent = `\`\`\`markdown\n${plainMarkdownContent}\n\`\`\``;
        }
        // --- CHANGE: Use the /tmp directory for writable storage on App Engine ---
        const tempDir = '/tmp';
        const mindmapMdPath = path.join(tempDir, 'mindmap.md');
        const mindmapPlainMdPath = path.join(tempDir, 'mindmap-plain.md');
        const mindmapHtmlPath = path.join(tempDir, 'mindmap.html');
        fs.writeFileSync(mindmapMdPath, fencedMarkdownContent, 'utf8');
        console.log(`Saved fenced markdown to: ${mindmapMdPath}`);
        fs.writeFileSync(mindmapPlainMdPath, plainMarkdownContent, 'utf8');
        console.log(`Saved plain markdown to: ${mindmapPlainMdPath}`);
        // Inject YAML frontmatter into plain markdown
        try {
          const fileContent = fs.readFileSync(mindmapPlainMdPath, 'utf8');
          // Parse existing frontmatter if present
          let yamlObj = {};
          let body = fileContent;
          const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
          const fmMatch = fileContent.match(fmRegex);
          if (fmMatch) {
            try {
              yamlObj = yaml.load(fmMatch[1]) || {};
            } catch (parseErr) {
              console.error('Failed to parse existing YAML frontmatter:', parseErr);
            }
            body = fileContent.slice(fmMatch[0].length);
          }
          // Update title
          const firstLine = body.split(/\r?\n/)[0] || '';
          const titleMatch = firstLine.match(/^#\s*(.*)/);
          yamlObj.title = titleMatch ? titleMatch[1] : '';
          // Ensure markmap section exists
          if (typeof yamlObj.markmap !== 'object' || yamlObj.markmap === null) {
            yamlObj.markmap = {};
          }
          // Add default Markmap JSON options if none are present
          if (Object.keys(yamlObj.markmap).length === 0) {
            yamlObj.markmap = { colorFreezeLevel: 3, initialExpandLevel: 2 };
          }
          // Dump new YAML frontmatter
          const newYaml = yaml.dump(yamlObj);
          const updatedContent = `---\n${newYaml}---\n\n${body}`;
          fs.writeFileSync(mindmapPlainMdPath, updatedContent, 'utf8');
          console.log('Updated plain markdown with YAML frontmatter');
        } catch (err) {
          console.error('Error injecting YAML frontmatter into plain markdown:', err);
        }
        // --- End Process and Save ---

        await runConvertScript(mindmapMdPath, mindmapHtmlPath);
        console.log(`Generated mindmap HTML: ${mindmapHtmlPath}`);

        res.json({ success: true, message: `Mindmap for "${bookName}" generated successfully using ${provider} (${model || 'Default'})!` });

    } catch (err) {
        console.error('Error in /generate route:', err.stack || err);
        // Ensure a user-friendly error message is sent back
        const userErrorMessage = err.message.startsWith('API call to') || err.message.startsWith('Unsupported LLM provider') || err.message.startsWith('LLM Service returned')
            ? err.message
            : `Generation failed due to an internal server error. Check server logs.`;
        res.status(500).json({ success: false, error: userErrorMessage });
    }
});

// SAVE Edited Markdown from Editor (No changes needed here)
app.post('/save-md', async (req, res) => {
    try {
        const { mdContent } = req.body;
        if (mdContent === undefined || mdContent === null) {
            return res.status(400).json({ success: false, error: 'No mdContent provided' });
        }
        console.log("Received plain markdown content from editor for saving.");
        // Ensure content is trimmed before adding fences
        const trimmedMdContent = mdContent.trim();
        const mdWithFences = "```markdown\n" + trimmedMdContent + "\n```";
        // --- CHANGE: Use the /tmp directory for writable storage on App Engine ---
        const tempDir = '/tmp';
        const mindmapMdPath = path.join(tempDir, 'mindmap.md');
        const mindmapPlainMdPath = path.join(tempDir, 'mindmap-plain.md');
        const mindmapHtmlPath = path.join(tempDir, 'mindmap.html');
        // Save the trimmed plain content
        fs.writeFileSync(mindmapPlainMdPath, trimmedMdContent, 'utf8');
        console.log(`Saved plain markdown to: ${mindmapPlainMdPath}`);
        // Inject YAML frontmatter into plain markdown
        try {
          const fileContent = fs.readFileSync(mindmapPlainMdPath, 'utf8');
          // Parse existing frontmatter if present
          let yamlObj = {};
          let body = fileContent;
          const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
          const fmMatch = fileContent.match(fmRegex);
          if (fmMatch) {
            try {
              yamlObj = yaml.load(fmMatch[1]) || {};
            } catch (parseErr) {
              console.error('Failed to parse existing YAML frontmatter:', parseErr);
            }
            body = fileContent.slice(fmMatch[0].length);
          }
          // Update title
          const firstLine = body.split(/\r?\n/)[0] || '';
          const titleMatch = firstLine.match(/^#\s*(.*)/);
          yamlObj.title = titleMatch ? titleMatch[1] : '';
          // Ensure markmap section exists
          if (typeof yamlObj.markmap !== 'object' || yamlObj.markmap === null) {
            yamlObj.markmap = {};
          }
          // Add default Markmap JSON options if none are present
          if (Object.keys(yamlObj.markmap).length === 0) {
            yamlObj.markmap = { colorFreezeLevel: 2, initialExpandLevel: 2 };
          }
          // Dump new YAML frontmatter
          const newYaml = yaml.dump(yamlObj);
          const updatedContent = `---\n${newYaml}---\n\n${body}`;
          fs.writeFileSync(mindmapPlainMdPath, updatedContent, 'utf8');
          console.log('Updated plain markdown with YAML frontmatter');
        } catch (err) {
          console.error('Error injecting YAML frontmatter into plain markdown:', err);
        }
        // Save the fenced content
        fs.writeFileSync(mindmapMdPath, mdWithFences, 'utf8');
        console.log(`Saved fenced markdown to: ${mindmapMdPath}`);

        // Enqueue background conversion (do not await)
        try {
            enqueueConversion(mindmapMdPath, mindmapHtmlPath);
            console.log(`Enqueued conversion job for: ${mindmapHtmlPath}`);
        } catch (err) {
            console.error('Failed to enqueue conversion job:', err);
            // Fallback to synchronous conversion if enqueue fails
            try {
                await runConvertScript(mindmapMdPath, mindmapHtmlPath);
                console.log(`Regenerated mindmap HTML (fallback): ${mindmapHtmlPath}`);
            } catch (convErr) {
                console.error('Fallback synchronous conversion also failed:', convErr);
            }
        }
        res.json({ success: true, message: 'Markdown saved and conversion queued!' });
    } catch (err) {
        console.error('Error in /save-md:', err.stack || err);
        res.status(500).json({ success: false, error: `Save failed: ${err.message}` });
    }
});

// SERVE the generated mindmap.html (No changes needed here)
app.get('/mindmap.html', (req, res) => {
    const mindmapPath = path.join('/tmp', 'mindmap.html');
    fs.access(mindmapPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.error(`Mindmap file not found or not readable: ${mindmapPath}`);
            // If the file doesn't exist, send a placeholder HTML.
            try {
                const md = new MarkdownIt();
                const readmePath = path.join(__dirname, 'README.md');
                const readmeContent = fs.readFileSync(readmePath, 'utf8');
                const htmlContent = md.render(readmeContent);

                const placeholderHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Mindmap Instructions</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#fff;}
      .mindmap-placeholder{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
      .placeholder-card{max-width:720px;width:100%;text-align:left;background:rgba(255,255,255,0.94);border-radius:12px;padding:20px 28px;box-shadow:0 12px 30px rgba(2,6,23,0.06);border:1px solid rgba(2,6,23,0.04);}
      .placeholder-card h1{margin:0 0 8px;font-size:1.25rem;color:#0f172a;font-weight:600;}
      .placeholder-card p{margin:0;color:#475569;font-size:0.95rem;}
      .placeholder-card ul { padding-left: 20px; }
      .placeholder-card li { margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="mindmap-placeholder">
        <div class="placeholder-card">
            ${htmlContent}
        </div>
    </div>
</body>
</html>`;
                res.status(404).send(placeholderHtml);
            } catch (readmeErr) {
                console.error(`Failed to read and render README.md: ${readmeErr}`);
                res.status(500).send('<h1>Error</h1><p>Could not load instructions.</p>');
            }
        } else {
            console.log(`Serving mindmap file: ${mindmapPath}`);
            // Set headers to prevent caching
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            // Send the file from the /tmp directory
            res.sendFile(mindmapPath);
        }
    });
});

// SERVE the plain markdown content for the editor (No changes needed here)
app.get('/mindmap-plain.md', (req, res) => {
     // --- CHANGE: Use the /tmp directory for writable storage on App Engine ---
     const plainMdPath = path.join('/tmp', 'mindmap-plain.md');
     fs.access(plainMdPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.warn(`Plain mindmap file not found: ${plainMdPath}. Sending empty.`);
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.status(404).send(''); // Send empty string with 404 if not found
        } else {
            console.log(`Serving plain markdown file: ${plainMdPath}`);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.sendFile(plainMdPath);
        }
    });
});


// --- Helper Function --- (No changes needed here)
function runConvertScript(inputFile, outputFile) {
    // Resolve the paths as passed (they are expected to be absolute or relative paths)
    const absoluteInput = path.resolve(inputFile);
    const absoluteOutput = path.resolve(outputFile);
    const convertModulePath = path.resolve(__dirname, 'convert.js');

    return new Promise((resolve, reject) => {
        // Attempt in-process conversion first for performance (avoids spawn overhead).
        try {
            if (fs.existsSync(convertModulePath)) {
                try {
                    // Clear require cache in development so convert.js updates are picked up only when explicitly requested.
                    if (process.env.NODE_ENV === 'development' || process.env.FORCE_RELOAD_CONVERT === '1') {
                        try { delete require.cache[require.resolve(convertModulePath)]; } catch (e) { /* ignore */ }
                    }
                    const convertModule = require(convertModulePath);
                    if (convertModule && typeof convertModule.convertMarkdownFileToHtml === 'function') {
                        console.log('Running convert.js in-process via convertMarkdownFileToHtml...');
                        // Call the exported async function and handle its promise
                        convertModule.convertMarkdownFileToHtml(absoluteInput, absoluteOutput)
                          .then(() => {
                            console.log('convert.js in-process finished successfully.');
                            return resolve();
                          })
                          .catch((err) => {
                            console.error('convert.js in-process failed:', err);
                            // Fall through to spawn fallback
                            spawnFallback();
                          });
                        return;
                    } else {
                        console.warn('convert.js did not export convertMarkdownFileToHtml. Falling back to spawning a node process.');
                    }
                } catch (err) {
                    console.warn('In-process convert attempt threw an error, will fall back to spawn:', err && err.message ? err.message : err);
                }
            } else {
                console.warn(`convert.js not found at ${convertModulePath}. Will try spawning node process as fallback.`);
            }
        } catch (err) {
            console.warn('Unexpected error checking convert module, will attempt spawn fallback:', err && err.message ? err.message : err);
        }

        // Spawn fallback (keeps original behavior if in-process fails)
        function spawnFallback() {
            if (!fs.existsSync(convertModulePath)) {
                const errorMsg = `Convert script not found at ${convertModulePath}`;
                console.error(errorMsg);
                return reject(new Error(errorMsg));
            }
            console.log(`Spawning convert.js as child process: node "${path.basename(convertModulePath)}" "${absoluteInput}" "${absoluteOutput}"`);
            const child = spawn('node', [convertModulePath, absoluteInput, absoluteOutput], {
                stdio: 'inherit',
                cwd: __dirname,
                shell: false
            });
            child.on('error', (error) => {
                console.error('Failed to start convert.js process:', error);
                reject(new Error(`Failed to start convert.js: ${error.message}`));
            });
            child.on('close', (code) => {
                if (code === 0) {
                    console.log('convert.js finished successfully (spawn fallback).');
                    resolve();
                } else {
                    console.error(`convert.js exited with code ${code}`);
                    reject(new Error(`convert.js process failed with code ${code}`));
                }
            });
        }

        // If we reach here (no in-process run), call spawnFallback
        spawnFallback();
    });
}

// --- Start Server ---
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Webapp server listening on port ${PORT}`);
        console.log(`Access the app at http://localhost:${PORT}`);
        // Final check to confirm which keys were loaded
        console.log("--- API Key Status ---");
        secretKeys.forEach(key => {
            if (process.env[key]) {
                console.log(`- ${key}: Loaded`);
            } else {
                console.warn(`- ${key}: NOT FOUND. Calls to this provider will fail.`);
            }
        });
        console.log("----------------------");
    });
}

// --- Execute Start ---
startServer().catch(error => {
    console.error("FATAL: Failed to start server.", error);
    process.exit(1);
});