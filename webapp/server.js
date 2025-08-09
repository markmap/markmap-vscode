// FILE: webapp/server.js (MODIFIED to use internal services/config)
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load dotenv *ONCE* here at the main entry point for the webapp
// It will load the ./webapp/.env file
require('dotenv').config();

// --- Import the LLM Service ---
// Path is now relative to webapp/server.js
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
        const { bookName, authorName, provider, model, conciseness, wordCount } = req.body;
        console.log(`Received generate request: Book="${bookName}", Author="${authorName}", Provider="${provider}", Model="${model || 'Default'}", Conciseness="${conciseness}", WordCount="${wordCount || 'Default'}"`);

        if (!bookName || !authorName || !provider) {
            console.error('Error: Missing required fields:', { bookName, authorName, provider });
            return res.status(400).json({ success: false, error: 'Missing bookName, authorName, or provider.' });
        }
        // *** CHANGE: Ensure model is provided, especially if frontend logic fails ***
        if (!model) {
             console.error('Error: Missing required field: model');
             return res.status(400).json({ success: false, error: 'Missing model selection.' });
        }

        // --- Construct the dynamic conciseness note ---
        let concisenessLevel = conciseness || 'concise';
        let noteText;
        const targetWordCount = parseInt(wordCount, 10);

        if (!isNaN(targetWordCount) && targetWordCount > 0) {
            noteText = `Remember it must be ${concisenessLevel} in approximately ${targetWordCount} words.`;
        } else {
            noteText = `Remember it must be ${concisenessLevel} (default length up to 5000 words).`;
        }
        // --- End construct dynamic note ---

        const finalPrompt = basePromptTemplate
            .replace('${bookName}', bookName)
            .replace('${authorName}', authorName)
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
        const mindmapMdPath = path.join(__dirname, 'mindmap.md');
        const mindmapPlainMdPath = path.join(__dirname, 'mindmap-plain.md');
        const mindmapHtmlPath = path.join(__dirname, 'mindmap.html');
        fs.writeFileSync(mindmapMdPath, fencedMarkdownContent, 'utf8');
        console.log(`Saved fenced markdown to: ${mindmapMdPath}`);
        fs.writeFileSync(mindmapPlainMdPath, plainMarkdownContent, 'utf8');
        console.log(`Saved plain markdown to: ${mindmapPlainMdPath}`);
        // --- End Process and Save ---

        await runConvertScript('mindmap.md', 'mindmap.html');
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
        const mindmapMdPath = path.join(__dirname, 'mindmap.md');
        const mindmapPlainMdPath = path.join(__dirname, 'mindmap-plain.md');
        const mindmapHtmlPath = path.join(__dirname, 'mindmap.html');
        // Save the trimmed plain content
        fs.writeFileSync(mindmapPlainMdPath, trimmedMdContent, 'utf8');
        console.log(`Saved plain markdown to: ${mindmapPlainMdPath}`);
        // Save the fenced content
        fs.writeFileSync(mindmapMdPath, mdWithFences, 'utf8');
        console.log(`Saved fenced markdown to: ${mindmapMdPath}`);

        await runConvertScript('mindmap.md', 'mindmap.html');
        console.log(`Regenerated mindmap HTML: ${mindmapHtmlPath}`);
        res.json({ success: true, message: 'Markdown saved and mindmap.html regenerated!' });
    } catch (err) {
        console.error('Error in /save-md:', err.stack || err);
        res.status(500).json({ success: false, error: `Save failed: ${err.message}` });
    }
});

// SERVE the generated mindmap.html (No changes needed here)
app.get('/mindmap.html', (req, res) => {
    const mindmapPath = path.join(__dirname, 'mindmap.html');
    fs.access(mindmapPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.error(`Mindmap file not found or not readable: ${mindmapPath}`);
            res.status(404).send('<!DOCTYPE html><html><head><title>Mindmap Not Found</title><style>body{font-family:sans-serif;padding:20px;color:#555;}</style></head><body><h1>Mindmap Not Generated Yet</h1><p>Please use the form to generate a mindmap first, or check server logs.</p></body></html>');
        } else {
            console.log(`Serving mindmap file: ${mindmapPath}`);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(mindmapPath);
        }
    });
});

// SERVE the plain markdown content for the editor (No changes needed here)
app.get('/mindmap-plain.md', (req, res) => {
     const plainMdPath = path.join(__dirname, 'mindmap-plain.md');
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
    return new Promise((resolve, reject) => {
        const convertScriptPath = path.resolve(__dirname, 'convert.js');
        const inputFilePath = path.resolve(__dirname, inputFile);
        const outputFilePath = path.resolve(__dirname, outputFile);
        if (!fs.existsSync(convertScriptPath)) {
            const errorMsg = `Convert script not found at ${convertScriptPath}`;
            console.error(errorMsg);
            return reject(new Error(errorMsg));
        }
        console.log(`Running convert script: node "${path.basename(convertScriptPath)}" "${path.basename(inputFilePath)}" "${path.basename(outputFilePath)}"`);
        const child = spawn('node', [convertScriptPath, inputFilePath, outputFilePath], {
            stdio: 'inherit', // Show output/errors from convert.js
            cwd: __dirname,   // Ensure correct working directory
            shell: false      // Recommended for security and consistency
        });
        child.on('error', (error) => {
            console.error('Failed to start convert.js process:', error);
            reject(new Error(`Failed to start convert.js: ${error.message}`));
        });
        child.on('close', (code) => {
            if (code === 0) {
                console.log('convert.js finished successfully.');
                resolve();
            } else {
                console.error(`convert.js exited with code ${code}`);
                reject(new Error(`convert.js process failed with code ${code}`));
            }
        });
    });
}

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webapp server listening on port ${PORT}`);
    console.log(`Access the app at http://localhost:${PORT}`);
    // Initial check/warning based on loaded config (process.env is available now)
    if (!process.env.DEEPSEEK_API_KEY) {
       console.warn('WARN: DEEPSEEK_API_KEY environment variable is not set. DeepSeek requests will fail.');
    }
    if (!process.env.OPENAI_API_KEY) {
       console.warn('WARN: OPENAI_API_KEY environment variable is not set. OpenAI requests will fail.');
    }
    // *** CHANGE: Add Gemini/Google warning ***
    if (!process.env.GEMINI_API_KEY) {
       console.warn('WARN: GEMINI_API_KEY environment variable is not set. Google provider requests will fail.');
    }
});