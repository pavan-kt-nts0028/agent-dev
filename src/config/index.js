import path from "node:path";
import "dotenv/config";

const num = (value, fallback) => {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Expected a number, got "${value}"`);
    return parsed;
};

const oneOf = (value, allowed, fallback) => {
    if (value === undefined || value === "") return fallback;
    if (!allowed.includes(value)) {
        throw new Error(`Expected one of ${allowed.join(", ")}, got "${value}"`);
    }
    return value;
};

const env = process.env;

export const config = {
    port: num(env.PORT, 3000),
    host: env.HOST ?? "127.0.0.1",

    logLevel: oneOf(env.LOG_LEVEL, ["error", "warn", "info", "debug"], "info"),
    logFormat: oneOf(env.LOG_FORMAT, ["json", "pretty"], "pretty"),

    /** JSON file mapping workspace name -> absolute path. Loaded once at boot. */
    workspacesFile: path.resolve(env.WORKSPACES_FILE ?? "config/workspaces.json"),

    /** Provider used when a request omits "model_provider". */
    defaultProvider: oneOf(env.AGENT_DEFAULT_PROVIDER, ["ollama", "copilot"], "ollama"),

    /**
     * Per-provider defaults. A model id only means something to the service
     * serving it, so each provider carries its own fallback model.
     */
    providers: {
        ollama: {
            baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
            defaultModel: env.OLLAMA_DEFAULT_MODEL ?? "mistral:latest",
        },
        copilot: {
            defaultModel: env.COPILOT_DEFAULT_MODEL ?? "claude-sonnet-4.5",
        },
    },

    copilot: {
        /** "none" | "error" | "warning" | "info" | "debug" | "all" */
        logLevel: oneOf(
            env.COPILOT_LOG_LEVEL,
            ["none", "error", "warning", "info", "debug", "all"],
            "error",
        ),
        /** Overrides ~/.copilot for session state. Optional. */
        baseDirectory: env.COPILOT_HOME || undefined,
        /** Passed through to the runtime when set; otherwise the logged-in user is used. */
        gitHubToken: env.COPILOT_GITHUB_TOKEN || undefined,
    },

    session: {
        /** How long a single /agent turn may run before the HTTP request gives up. */
        turnTimeoutMs: num(env.AGENT_TURN_TIMEOUT_MS, 10 * 60 * 1000),
        /** Idle sessions are disconnected after this; their transcripts stay resumable on disk. */
        idleTimeoutMs: num(env.AGENT_SESSION_IDLE_TIMEOUT_MS, 30 * 60 * 1000),
        /** Hard cap on sessions held in memory at once. */
        maxLive: num(env.AGENT_MAX_LIVE_SESSIONS, 50),
        /** "auto" approves everything; "readonly" rejects shell and file writes. */
        permissionMode: oneOf(env.AGENT_PERMISSION_MODE, ["auto", "readonly"], "auto"),
    },
};
