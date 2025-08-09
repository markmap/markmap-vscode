// webapp/services/secretService.js
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

/**
 * Fetches the latest enabled version of a secret from Google Cloud Secret Manager.
 * @param {string} secretName The name of the secret to fetch (e.g., "OPENAI_API_KEY").
 * @returns {Promise<string|null>} The secret value as a string, or null if an error occurs.
 */
async function getSecret(secretName) {
    // Only attempt to fetch secrets if running in a GCP environment
    if (!process.env.GCP_PROJECT) {
        // console.log(`Secret Service: Not a GCP environment (GCP_PROJECT not set). Skipping fetch for '${secretName}'.`);
        return null;
    }

    if (!secretName) {
        console.error("Secret Service: secretName parameter is missing.");
        return null;
    }

    const client = new SecretManagerServiceClient();
    const projectId = process.env.GCP_PROJECT;

    try {
        const fullName = `projects/${projectId}/secrets/${secretName}/versions/latest`;
        // console.log(`Secret Service: Attempting to access secret: ${fullName}`);

        const [version] = await client.accessSecretVersion({
            name: fullName,
        });

        const payload = version.payload.data.toString('utf8');
        // console.log(`Secret Service: Successfully fetched secret: ${secretName}`);
        return payload;
    } catch (error) {
        // Log a more specific error if the secret is not found vs. other permission errors
        if (error.code === 5) { // 5 = NOT_FOUND
            console.warn(`Secret Service: Secret '${secretName}' not found in project '${projectId}'. Ensure it exists and the service account has 'Secret Manager Secret Accessor' role.`);
        } else if (error.code === 7) { // 7 = PERMISSION_DENIED
            console.error(`Secret Service: Permission denied for secret '${secretName}' in project '${projectId}'. Ensure the service account has the 'Secret Manager Secret Accessor' role.`);
        } else {
            console.error(`Secret Service: Failed to access secret '${secretName}'. Code: ${error.code}, Message: ${error.message}`);
        }
        return null;
    }
}

/**
 * Loads multiple secrets from Secret Manager and sets them as environment variables.
 * This function will NOT overwrite existing environment variables.
 * @param {string[]} secretKeys - An array of secret names to fetch (e.g., ['OPENAI_API_KEY', 'GEMINI_API_KEY']).
 */
async function loadSecretsIntoEnv(secretKeys) {
    console.log("Secret Service: Starting to load secrets into environment...");
    for (const key of secretKeys) {
        // If the variable is already set in the environment (e.g., from a local .env file), skip fetching it.
        if (process.env[key]) {
            console.log(`Secret Service: Environment variable '${key}' already set. Skipping fetch from Secret Manager.`);
            continue;
        }

        const value = await getSecret(key);
        if (value) {
            process.env[key] = value;
            console.log(`Secret Service: Environment variable '${key}' loaded from Secret Manager.`);
        } else {
            console.warn(`Secret Service: Could not fetch secret for '${key}'. The application may not function correctly if this key is required.`);
        }
    }
    console.log("Secret Service: Finished loading secrets.");
}

module.exports = { loadSecretsIntoEnv };