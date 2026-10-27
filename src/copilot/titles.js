import { config } from "../config/index.js";
import { createLogger } from "../lib/logger.js";
import { getCopilotClient } from "./client.js";
import { resolveProvider } from "./providers.js";

const log = createLogger("copilot.titles");

const SYSTEM_MESSAGE =
    "You write short titles for chat conversations. Given the user's first message, " +
    "reply with a title of at most six words that says what the conversation is about. " +
    "Reply with the title alone: no quotes, no trailing punctuation, no preamble, no explanation.";

/** Trim a model's reply down to something usable as a title. */
function sanitize(raw) {
    if (!raw) return null;
    const firstLine = raw.split("\n").map((l) => l.trim()).find(Boolean);
    if (!firstLine) return null;

    const cleaned = firstLine
        .replace(/^["'`\s]+|["'`\s]+$/g, "")
        .replace(/[.!?,;:]+$/, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleaned) return null;
    const words = cleaned.split(" ").slice(0, 8).join(" ");
    return words.length > 70 ? words.slice(0, 70).trimEnd() : words;
}

/** Deterministic fallback used when the model is unavailable, slow, or unhelpful. */
export function fallbackTitle(query) {
    const words = (query ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "New Chat";
    const title = words.slice(0, 6).join(" ");
    return words.length > 6 ? `${title}…` : title;
}

/**
 * Ask the model for a conversation title.
 *
 * This runs in its own short-lived session rather than on the caller's: asking
 * the working session to name itself would put the request and its answer into
 * the transcript the agent then reasons over. The session is created with no
 * tools and a replaced system message, so the title call does not inherit the
 * agent's large system prompt — which both speeds it up and keeps small local
 * models from trying to answer the original question instead of naming it.
 *
 * Returns null on any failure; titles are cosmetic and must never fail a turn.
 */
export async function generateTitle({ providerName, model, query }) {
    if (!config.titles.enabled) return null;

    // Default to the model this session is already using. Falling back to the
    // provider's configured default instead would reach for a model the caller
    // never asked for, and may not even be installed.
    const provider = resolveProvider(providerName, config.titles.model || model);
    let session;
    const started = Date.now();

    try {
        session = await getCopilotClient().createSession({
            model: provider.model,
            ...provider.sessionConfig,
            availableTools: [],
            systemMessage: { mode: "replace", content: SYSTEM_MESSAGE },
            enableSessionTelemetry: false,
        });

        const message = await session.sendAndWait({ prompt: query }, config.titles.timeoutMs);
        const title = sanitize(message?.data?.content);

        log.debug("generated title", { title, ms: Date.now() - started, model: provider.model });
        return title;
    } catch (cause) {
        log.warn("title generation failed", {
            model: provider.model,
            ms: Date.now() - started,
            error: cause?.message ?? String(cause),
        });
        return null;
    } finally {
        // Titles are disposable; never let cleanup surface as a request error.
        await session?.disconnect().catch(() => {});
    }
}
