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
app.use(express.static('public')); // Serve static files

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

        // Strict Check for ```markdown (same as before)
        const trimmedOutput = llmMarkdownOutput.trim();
        if (!trimmedOutput.startsWith('```markdown') || !trimmedOutput.endsWith('```')) {
             console.warn('WARN: LLM output did not strictly start with ```markdown and end with ```. Attempting to extract.');
             const startIndex = trimmedOutput.indexOf('```markdown');
             const endIndex = trimmedOutput.lastIndexOf('```');
             if (startIndex !== -1 && endIndex > startIndex) {
                 fs.writeFileSync('mindmap.md', trimmedOutput.substring(startIndex, endIndex + 3), 'utf8');
                 fs.writeFileSync('mindmap-plain.md', trimmedOutput.substring(startIndex, endIndex + 3), 'utf8'); // Save extracted
                 console.log('Saved extracted content to mindmap.md');
             } else {
                 console.error('Error: Failed to extract markdown block from LLM output. Saving raw output for debugging.');
                 fs.writeFileSync('mindmap.md', llmMarkdownOutput, 'utf8'); // Save raw for debugging
                 fs.writeFileSync('mindmap-plain.md', llmMarkdownOutput, 'utf8');
                 throw new Error('LLM output format incorrect. Could not extract markdown block.');
             }
        } else {
            fs.writeFileSync('mindmap.md', llmMarkdownOutput, 'utf8');
            console.log('Saved the raw LLM output to mindmap.md');
            fs.writeFileSync('mindmap-plain.md', llmMarkdownOutput, 'utf8');
        }
        // End Strict Check

        await runConvertScript('mindmap.md', 'mindmap.html');
        console.log('Created mindmap.html');

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

// Route for saving editor content (no changes needed here)
app.post('/save-md', async (req, res) => {
    try {
        const { mdContent } = req.body;
        if (mdContent === undefined || mdContent === null) {
            return res.status(400).json({ success: false, error: 'No mdContent provided' });
        }
        fs.writeFileSync('mindmap.md', mdContent, 'utf8');
        await runConvertScript('mindmap.md', 'mindmap.html');
        res.json({ success: true, message: 'mindmap.md saved and mindmap.html regenerated!' });
    } catch (err) {
        console.error('Error in /save-md:', err.stack || err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Define helper functions (like runConvertScript) - no changes needed here
function runConvertScript(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        const convertScriptPath = require.resolve('./convert.js');
        console.log(`Running convert script: node ${convertScriptPath} ${inputFile} ${outputFile}`);
        const child = spawn('node', [convertScriptPath, inputFile, outputFile], {
            stdio: 'inherit',
            cwd: process.cwd(),
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
         console.warn('WARN: OPENAI_API_KEY environment variable is not set. OpenAI requests will fail.');
    }
});