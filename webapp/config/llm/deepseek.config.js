// webapp/config/llm/deepseek.config.js
// Now load .env from the parent directory (webapp)
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const deepSeekConfig = {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat', // Or 'deepseek-reasoner' etc.
    defaultParams: {
        max_tokens: 8000,
        temperature: 0.7,
        // Add other default parameters if needed
    },
    apiType: 'openai_compatible', // Indicates it uses OpenAI SDK structure
};

if (!deepSeekConfig.apiKey) {
    console.warn("WARN: DEEPSEEK_API_KEY not found in environment variables. DeepSeek calls will fail.");
}

module.exports = deepSeekConfig;