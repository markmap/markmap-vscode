// webapp/services/llmService.js
const OpenAI = require('openai');
// Paths are now relative to webapp/services/
const deepSeekConfig = require('../config/llm/deepseek.config');
const openAIConfig = require('../config/llm/openai.config');
const geminiConfig = require('../config/llm/gemini.config'); // Placeholder

// --- Initialize Clients ---

let openAIClientInstance;
if (openAIConfig.apiKey) {
    openAIClientInstance = new OpenAI({
        apiKey: openAIConfig.apiKey,
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

// Placeholder for Gemini Client Initialization
// ...

// --- Service Function ---

/**
 * Generates content using the specified LLM provider and model.
 * @param {string} provider - The LLM provider ('OpenAI', 'DeepSeek', 'Gemini').
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
    let systemMessage = 'You are a helpful assistant specializing in creating detailed book summary mindmaps in Markdown format, strictly adhering to the output format requirements.';

    switch (provider) {
        case 'OpenAI':
            if (!openAIClientInstance) throw new Error("OpenAI client is not initialized. Check API key.");
            client = openAIClientInstance;
            config = openAIConfig;
            break;
        case 'DeepSeek':
            if (!deepSeekClientInstance) throw new Error("DeepSeek client is not initialized. Check API key.");
            client = deepSeekClientInstance;
            config = deepSeekConfig;
            break;
        case 'Gemini':
             if (!geminiConfig.apiKey) throw new Error("Gemini client is not initialized. Check API key.");
             console.warn("Gemini API call is not fully implemented yet.");
             throw new Error("Gemini provider is not yet fully implemented in llmService.");
             // config = geminiConfig;
             // break;
        default:
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
    // Check if it's the specific o4-mini model which restricts temperature
    if (!(provider === 'OpenAI' && finalModel === 'o4-mini')) {
        // For all models *except* o4-mini, add temperature if it's defined
        if (finalParams.temperature !== undefined && finalParams.temperature !== null) {
             apiPayloadParams.temperature = finalParams.temperature;
        }
        // Otherwise, for o4-mini, we simply DO NOT add the temperature parameter, letting the API use its default (1).
    } else {
         console.log(`LLM Service: Omitting 'temperature' parameter for o4-mini as only default is supported.`);
    }
    // --- End Temperature Handling ---


    // --- Conditionally add MAX_TOKENS or MAX_COMPLETION_TOKENS ---
    // Check if it's the specific o4-mini model which uses a different token parameter name
    if (provider === 'OpenAI' && finalModel === 'o4-mini') {
        console.log(`LLM Service: Adjusting token param for o4-mini. Using 'max_completion_tokens'.`);
        // Check if a token limit was actually provided or defaulted
        if (finalParams.max_tokens !== undefined && finalParams.max_tokens !== null) {
             apiPayloadParams.max_completion_tokens = finalParams.max_tokens; // Use the correct parameter name
        }
        // DO NOT include max_tokens for this specific model
    } else {
         // For all other models, use max_tokens if available
         if (finalParams.max_tokens !== undefined && finalParams.max_tokens !== null) {
            apiPayloadParams.max_tokens = finalParams.max_tokens;
         }
    }
    // --- End Token Handling ---

    // Add any other non-conditional parameters from finalParams here if needed
    // Example: apiPayloadParams.top_p = finalParams.top_p; (if top_p was configured)


    console.log(`LLM Service: Final API Payload Params:`, apiPayloadParams);


    try {
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
        // Add else if block here for Gemini's specific API call structure when implemented

    } catch (error) {
        // (Error logging remains the same as previous version)
        let errorMessage = error.message;
        let statusCode = error.status || 'N/A';

        if (error instanceof OpenAI.APIError) {
            statusCode = error.status;
            errorMessage = `Status ${error.status}: ${error.message}`;
             if (error.code) errorMessage += ` (Code: ${error.code})`;
             if (error.error?.message) errorMessage += ` | Details: ${error.error.message}`;
             if (error.error?.param) errorMessage += ` | Param: ${error.error.param}`;
             console.error(`LLM Service Error (OpenAI APIError): Status ${statusCode}, Code ${error.code}, Type: ${error.type}, Message: ${error.message}`);
        } else {
             console.error(`LLM Service Error (${provider} - ${finalModel}): Status ${statusCode}, Message: ${error.message}`);
             if (statusCode === 401) errorMessage = "Authentication error. Check API Key.";
             else if (statusCode === 429) errorMessage = "Rate limit exceeded or quota reached.";
             else if (statusCode === 400 && error.message.includes('model not found')) errorMessage = `Invalid or unavailable model selected for ${provider}: ${finalModel}`;
             else if (statusCode === 400) errorMessage = `Bad request (Status 400). Check parameters or model compatibility. Original: ${error.message}`;
        }

        throw new Error(`API call to ${provider} failed: ${errorMessage}`);
    }
}

module.exports = {
    generateMindmapContent,
};