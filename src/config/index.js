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

/** Comma-separated env list; "none" yields an empty list. */
const list = (value, fallback) => {
    if (value === undefined || value === "") return fallback;
    if (value.trim() === "none") return [];
    return value.split(",").map((item) => item.trim()).filter(Boolean);
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

    /** LLM-generated conversation titles for new sessions. */
    titles: {
        enabled: (env.AGENT_TITLE_LLM ?? "true") !== "false",
        /** Defaults to the request's model; set to use a smaller, faster one. */
        model: env.AGENT_TITLE_MODEL || undefined,
        timeoutMs: num(env.AGENT_TITLE_TIMEOUT_MS, 30 * 1000),
    },

    /** Per-turn trace files: one JSONL file per /agent call. */
    turnLog: {
        enabled: (env.AGENT_TURN_LOG ?? "true") !== "false",
        dir: path.resolve(env.AGENT_LOG_DIR ?? "logs"),
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

        /**
         * Built-in tools withheld from the agent. "none" exposes every tool.
         *
         * `task` is excluded by default. A sub-agent starts with no context, so
         * "verify what was built" sends it re-exploring the repository to report
         * what the parent already knew. Measured on a finished-and-pushed task:
         * 59% of all tool calls were sub-agent work, every one of it redundant,
         * and the only shell commands slow enough to detach into the background
         * came from sub-agents sweeping the tree with `find ... -exec grep`.
         */
        excludedTools: list(env.AGENT_EXCLUDED_TOOLS, ["task"]),

        /**
         * Append explicit stop conditions to the system prompt. An agent that
         * emits a completion summary *and* a tool call in the same response has
         * not ended its turn, because the loop only stops on a response carrying
         * no tool calls. Models cannot observe that about themselves.
         */
        completionRules: (env.AGENT_COMPLETION_RULES ?? "true") !== "false",

        /**
         * Grace period after the agent reports itself idle before the turn is
         * abandoned. A session stays busy while shells it launched are still
         * attached, so a `find` left crawling the tree can hold a finished turn
         * open indefinitely. Zero disables the guard.
         */
        idleGraceMs: num(env.AGENT_IDLE_GRACE_MS, 30 * 1000),

        /**
         * Report a turn as spinning when this long passes after its last file
         * write without another one. Diagnostic only; the turn is not stopped.
         */
        spinAfterMs: num(env.AGENT_SPIN_AFTER_MS, 5 * 60 * 1000),
    },
};
