// extractMarkdown.js

function extractMarkdownBlock(rawText) {
    const lines = rawText.split(/\r?\n/);
  
    let isCapturing = false;
    let captured = [];
    let foundFence = false;
  
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
  
      // 1) Detect the start fence:
      //    e.g. "```markdown" or "```markdown something"
      if (!isCapturing && trimmed.startsWith('```markdown')) {
        isCapturing = true;  // begin capturing
        foundFence = true;   // we found a markdown fence
        continue;
      }
  
      // 2) If we are capturing, check for the closing fence EXACTly "```"
      if (isCapturing) {
        if (trimmed === '```') {
          // We found the closing fence.
          // End capturing.
          isCapturing = false;
          // We can break if we only want the first block
          // Or keep going if you want to find multiple blocks
          break;
        } else {
          // 3) Append line to captured block
          captured.push(line);
        }
      }
    }
  
    // If we never found a start fence or never captured anything, return null
    if (!foundFence || captured.length === 0) {
      return null;
    }
  
    // Otherwise, return the joined lines as the final Markdown text
    return captured.join('\n');
  }
  
  module.exports = extractMarkdownBlock;
  