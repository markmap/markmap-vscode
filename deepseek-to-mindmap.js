/**
 * chain.js
 *
 * 1) Call LLM (DeepSeek) for a completion
 * 2) Extract the code snippet from the triple-backtick block
 * 3) Save that snippet to mindmap.md
 * 4) Convert snippet -> HTML mindmap (via convert.js)
 */

import fs from "fs";
import { spawn } from "child_process";
import OpenAI from "openai";
import { extractSnippet } from "./snippet-extractor.js";  // from step 2

// Initialize the client
const openai = new OpenAI({
  baseURL: "https://api.deepseek.com", // or your base endpoint
  apiKey: "sk-eddc594f086142c59e4a306b7160b287",
});

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
- Katex: $x = {-b \pm \sqrt{b^2-4ac} \over 2a}$ <!-- markmap: fold -->
  - [More Katex Examples](#?d=gist:af76a4c245b302206b16aec503dbe07b:katex.md)
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
  // 1) Prompt the LLM
  const completion = await openai.chat.completions.create({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
    model: "deepseek-chat",
    max_tokens: 8000,
  });

  const fullMarkdownOutput = completion.choices[0].message.content;
  console.log("Full LLM Output:\n", fullMarkdownOutput);

//   // 2) Extract the snippet inside ```...```
//   const snippet = extractSnippet(fullMarkdownOutput);

//   if (!snippet) {
//     console.error("No triple-backtick code block found. Exiting.");
//     return;
//   }
  const snippet = fullMarkdownOutput;

  console.log("\nExtracted snippet:\n", snippet);

  // 3) Save snippet to a local .md file:
  const mdPath = "mindmap.md";
  fs.writeFileSync(mdPath, snippet, "utf8");
  console.log(`Saved snippet to: ${mdPath}`);

  // 4) Convert snippet -> HTML
  const htmlPath = "mindmap.html";
  await runConvertScript(mdPath, htmlPath);
  console.log(`HTML mindmap created: ${htmlPath}`);
}

function runConvertScript(inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["convert.js", inputFile, outputFile], {
      stdio: "inherit",
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`convert.js exited with code ${code}`));
    });
  });
}

// Entry point:
main().catch((err) => {
  console.error("Error in chain script:", err);
  process.exit(1);
});
