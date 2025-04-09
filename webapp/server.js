// FILE: webapp/server.js
// (Keep existing requires and setup for express, bodyParser, fs, path, spawn, OpenAI, dotenv)
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const OpenAI = require('openai');
require('dotenv').config();

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

// --- LLM Clients ---
const deepseekClient = new OpenAI({
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', // Allow overriding base URL
    apiKey: process.env.DEEPSEEK_API_KEY,
});

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Serve static files FROM the 'public' directory within 'webapp'
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---

// GENERATE Mindmap from LLM
app.post('/generate', async (req, res) => {
    try {
        // Extract new parameters: conciseness and wordCount
        const { bookName, authorName, provider, model, conciseness, wordCount } = req.body;
        console.log(`Received generate request: Book="${bookName}", Author="${authorName}", Provider="${provider}", Model="${model}", Conciseness="${conciseness}", WordCount="${wordCount || 'Default'}"`);

        if (!bookName || !authorName || !provider || !model) {
            console.error('Error: Missing required fields:', req.body);
            return res.status(400).json({ success: false, error: 'Missing bookName, authorName, provider, or model.' });
        }

        // --- Construct the dynamic conciseness note ---
        let concisenessLevel = conciseness || 'concise'; // Default to concise if not provided
        let noteText;
        const targetWordCount = parseInt(wordCount, 10);

        if (!isNaN(targetWordCount) && targetWordCount > 0) {
            // User specified a word count
            noteText = `Remember it must be ${concisenessLevel} in ${targetWordCount} words.`;
        } else {
            // User did not specify a word count, use default
            noteText = `Remember it must be ${concisenessLevel} up to 5000 words.`;
        }
        // --- End construct dynamic note ---

        // Replace placeholders in the prompt template
        const finalPrompt = basePromptTemplate
            .replace('${bookName}', bookName)
            .replace('${authorName}', authorName)
            .replace('${concisenessNote}', noteText); // Insert the dynamic note

        let client;
        let systemMessage = 'You are a helpful assistant specializing in creating detailed book summary mindmaps in Markdown format, strictly adhering to the output format requirements.';

        if (provider === 'DeepSeek') {
            client = deepseekClient;
             if (!process.env.DEEPSEEK_API_KEY) {
                console.error('Error: DEEPSEEK_API_KEY environment variable is not set.');
                return res.status(500).json({ success: false, error: 'DeepSeek API key is not configured on the server.' });
            }
        } else if (provider === 'OpenAI') {
            client = openaiClient;
            if (!process.env.OPENAI_API_KEY) {
                console.error('Error: OPENAI_API_KEY environment variable is not set.');
                return res.status(500).json({ success: false, error: 'OpenAI API key is not configured on the server.' });
            }
        } else {
            console.error(`Error: Unsupported provider "${provider}"`);
            return res.status(400).json({ success: false, error: `Unsupported LLM provider: ${provider}` });
        }

        console.log(`Calling ${provider} model: ${model}`);
        const completion = await client.chat.completions.create({
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: finalPrompt },
            ],
            model: model,
            max_tokens: 8000, // Adjust as needed
            temperature: 0.7, // Adjust creativity
        });

        const llmMarkdownOutput = completion.choices[0].message.content;

        if (!llmMarkdownOutput || llmMarkdownOutput.trim() === '') {
            console.error('Error: LLM returned empty content.');
            throw new Error('LLM returned empty content.');
        }

        // --- Process and Save LLM Output ---
        const trimmedOutput = llmMarkdownOutput.trim();
        let fencedMarkdownContent; // Content including fences for conversion
        let plainMarkdownContent;  // Content without fences for editor

        const fenceStart = '```markdown'; // More flexible start check
        const fenceEnd = '```';

        if (trimmedOutput.startsWith(fenceStart) && trimmedOutput.endsWith(fenceEnd)) {
             // Output is correctly fenced
            fencedMarkdownContent = llmMarkdownOutput; // Keep original spacing if needed
            // Extract plain content: find first newline after ```markdown, take content until last ```
            const firstNewlineIndex = fencedMarkdownContent.indexOf('\n');
            const lastFenceIndex = fencedMarkdownContent.lastIndexOf(fenceEnd);
            if (firstNewlineIndex !== -1 && lastFenceIndex > firstNewlineIndex) {
                 plainMarkdownContent = fencedMarkdownContent.substring(firstNewlineIndex + 1, lastFenceIndex).trim();
            } else {
                // Fallback if structure is slightly off but fences are there
                 plainMarkdownContent = trimmedOutput.substring(fenceStart.length, trimmedOutput.length - fenceEnd.length).trim();
                 console.warn("Could not precisely find content between fences, using basic extraction.");
            }
            console.log('LLM output correctly fenced. Extracted plain content.');

        } else {
            console.warn('WARN: LLM output did not strictly start/end with ```markdown ... ```. Saving raw output as plain, conversion might fail.');
            // Treat the whole output as plain, add fences manually for conversion attempt
            plainMarkdownContent = llmMarkdownOutput; // Save raw for editor
            fencedMarkdownContent = `${fenceStart}\n${llmMarkdownOutput}\n${fenceEnd}`; // Add fences for convert.js
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

        res.json({ success: true, message: `Mindmap for "${bookName}" generated successfully using ${provider} (${model})!` });

    } catch (err) {
        console.error('Error in /generate route:', err.stack || err);
        let errorMessage = err.message;
        // Add more specific error handling if needed (e.g., API key errors)
        if (err.response && err.response.data) {
            errorMessage = JSON.stringify(err.response.data);
        } else if (err.status === 401) {
             errorMessage = "Authentication error. Check API Key.";
        } else if (err.status === 429) {
             errorMessage = "Rate limit exceeded or quota reached.";
        }
        res.status(500).json({ success: false, error: `Generation failed: ${errorMessage}` });
    }
});

// SAVE Edited Markdown from Editor
app.post('/save-md', async (req, res) => {
    try {
        const { mdContent } = req.body; // This is the PLAIN markdown from the editor
        if (mdContent === undefined || mdContent === null) {
            return res.status(400).json({ success: false, error: 'No mdContent provided' });
        }

        console.log("Received plain markdown content from editor for saving.");

        // Re-add fences for mindmap.md and conversion
        const mdWithFences = "```markdown\n" + mdContent.trim() + "\n```"; // Trim just in case

        const mindmapMdPath = path.join(__dirname, 'mindmap.md');
        const mindmapPlainMdPath = path.join(__dirname, 'mindmap-plain.md');
        const mindmapHtmlPath = path.join(__dirname, 'mindmap.html');

        // Save the plain content received from the editor
        fs.writeFileSync(mindmapPlainMdPath, mdContent, 'utf8');
        console.log(`Saved plain markdown to: ${mindmapPlainMdPath}`);

        // Save the content with fences added for conversion
        fs.writeFileSync(mindmapMdPath, mdWithFences, 'utf8');
        console.log(`Saved fenced markdown to: ${mindmapMdPath}`);


        // Regenerate the HTML from the fenced version
        await runConvertScript('mindmap.md', 'mindmap.html');
        console.log(`Regenerated mindmap HTML: ${mindmapHtmlPath}`);

        res.json({ success: true, message: 'Markdown saved and mindmap.html regenerated!' });
    } catch (err) {
        console.error('Error in /save-md:', err.stack || err);
        res.status(500).json({ success: false, error: `Save failed: ${err.message}` });
    }
});

// SERVE the generated mindmap.html (with cache busting headers)
app.get('/mindmap.html', (req, res) => {
    const mindmapPath = path.join(__dirname, 'mindmap.html');
    fs.access(mindmapPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.error(`Mindmap file not found or not readable: ${mindmapPath}`);
            // Send a placeholder if not found
            res.status(404).send('<!DOCTYPE html><html><head><title>Mindmap Not Found</title><style>body{font-family:sans-serif;padding:20px;color:#555;}</style></head><body><h1>Mindmap Not Generated Yet</h1><p>Please use the form to generate a mindmap first, or check server logs.</p></body></html>');
        } else {
            console.log(`Serving mindmap file: ${mindmapPath}`);
            // Set headers to prevent caching
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(mindmapPath);
        }
    });
});

// SERVE the plain markdown content for the editor
app.get('/mindmap-plain.md', (req, res) => {
    const plainMdPath = path.join(__dirname, 'mindmap-plain.md');
     fs.access(plainMdPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.warn(`Plain mindmap file not found: ${plainMdPath}. Sending empty.`);
             // Send empty string or a default message if not found
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.status(404).send(''); // Send empty on failure
        } else {
            console.log(`Serving plain markdown file: ${plainMdPath}`);
             // Set headers to prevent caching
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8'); // Set correct content type
            res.sendFile(plainMdPath);
        }
    });
});


// --- Helper Function ---
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
        // Don't check input here, let convert.js handle it if needed

        console.log(`Running convert script: node "${path.basename(convertScriptPath)}" "${path.basename(inputFilePath)}" "${path.basename(outputFilePath)}"`);

        const child = spawn('node', [convertScriptPath, inputFilePath, outputFilePath], {
            stdio: 'inherit', // Show convert.js output
            cwd: __dirname,   // Explicitly set working directory
            shell: false
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
    // Add API key warnings if needed
     if (!process.env.DEEPSEEK_API_KEY) {
         console.warn('WARN: DEEPSEEK_API_KEY environment variable is not set. DeepSeek requests may fail.');
     }
     if (!process.env.OPENAI_API_KEY) {
         console.warn('WARN: OPENAI_API_KEY environment variable is not set. OpenAI requests will fail.');
     }
});