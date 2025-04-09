// webapp/server.js

// 1. Require necessary modules FIRST
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { spawn } = require('child_process');
const OpenAI = require('openai');
// Remove: const extractMarkdown = require('./extractmarkdown'); // Make sure this is gone

// 2. Setup OpenAI client
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: 'sk-eddc594f086142c59e4a306b7160b287', // Replace with your actual key or env variable
});

// 3. Create the Express app instance NEXT
const app = express(); // <--- DEFINE APP HERE

// 4. Apply middleware AFTER creating app
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files

// 5. Define the prompt template (can be here or later, but before the route uses it)
const basePromptTemplate = `
**CRITICAL OUTPUT REQUIREMENT: Your response MUST start *exactly* with \`\`\`markdown and end *exactly* with \`\`\`. Absolutely NO text, sentences, greetings, comments, or explanations should precede the initial \`\`\`markdown or follow the final \`\`\`. Your *entire* output must be ONLY the markdown code block.**

I want a comprehensive and visually intriguing summary of "\${bookName}" book by "\${authorName}". It must be in a complex multi-layered markdown format specifically designed for maximum readability and memory boost. It must incorporate relevant visual elements and diverse structures such as tables, multi-branch lists, emojis, and icons, wherever they contribute significantly to readability and recall.

The summary must be very comprehensive, quoting important parts directly to reinforce why they are significant. Maintain a good balance between visual elements and textual explanations.

Imagine the reader has limited time and cannot read the full book. This summary should allow them to learn as much as possible, achieving a similar level of understanding as someone who read the entire book, but in a condensed format.

Get inspired by markdown formats like those used on the "markmap" website (example below), but feel free to be creative and go beyond it. The ultimate goal is a summary that triggers visual memory and aids memorization.

---
title: markmap Example (Inspiration Only)
markmap:
  colorFreezeLevel: 2
---

## Links

- [Website](https://markmap.js.org/)
- [GitHub](https://github.com/gera2ld/markmap)

## Related Projects

- [coc-markmap](https://github.com/gera2ld/coc-markmap)
- [markmap-vscode](...)
- [eaf-markmap](...)

## Features

### Lists

- **strong** ~~del~~ *italic* ==highlight==
-\`inline code\`
- [x] checkbox
- Katex: $x = {-b \pm \sqrt{b^2-4ac} \over 2a}$ - [More Katex Examples](...)
- Long text wrapping...
- Ordered list
  1. item 1
  2. item 2

### Blocks

\`\`\`js
console.log('hello, JavaScript')
\`\`\`

| Products | Price |
|-|-|
| Apple | 4 |
| Banana | 2 |

![](https://markmap.js.org/favicon.png)
---

### Important Considerations & Rules:

1.  **Strict Output Formatting:**
    * Your response MUST begin *precisely* with \`\`\`markdown.
    * Your response MUST end *precisely* with \`\`\`.
    * There must be ABSOLUTELY NO text, phrases (like 'Certainly!', 'Here is...', 'Okay,' etc.), or any other characters before the starting \`\`\`markdown.
    * There must be ABSOLUTELY NO text or any other characters after the closing \`\`\`.
    * The *only* content in your response must be the markdown summary itself, enclosed within the markdown fences.
2.  **Content & Style:**
    * Avoid using mermaid flowchart syntax or general code snippets (like the JS example above, unless quoting code *from the book*). Markdown tables and formatted text are fine.
    * Do not use the markdown blockquote symbol ">" for quotes. Integrate quotes naturally into the text or use formatting like italics/boldness.
    * The summary needs to be comprehensive. Length is perfectly fine (up to ~5000 words if necessary for the book).
    * Assume the reader may have no prior knowledge of the book; include concise descriptions where needed.

**Final Output Structure Reminder:** Your final, complete output must strictly follow this structure, containing *only* the markdown content within the fences:

\`\`\`markdown
<Your detailed, visually rich markdown summary content goes here>
\`\`\`

**Confirm Adherence:** Before generating, double-check that you will strictly adhere to the output format requirement: start *only* with \`\`\`markdown, end *only* with \`\`\`, and include absolutely no other text outside these fences.
`;

// 6. Define your routes AFTER creating app and applying middleware
app.post('/generate', async (req, res) => { // <--- Now 'app' is defined
  // ... rest of your /generate route code from the previous correct example ...
  try {
    const { bookName, authorName } = req.body;
    console.log(`Received request for Book: "${bookName}", Author: "${authorName}"`); // Correct logging

    if (!bookName || !authorName) {
        console.error('Error: Missing bookName or authorName in request body:', req.body);
        return res.status(400).json({ success: false, error: 'Missing bookName or authorName in request.' });
    }

    const finalPrompt = basePromptTemplate
        .replace('${bookName}', bookName)
        .replace('${authorName}', authorName);

    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant specializing in creating detailed book summary mindmaps in Markdown format.' },
        { role: 'user', content: finalPrompt },
      ],
      model: 'deepseek-chat',
      max_tokens: 8000,
      temperature: 0.7,
    });

    const llmMarkdownOutput = completion.choices[0].message.content;

    if (!llmMarkdownOutput || llmMarkdownOutput.trim() === '') {
        console.error('Error: LLM returned empty content.');
        throw new Error('LLM returned empty content.');
    }

    fs.writeFileSync('mindmap.md', llmMarkdownOutput, 'utf8'); // Use direct output
    console.log('Saved the raw LLM output to mindmap.md');
    fs.writeFileSync('mindmap-plain.md', llmMarkdownOutput, 'utf8');

    await runConvertScript('mindmap.md', 'mindmap.html');
    console.log('Created mindmap.html');

    res.json({ success: true, message: `Mindmap for "${bookName}" generated successfully!` });

  } catch (err) {
    console.error('Error in /generate route:', err.stack || err); // Log stack trace
    const errorMessage = err.response ? JSON.stringify(err.response.data) : err.message;
    res.status(500).json({ success: false, error: `Generation failed: ${errorMessage}` });
  }
});

app.post('/save-md', async (req, res) => {
   // ... your /save-md route code ...
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

// 7. Define helper functions (like runConvertScript)
function runConvertScript(inputFile, outputFile) {
  // ... your runConvertScript function code ...
   return new Promise((resolve, reject) => {
    const convertScriptPath = require.resolve('./convert.js');
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
          resolve();
      } else {
          console.error(`convert.js exited with code ${code}`);
          reject(new Error(`convert.js process failed with code ${code}`));
      }
    });
  });
}

// 8. Start the server LAST
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webapp server listening on port ${PORT}`);
  console.log(`Access the app at http://localhost:${PORT}`);
});