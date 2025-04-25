// webapp/config/llm/google.config.js
// Load .env from the parent directory (webapp)
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const googleConfig = {
    // Use the specific API key name from your .env file
    apiKey: process.env.GEMINI_API_KEY,

    // Use the OpenAI compatibility endpoint provided
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",

    // Set a default model from the ones you want to add
    defaultModel: 'gemini-2.5-flash-preview-04-17',

    // Define available models (used for reference, UI controls selection)
    availableModels: [
        "gemini-2.5-pro-exp-03-25",
        "gemini-2.5-flash-preview-04-17"
        // You can add other Gemini models compatible with this endpoint here later
    ],

    // Default parameters (adjust as needed, check Gemini API compatibility)
    defaultParams: {
        // Note: Max tokens might be handled differently or implicitly by Gemini endpoint.
        // Test if you need to set it explicitly or if it causes errors.
        // max_tokens: 8000, // Example: May not be needed or supported via this endpoint
        temperature: 0.7,
    },

    // Indicate that we'll use the OpenAI SDK structure for this provider
    apiType: 'openai_compatible',
};

if (!googleConfig.apiKey) {
    console.warn("WARN: GEMINI_API_KEY not found in environment variables. Google provider calls will fail.");
}

module.exports = googleConfig;