// webapp/config/llm/gemini.config.js
// Now load .env from the parent directory (webapp)
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Placeholder for Gemini configuration
const geminiConfig = {
    apiKey: process.env.GEMINI_API_KEY,
    // Add necessary configurations here later
    defaultParams: {
        temperature: 0.7,
    },
    apiType: 'gemini', // Custom identifier for Gemini API
};

if (!geminiConfig.apiKey) {
    console.warn("WARN: GEMINI_API_KEY not found in environment variables. Gemini calls will fail when implemented.");
}

module.exports = geminiConfig;