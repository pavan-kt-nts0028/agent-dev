import { config } from "../config/index.js";
import { badRequest } from "../lib/errors.js";

/**
 * Where a session's model requests are sent.
 *
 * "copilot" is the SDK's own routing: no provider block at all, so the runtime
 * uses the GitHub Copilot API on the logged-in seat. Everything else is BYOK —
 * the runtime talks to an OpenAI-compatible endpoint directly.
 *
 * Each provider owns its default model, because a model id is only meaningful
 * to the service serving it: "claude-sonnet-4.5" means nothing to Ollama, and
 * "mistral:latest" means nothing to Copilot. A single global default model
 * cannot be correct for both.
 */
const PROVIDERS = {
    ollama: {
        defaultModel: () => config.providers.ollama.defaultModel,
        sessionConfig: () => ({
            provider: {
                type: "openai",
                // Only affects telemetry labelling; the wire format is OpenAI's.
                modelProvider: "ollama",
                baseUrl: config.providers.ollama.baseUrl,
            },
        }),
    },

    copilot: {
        defaultModel: () => config.providers.copilot.defaultModel,
        // No provider block: this is what makes the session use the Copilot API.
        sessionConfig: () => ({}),
    },
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS);

/**
 * Resolve a provider name and an optional model into everything a session
 * needs: the model to run, and the SessionConfig fragment that routes it.
 */
export function resolveProvider(name, model) {
    const provider = PROVIDERS[name];
    if (!provider) {
        throw badRequest("unknown_model_provider", `Unknown model_provider "${name}"`, {
            available: PROVIDER_NAMES,
        });
    }

    return {
        name,
        model: model ?? provider.defaultModel(),
        sessionConfig: provider.sessionConfig(),
    };
}
