// webapp/services/llmService.js
const OpenAI = require('openai');
// Paths are now relative to webapp/services/
const deepSeekConfig = require('../config/llm/deepseek.config');
const openAIConfig = require('../config/llm/openai.config');
// *** CHANGE: Require the renamed google config ***
const googleConfig = require('../config/llm/google.config'); // Changed from gemini.config.js

// --- Initialize Clients ---

let openAIClientInstance;
if (openAIConfig.apiKey) {
    openAIClientInstance = new OpenAI({
        apiKey: openAIConfig.apiKey,
        baseURL: openAIConfig.baseURL, // Use baseURL from config (null for default OpenAI)
    });
} else {
    console.warn("LLM Service: OpenAI client not initialized due to missing API key.");
}

let deepSeekClientInstance;
if (deepSeekConfig.apiKey) {
    deepSeekClientInstance = new OpenAI({
        apiKey: deepSeekConfig.apiKey,
        baseURL: deepSeekConfig.baseURL,
    });
} else {
    console.warn("LLM Service: DeepSeek client not initialized due to missing API key.");
}

// *** CHANGE: Initialize Google Client using OpenAI SDK structure ***
let googleClientInstance;
if (googleConfig.apiKey) {
    googleClientInstance = new OpenAI({
        apiKey: googleConfig.apiKey, // Uses GEMINI_API_KEY from .env via google.config.js
        baseURL: googleConfig.baseURL, // Uses the specific Google endpoint from google.config.js
    });
    console.log("LLM Service: Google client initialized using OpenAI compatibility layer.")
} else {
    console.warn("LLM Service: Google client not initialized due to missing GEMINI_API_KEY.");
}


// --- Service Function ---

/**
 * Generates content using the specified LLM provider and model.
 * @param {string} provider - The LLM provider ('OpenAI', 'DeepSeek', 'Google').
 * @param {string} model - The specific model name to use.
 * @param {string} prompt - The user prompt.
 * @param {object} [options={}] - Additional parameters to override defaults (e.g., max_tokens, temperature).
 * @returns {Promise<string>} - The generated content string.
 * @throws {Error} - If provider is unsupported, client is not initialized, or API call fails.
 */
async function generateMindmapContent(provider, model, prompt, options = {}) {
    console.log(`LLM Service: Request received for Provider=${provider}, Model=${model}`);

    let client;
    let config;
    // System message can remain generic or be slightly adapted
    let systemMessage = 'You are a helpful assistant specializing in creating detailed book summary mindmaps in Markdown format, strictly adhering to the output format requirements provided in the user prompt.';

    switch (provider) {
        case 'OpenAI':
            if (!openAIClientInstance) throw new Error("OpenAI client is not initialized. Check OPENAI_API_KEY.");
            client = openAIClientInstance;
            config = openAIConfig;
            break;
        case 'DeepSeek':
            if (!deepSeekClientInstance) throw new Error("DeepSeek client is not initialized. Check DEEPSEEK_API_KEY.");
            client = deepSeekClientInstance;
            config = deepSeekConfig;
            break;
        // *** CHANGE: Add Google provider case ***
        case 'Google':
            if (!googleClientInstance) throw new Error("Google client is not initialized. Check GEMINI_API_KEY.");
            client = googleClientInstance;
            config = googleConfig; // Use the loaded googleConfig
            break;
        default:
            // *** CHANGE: This is where the original error likely came from ***
            throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    const finalModel = model || config.defaultModel;
    // Base parameters merged from config defaults and incoming options
    const finalParams = { ...config.defaultParams, ...options };

    console.log(`LLM Service: Calling ${provider} (${finalModel}) with base params:`, { max_tokens: finalParams.max_tokens, temperature: finalParams.temperature });

    // --- Prepare parameters specific to the API call ---
    // Start with only the model, as other params might be conditional
    const apiPayloadParams = {
        model: finalModel,
    };

    // --- Conditionally add TEMPERATURE ---
    // Check if it's the specific o4-mini model which restricts temperature (keep this logic)
    if (!(provider === 'OpenAI' && finalModel === 'o4-mini')) { // Assuming o4-mini is still relevant name
        if (finalParams.temperature !== undefined && finalParams.temperature !== null) {
            apiPayloadParams.temperature = finalParams.temperature;
        }
    } else {
        console.log(`LLM Service: Omitting 'temperature' parameter for o4-mini as only default is supported.`);
    }
    // --- End Temperature Handling ---


    // --- Conditionally add MAX_TOKENS or MAX_COMPLETION_TOKENS ---
    // Check if it's the specific o4-mini model which uses a different token parameter name (keep this logic)
    if (provider === 'OpenAI' && finalModel === 'o4-mini') {
        console.log(`LLM Service: Adjusting token param for o4-mini. Using 'max_completion_tokens'.`);
        if (finalParams.max_tokens !== undefined && finalParams.max_tokens !== null) {
            apiPayloadParams.max_completion_tokens = finalParams.max_tokens; // Use the correct parameter name
        }
    }
    // *** CHANGE: Handle max_tokens for Google provider carefully ***
    // Check if max_tokens is defined in finalParams AND if the provider isn't Google (as it might not be supported/needed)
    else if (provider !== 'Google' && finalParams.max_tokens !== undefined && finalParams.max_tokens !== null) {
         // For other models (DeepSeek, standard OpenAI), use max_tokens if available
         apiPayloadParams.max_tokens = finalParams.max_tokens;
    } else if (provider === 'Google') {
        // Optionally add max_tokens for Google if you confirm it works via the compatibility endpoint
        // if (finalParams.max_tokens !== undefined && finalParams.max_tokens !== null) {
        //    apiPayloadParams.max_tokens = finalParams.max_tokens;
        //    console.log(`LLM Service: Including 'max_tokens' for Google provider.`);
        // } else {
           console.log(`LLM Service: Not including 'max_tokens' parameter for Google provider (may be unsupported/implicit via compatibility endpoint).`);
        // }
    }
    // --- End Token Handling ---

    console.log(`LLM Service: Final API Payload Params:`, apiPayloadParams);


    try {
        // *** CHANGE: Use config.apiType check which now covers Google as 'openai_compatible' ***
        if (config.apiType === 'openai' || config.apiType === 'openai_compatible') {
            const completion = await client.chat.completions.create({
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: prompt },
                ],
                // Use the conditionally prepared payload
                ...apiPayloadParams
            });

            if (!completion.choices || completion.choices.length === 0 || !completion.choices[0].message || !completion.choices[0].message.content) {
                throw new Error(`${provider} API returned an unexpected response structure or empty content.`);
            }
            const content = completion.choices[0].message.content;
            console.log(`LLM Service: Received content from ${provider} (${finalModel}). Length: ${content.length}`);
            return content;

        }
        // Add else if block here for providers with different API call structures if needed later

    } catch (error) {
        // --- CHANGE: Update error logging for Google provider ---
        let errorMessage = error.message;
        let statusCode = error.status || 'N/A';

        if (error instanceof OpenAI.APIError) {
            statusCode = error.status;
            errorMessage = `Status ${error.status}: ${error.message}`;
            if (error.code) errorMessage += ` (Code: ${error.code})`;
            if (error.error?.message) errorMessage += ` | Details: ${error.error.message}`;
            if (error.error?.param) errorMessage += ` | Param: ${error.error.param}`;
            console.error(`LLM Service Error (APIError): Provider ${provider}, Status ${statusCode}, Code ${error.code}, Type: ${error.type}, Message: ${error.message}`);
        } else {
            console.error(`LLM Service Error (${provider} - ${finalModel}): Status ${statusCode}, Message: ${error.message}`);
            // Explicitly mention GEMINI_API_KEY for Google 401 errors
            if (statusCode === 401) errorMessage = `Authentication error (Provider: ${provider}). Check API Key (${provider === 'Google' ? 'GEMINI_API_KEY' : provider.toUpperCase() + '_API_KEY'}).`;
            else if (statusCode === 429) errorMessage = `Rate limit exceeded or quota reached (Provider: ${provider}).`;
            else if (statusCode === 400 && error.message.includes('model not found')) errorMessage = `Invalid or unavailable model selected for ${provider}: ${finalModel}`;
            // Add specific check for Google 400 if needed, e.g., unsupported features via compatibility layer
            else if (provider === 'Google' && statusCode === 400) errorMessage = `Bad request (Status 400, Provider: Google). Check parameters, model compatibility, or feature support via the OpenAI endpoint. Original: ${error.message}`;
            else if (statusCode === 400) errorMessage = `Bad request (Status 400, Provider: ${provider}). Check parameters or model compatibility. Original: ${error.message}`;
        }

        throw new Error(`API call to ${provider} failed: ${errorMessage}`);
    }
}

module.exports = {
    generateMindmapContent,
};