/**
 * chain.js [Modified: Now deepseek-to-mindmap.js, uses llmService]
 *
 * 1) Call LLM (specified provider, default DeepSeek) for a completion via llmService
 * 2) Extract the code snippet from the triple-backtick block (if needed)
 * 3) Save that snippet to mindmap.md
 * 4) Convert snippet -> HTML mindmap (via convert.js)
 */

const fs = require("fs");
const path = require('path');
const { spawn } = require("child_process");
const { generateMindmapContent } = require("./services/llmService.js"); // Import the new service
const { extractSnippet } = require("./snippet-extractor.js"); // Keep snippet extractor if needed

// --- Configuration ---
const PROVIDER = 'DeepSeek'; // Or change to 'OpenAI' or eventually 'Gemini'
const MODEL = null; // Use the default model from the config, or specify e.g., 'deepseek-chat'
const OUTPUT_MD_PATH = "mindmap.md";
const OUTPUT_HTML_PATH = "mindmap.html";

const prompt = `
I want a comprehensive and visually intriguing summary of "Mindset: The New Psychology of Success" book by "Carol Dweck". It must be in a complex multi layered markdown format for maximising readability and memory boost. This markdown is going to be used in "https://markmap.js.org/" to be converted to a visually appealing mindmap. It must incorporate relevant visual elements and different structures such as tables, multi branch, emojies and icons, etc. when is contributing to the readability.

The summary must be very comprehensive and quoting the important parts to reinforce why they are important. there must be a good balance between visual and text.

Imagine, you don't have enough time to read the book fully, but you want to read this mind map and learn as much as possible just like someone who read the whole book, but in a shorter time.

Here is an example of the markdown formats used in the "markmap" website. You can get inspired from it and go beyond it using your creativity. Please note that the ultimate goal is to make this summary in a way that trigger visual memory and help reader to memorise it better:
--------------------
---
title: markmap
markmap:
  colorFreezeLevel: 2
---

## Links

- [Website](https://markmap.js.org/)
- [GitHub](https://github.com/gera2ld/markmap)

## Related Projects

- [coc-markmap](https://github.com/gera2ld/coc-markmap) for Neovim
- [markmap-vscode](https://marketplace.visualstudio.com/items?itemName=gera2ld.markmap-vscode) for VSCode
- [eaf-markmap](https://github.com/emacs-eaf/eaf-markmap) for Emacs

## Features

Note that if blocks and lists appear at the same level, the lists will be ignored.

### Lists

- **strong** ~~del~~ *italic* ==highlight==
-\`inline code\`
- [x] checkbox
- Katex: $x = {-b \\pm \\sqrt{b^2-4ac} \\over 2a}$ - [More Katex Examples](#?d=gist:af76a4c245b302206b16aec503dbe07b:katex.md)
- Now we can wrap very very very very long text based on \`maxWidth\` option
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
--------------------


###Considerations:
- Avoid specifying the output with "\`\`\`markdown...\`\`\`". Only provide the final markdown.
- Avoid using mermaid flowchart or code snippet.
- Your final output must only include the markdown content without any complementary conversations.
- Please note it is absolutely fine if your output is lengthy as some books need more comprehensive details! Your summary could be up to 5000 words length!
- Remember, reader may not have any background about the book, so add concise descriptions when is necessary to enhance their understanding.
- Avoid using ">" in your markdown formatting such as:
"""## 🔥 **Famous Quotes to Remember**
> *"Success is getting what you want. Happiness is wanting what you get."*
> *"The person who seeks revenge should dig two graves."*
"""
`;

async function main() {
    try {
        // 1) Prompt the LLM using the service
        console.log(`Calling LLM Service (${PROVIDER})...`);
        const fullMarkdownOutput = await generateMindmapContent(
            PROVIDER,
            MODEL, // Pass null to use default, or specify a model name
            prompt,
            {
                // Optional: override default params from config if needed for this specific script
                // max_tokens: 7000,
            }
        );

        console.log("Full LLM Output received."); // Avoid printing the full potentially large output unless debugging

        // 2) Extract the snippet inside ```...``` (Optional - depends if your prompt forces this structure)
        // If your prompt now directly asks for ONLY the markdown content without fences,
        // you might not need extraction anymore. The current prompt asks for only MD,
        // so we might be able to skip extraction.
        // Let's assume for now the LLM might still add fences sometimes.
        // const snippet = extractSnippet(fullMarkdownOutput); // Use if fences might be present
        // if (snippet === null) {
        //     console.warn("No triple-backtick block found. Using full output.");
        //     snippet = fullMarkdownOutput; // Fallback to full output
        // }

        // Assuming the prompt 'Only provide the final markdown' works, use the direct output
        const snippet = fullMarkdownOutput.trim(); // Use the direct output, trimmed

        if (!snippet) {
            console.error("LLM returned empty content after trimming. Exiting.");
            return;
        }

        console.log("\nUsing final markdown content (first 100 chars):", snippet.substring(0, 100) + "...");

        // 3) Save snippet to a local .md file:
        fs.writeFileSync(OUTPUT_MD_PATH, snippet, "utf8");
        console.log(`Saved markdown to: ${OUTPUT_MD_PATH}`);

        // 4) Convert snippet -> HTML
        await runConvertScript(OUTPUT_MD_PATH, OUTPUT_HTML_PATH);
        console.log(`HTML mindmap created: ${OUTPUT_HTML_PATH}`);

    } catch (err) {
        console.error(`Error in ${PROVIDER} to Mindmap script:`, err.message);
        // console.error(err.stack); // Uncomment for more details
        process.exit(1);
    }
}

function runConvertScript(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        const convertScriptPath = path.resolve(__dirname, 'convert.js');
        const inputFilePath = path.resolve(__dirname, inputFile);
        const outputFilePath = path.resolve(__dirname, outputFile);

        if (!fs.existsSync(convertScriptPath)) {
            return reject(new Error(`Convert script not found at ${convertScriptPath}`));
        }

        console.log(`Running convert script: node "${path.basename(convertScriptPath)}" "${inputFile}" "${outputFile}"`);

        const child = spawn("node", [convertScriptPath, inputFilePath, outputFilePath], {
            stdio: "inherit", // Show output from convert.js
            cwd: __dirname,   // Ensure it runs in the correct directory
        });

        child.on("error", (error) => {
            console.error('Failed to start convert.js process:', error);
            reject(new Error(`Failed to start convert.js: ${error.message}`));
        });

        child.on("close", (code) => {
            if (code === 0) {
                console.log('convert.js finished successfully.');
                resolve();
            } else {
                console.error(`convert.js exited with code ${code}`);
                reject(new Error(`convert.js exited with code ${code}`));
            }
        });
    });
}

// Entry point:
main();