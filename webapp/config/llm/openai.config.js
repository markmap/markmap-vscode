// webapp/config/llm/openai.config.js
// Load .env from the parent directory (webapp)
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const openAIConfig = {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: null, // Uses the default OpenAI base URL
    // --- CHANGE HERE: Updated the default model name ---
    defaultModel: 'gpt-4.1-mini', // Was 'gpt-4o-mini'
    // --------------------------------------------------
    defaultParams: {
        max_tokens: 4096,
        temperature: 0.7,
        // Add other default parameters if needed
    },
    apiType: 'openai', // Standard OpenAI API
};

if (!openAIConfig.apiKey) {
    console.warn("WARN: OPENAI_API_KEY not found in environment variables. OpenAI calls will fail.");
}

module.exports = openAIConfig;