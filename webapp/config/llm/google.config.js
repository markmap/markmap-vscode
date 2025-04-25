// webapp/config/llm/google.config.js
// *** CHANGE: Renamed file from gemini.config.js to google.config.js for consistency ***
// Load .env from the parent directory (webapp)
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const googleConfig = {
    // *** CHANGE: Ensure this reads your specific key name from .env ***
    apiKey: process.env.GEMINI_API_KEY,

    // *** CHANGE: Use the OpenAI compatibility endpoint provided by Google ***
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",

    // *** CHANGE: Set a default model from your desired list ***
    defaultModel: 'gemini-2.5-flash-preview-04-17',

    // *** CHANGE: Define the specific models you want to use ***
    availableModels: [
        "gemini-2.5-flash-preview-04-17", // Flash model
        "gemini-2.5-pro-exp-03-25"      // Pro experimental model
        // Add other Gemini models compatible with this endpoint if needed later
    ],

    // *** CHANGE: Adjust default params - max_tokens might not be supported/needed via this endpoint ***
    defaultParams: {
        // Note: max_tokens might be ignored or cause errors via the OpenAI compatibility layer.
        // Test carefully. It's often omitted when calling Gemini directly.
        // max_tokens: 8192, // Example: Commented out for initial setup
        temperature: 0.7, // Temperature is usually supported
    },

    // *** CHANGE: Indicate use of OpenAI SDK structure ***
    apiType: 'openai_compatible',
};

// *** CHANGE: Update warning check for the correct environment variable ***
if (!googleConfig.apiKey) {
    console.warn("WARN: GEMINI_API_KEY not found in environment variables. Google provider calls will fail.");
}

module.exports = googleConfig;