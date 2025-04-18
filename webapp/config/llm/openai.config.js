// webapp/config/llm/openai.config.js
// Now load .env from the parent directory (webapp)
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const openAIConfig = {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: null, // Uses the default OpenAI base URL
    defaultModel: 'gpt-4o-mini', // Or 'gpt-4o', 'gpt-3.5-turbo' etc.
    defaultParams: {
        max_tokens: 8000,
        temperature: 0.7,
        // Add other default parameters if needed
    },
    apiType: 'openai', // Standard OpenAI API
};

if (!openAIConfig.apiKey) {
    console.warn("WARN: OPENAI_API_KEY not found in environment variables. OpenAI calls will fail.");
}

module.exports = openAIConfig;