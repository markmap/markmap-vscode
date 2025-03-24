// snippet-extractor.js

/**
 * Extract just the content from within triple backticks in a markdown string.
 * Returns null if nothing is found.
 */
export function extractSnippet(mdOutput) {
    // This regex will capture everything inside ```...```
    // including newlines, ignoring the optional language name (e.g. "markdown")
    const pattern = /```(?:[a-zA-Z]+)?\n([\s\S]*?)```/;
    const match = mdOutput.match(pattern);
    if (match) {
      return match[1];
    }
    // If there's no match, you can decide to return the original text or null
    return null;
  }
  