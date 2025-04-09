// FILE: webapp/server.js
// webapp/server.js

// 1. Require necessary modules FIRST
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path'); // <-- Add path module
const { spawn } = require('child_process');
const OpenAI = require('openai');
// Best practice: Load environment variables (especially for API keys)
require('dotenv').config(); // Make sure to install dotenv: npm install dotenv

// --- Load Prompt Template from File ---
const promptFilePath = path.join(__dirname, 'mindmap_prompt.txt');
let basePromptTemplate;
try {
    basePromptTemplate = fs.readFileSync(promptFilePath, 'utf8');
    console.log(`Prompt template loaded successfully from ${promptFilePath}`);
} catch (err) {
    console.error(`FATAL ERROR: Could not read prompt template file at ${promptFilePath}.`, err);
    console.error("Please ensure 'mindmap_prompt.txt' exists in the 'webapp' directory.");
    process.exit(1); // Exit if the template can't be loaded
}
// --- End Load Prompt Template ---

// 2. Setup LLM Clients
// DeepSeek Client (using the OpenAI library structure but configured for DeepSeek)
const deepseekClient = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-eddc594f086142c59e4a306b7160b287', // Use env var or fallback
});

// OpenAI Client (uses default base URL and expects OPENAI_API_KEY environment variable)
const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Explicitly use env var
});


// 3. Create the Express app instance NEXT
const app = express(); // <--- DEFINE APP HERE

// 4. Apply middleware AFTER creating app
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files FROM public directory

// 5. Define the prompt template variable is now loaded from file above (Step 1 section)

// 6. Define your routes AFTER creating app and applying middleware
app.post('/generate', async (req, res) => {
    try {
        const { bookName, authorName, provider, model } = req.body;
        console.log(`Received request: Book="${bookName}", Author="${authorName}", Provider="${provider}", Model="${model}"`);

        if (!bookName || !authorName || !provider || !model) {
            console.error('Error: Missing required fields in request body:', req.body);
            return res.status(400).json({ success: false, error: 'Missing bookName, authorName, provider, or model in request.' });
        }

        // Use the template loaded from the file
        const finalPrompt = basePromptTemplate
            .replace('${bookName}', bookName)
            .replace('${authorName}', authorName);

        let completion;
        let client;
        let systemMessage = 'You are a helpful assistant specializing in creating detailed book summary mindmaps in Markdown format.'; // Default system message

        // Select the appropriate client and model based on provider
        if (provider === 'DeepSeek') {
            client = deepseekClient;
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

        console.log(`Using provider: ${provider}, model: ${model}`);

        // Make the API call
        completion = await client.chat.completions.create({
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: finalPrompt }, // Pass the dynamically generated prompt
            ],
            model: model,
            max_tokens: 8000,
            temperature: 0.7,
        });

        const llmMarkdownOutput = completion.choices[0].message.content;

        if (!llmMarkdownOutput || llmMarkdownOutput.trim() === '') {
            console.error('Error: LLM returned empty content.');
            throw new Error('LLM returned empty content.');
        }

        // Strict Check for ```markdown
        const trimmedOutput = llmMarkdownOutput.trim();
        let finalMarkdownContent; // Content to save and convert

        if (!trimmedOutput.startsWith('```markdown') || !trimmedOutput.endsWith('```')) {
             console.warn('WARN: LLM output did not strictly start with ```markdown and end with ```. Attempting to extract.');
             const startIndex = trimmedOutput.indexOf('```markdown');
             const endIndex = trimmedOutput.lastIndexOf('```');

             if (startIndex !== -1 && endIndex > startIndex) {
                 // Extracted successfully
                 finalMarkdownContent = trimmedOutput.substring(startIndex, endIndex + 3); // Include fences for convert.js
                 const plainContent = trimmedOutput.substring(startIndex + '```markdown'.length, endIndex).trim(); // Exclude fences for plain file
                 fs.writeFileSync('mindmap.md', finalMarkdownContent, 'utf8');
                 fs.writeFileSync('mindmap-plain.md', plainContent, 'utf8'); // Save extracted plain content
                 console.log('Saved extracted content to mindmap.md and mindmap-plain.md');
             } else {
                 // Extraction failed, save raw for debugging but warn user
                 console.error('Error: Failed to extract markdown block from LLM output. Saving raw output for debugging.');
                 finalMarkdownContent = llmMarkdownOutput; // Use raw output for conversion attempt
                 fs.writeFileSync('mindmap.md', llmMarkdownOutput, 'utf8'); // Save raw for debugging
                 fs.writeFileSync('mindmap-plain.md', llmMarkdownOutput, 'utf8'); // Save raw plain for debugging
                 // Don't throw error here, let conversion attempt fail if needed
             }
        } else {
             // Format is correct
             finalMarkdownContent = llmMarkdownOutput; // Include fences for convert.js
             const plainContent = trimmedOutput.substring('```markdown'.length, trimmedOutput.length - '```'.length).trim(); // Exclude fences for plain file
             fs.writeFileSync('mindmap.md', finalMarkdownContent, 'utf8');
             fs.writeFileSync('mindmap-plain.md', plainContent, 'utf8'); // Save plain content
             console.log('Saved correctly formatted LLM output to mindmap.md and mindmap-plain.md');
        }
        // End Strict Check

        await runConvertScript('mindmap.md', 'mindmap.html');
        console.log('Created/Updated mindmap.html in webapp/');

        res.json({ success: true, message: `Mindmap for "${bookName}" generated successfully using ${provider} (${model})!` });

    } catch (err) {
        console.error('Error in /generate route:', err.stack || err); // Log stack trace
        let errorMessage = err.message;
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

app.post('/save-md', async (req, res) => {
    try {
        const { mdContent } = req.body; // This is the PLAIN markdown from the editor
        if (mdContent === undefined || mdContent === null) {
            return res.status(400).json({ success: false, error: 'No mdContent provided' });
        }

        // Re-add fences for mindmap.md and conversion
        const mdWithFences = "```markdown\n" + mdContent + "\n```";

        fs.writeFileSync('mindmap.md', mdWithFences, 'utf8'); // Save with fences for convert.js
        fs.writeFileSync('mindmap-plain.md', mdContent, 'utf8'); // Save plain content from editor

        await runConvertScript('mindmap.md', 'mindmap.html');
        console.log('Regenerated mindmap.html in webapp/ from editor content');

        res.json({ success: true, message: 'mindmap.md saved and mindmap.html regenerated!' });
    } catch (err) {
        console.error('Error in /save-md:', err.stack || err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- *** NEW ROUTE HANDLER for mindmap.html *** ---
app.get('/mindmap.html', (req, res) => {
    const mindmapPath = path.join(__dirname, 'mindmap.html'); // Path relative to server.js
    fs.access(mindmapPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.error(`Mindmap file not found or not readable: ${mindmapPath}`, err);
            // Send a simple placeholder HTML
             res.status(404).send('<!DOCTYPE html><html><head><title>Mindmap Not Found</title><style>body{font-family:sans-serif;padding:20px;color:#555;}</style></head><body><h1>Mindmap Not Generated Yet</h1><p>Please use the form to generate a mindmap first.</p></body></html>');
        } else {
            console.log(`Serving mindmap file: ${mindmapPath}`);
            // Set headers to prevent caching, ensuring the iframe gets the latest version
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(mindmapPath);
        }
    });
});
// --- *** END NEW ROUTE HANDLER *** ---


// 7. Define helper functions (like runConvertScript)
function runConvertScript(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        // Ensure convert.js path is resolved correctly from server.js location
        const convertScriptPath = path.resolve(__dirname, 'convert.js');
        const inputFilePath = path.resolve(__dirname, inputFile); // Ensure absolute paths for spawn
        const outputFilePath = path.resolve(__dirname, outputFile); // Ensure absolute paths for spawn

        // Check if convert.js exists before attempting to run
        if (!fs.existsSync(convertScriptPath)) {
            const errorMsg = `Convert script not found at ${convertScriptPath}`;
            console.error(errorMsg);
            return reject(new Error(errorMsg));
        }
         if (!fs.existsSync(inputFilePath)) {
            const errorMsg = `Input markdown file not found at ${inputFilePath}`;
            console.error(errorMsg);
            // Don't reject here, let convert.js handle missing input if preferred, or reject:
            // return reject(new Error(errorMsg));
        }

        console.log(`Running convert script: node "${convertScriptPath}" "${inputFilePath}" "${outputFilePath}"`);

        const child = spawn('node', [convertScriptPath, inputFilePath, outputFilePath], {
            stdio: 'inherit', // Show convert.js output in server console
            cwd: __dirname, // Run from the webapp directory explicitly
            shell: false // Better not to use shell unless necessary
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

// 8. Start the server LAST (no changes needed here)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webapp server listening on port ${PORT}`);
    console.log(`Access the app at http://localhost:${PORT}`);
    if (!process.env.DEEPSEEK_API_KEY && deepseekClient.apiKey === 'sk-eddc594f086142c59e4a306b7160b287') {
         console.warn('WARN: Using hardcoded DeepSeek API key. Set DEEPSEEK_API_KEY environment variable for security.');
    }
    if (!process.env.OPENAI_API_KEY) {
         console.warn('WARN: OPENAI_API_KEY environment variable is not set. OpenAI requests will fail unless the key is provided elsewhere.');
    }
});