/**************************************************
 * server.js - Minimal Express server
 *************************************************/
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { spawn } = require('child_process');
const OpenAI = require('openai');
const extractMarkdown = require('./extractmarkdown');

// Adjust your DeepSeek base URL & API key
// (If needed, you can read them from environment variables or a secure place)
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: 'sk-eddc594f086142c59e4a306b7160b287', // example from your snippet
});

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files (index.html, main.js, etc.) from "public"
app.use(express.static('public'));

/**
 * Route: POST /generate
 * Receives a "prompt" from the request body,
 * calls the LLM, saves "mindmap.md", runs "convert.js",
 * and returns a success message.
 */
app.post('/generate', async (req, res) => {
  try {
    const userPrompt = req.body.prompt || 'No prompt provided';
    console.log('Received prompt:', userPrompt);

    // 1) Call the LLM with your custom userPrompt
    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: userPrompt },
      ],
      model: 'deepseek-reasoner',
      max_tokens: 8000,
      temperature: 1.2,
    });

    // 2) Extract the full Markdown from LLM response
    const fullOutput = completion.choices[0].message.content;
    fs.writeFileSync('mindmap-plain.md', fullOutput, 'utf8');
    const extractedMarkdown = extractMarkdown(fullOutput);

    if (!extractedMarkdown) {
      throw new Error('Failed to extract markdown from LLM response.');
    }
    

    // 3) Save snippet to mindmap.md
    fs.writeFileSync('mindmap.md', extractedMarkdown, 'utf8');
    console.log('Saved the snippet to mindmap.md');

    // 4) Convert snippet -> mindmap.html by calling: node convert.js mindmap.md mindmap.html
    await runConvertScript('mindmap.md', 'mindmap.html');
    console.log('Created mindmap.html');

    // Return a success response
    res.json({ success: true, message: 'Mindmap generated successfully!' });
  } catch (err) {
    console.error('Error in /generate route:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/**
 * Route: POST /save-md
 * Saves mindmap.md from user input, re-runs convert, returns success.
 */
app.post('/save-md', async (req, res) => {
    try {
      const { mdContent } = req.body;
      if (!mdContent) {
        return res.status(400).json({ success: false, error: 'No mdContent provided' });
      }
      fs.writeFileSync('mindmap.md', mdContent, 'utf8');
  
      // Re-run convert to update mindmap.html
      await runConvertScript('mindmap.md', 'mindmap.html');
  
      res.json({ success: true, message: 'mindmap.md saved and mindmap.html regenerated!' });
    } catch (err) {
      console.error('Error in /save-md:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  
/**
 * A small function to spawn "node convert.js"
 */
function runConvertScript(inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['convert.js', inputFile, outputFile], {
      stdio: 'inherit',
      cwd: process.cwd(), // run from the project root
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`convert.js exited with code ${code}`));
    });
  });
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webapp server listening on port ${PORT}`);
});

