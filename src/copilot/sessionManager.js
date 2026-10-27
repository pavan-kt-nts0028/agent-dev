import { randomUUID } from "node:crypto";
import { config } from "../config/index.js";
import { createLogger } from "../lib/logger.js";
import {
    AppError,
    badGateway,
    conflict,
    gatewayTimeout,
    notFound,
    tooManyRequests,
} from "../lib/errors.js";
import { buildTools } from "../tools/index.js";
import { getCopilotClient } from "./client.js";
import { createPermissionHandler } from "./permissions.js";

const log = createLogger("copilot.sessions");

/**
 * Live sessions keyed by session id.
 *
 * A session is an expensive, stateful thing: it holds a transcript, a working
 * directory and a tool set. We keep it resident between requests so a follow-up
 * query is cheap, disconnect it once it goes idle, and resume it from disk if a
 * client comes back later with the same id.
 *
 * @type {Map<string, Entry>}
 */
const live = new Map();

/**
 * @typedef {object} Entry
 * @property {import("@github/copilot-sdk").CopilotSession} session
 * @property {string} workspace
 * @property {string} workspacePath
 * @property {string} provider    Provider name the session was created with.
 * @property {string} model
 * @property {number} createdAt
 * @property {number} lastUsedAt
 * @property {Promise<unknown>} lock     Tail of the per-session turn queue.
 * @property {NodeJS.Timeout} [idleTimer]
 */

/**
 * Get a session for this request, creating or resuming one as needed.
 * Returns the entry plus whether it was newly created, which the API reports
 * back so callers know when they received a fresh transcript.
 */
export async function acquireSession({ sessionId, workspace, workspacePath, provider }) {
    if (sessionId) {
        const existing = live.get(sessionId);
        if (existing) {
            assertWorkspaceMatches(existing, sessionId, workspace);
            assertProviderMatches(existing, sessionId, provider);
            await applyModel(existing, provider.model);
            return { entry: existing, created: false };
        }
        const entry = await resumeSession({ sessionId, workspace, workspacePath, provider });
        return { entry, created: false };
    }

    const entry = await createSession({ workspace, workspacePath, provider });
    return { entry, created: true };
}

async function createSession({ workspace, workspacePath, provider }) {
    evictIfAtCapacity();

    const client = getCopilotClient();
    const sessionId = randomUUID();

    let session;
    try {
        session = await client.createSession({
            sessionId,
            model: provider.model,
            ...provider.sessionConfig,
            workingDirectory: workspacePath,
            trustWorkingDirectory: "session",
            tools: buildTools(toolContext({ sessionId, workspace, workspacePath })),
            onPermissionRequest: createPermissionHandler({ sessionId, workspace }),
        });
    } catch (cause) {
        throw runtimeFailure("agent_session_failed", "Could not create a Copilot session", cause);
    }

    log.info("created session", {
        sessionId: session.sessionId,
        workspace,
        provider: provider.name,
        model: provider.model,
    });
    return track(session, { workspace, workspacePath, provider });
}

async function resumeSession({ sessionId, workspace, workspacePath, provider }) {
    const client = getCopilotClient();

    await assertResumableInWorkspace({ client, sessionId, workspace, workspacePath });
    evictIfAtCapacity();

    let session;
    try {
        // Provider config is not persisted with the transcript, so it has to be
        // supplied again here. Session metadata does not record which provider
        // built the transcript, so a cold resume adopts the requested one.
        session = await client.resumeSession(sessionId, {
            model: provider.model,
            ...provider.sessionConfig,
            tools: buildTools(toolContext({ sessionId, workspace, workspacePath })),
            onPermissionRequest: createPermissionHandler({ sessionId, workspace }),
        });
    } catch (cause) {
        throw notFound("session_not_found", `Session "${sessionId}" could not be resumed`, {
            reason: cause?.message ?? String(cause),
        });
    }

    log.info("resumed session", {
        sessionId,
        workspace,
        provider: provider.name,
        model: provider.model,
    });
    return track(session, { workspace, workspacePath, provider });
}

/**
 * Confirm the session exists on disk and was created in the workspace the
 * caller named. Without this a client could resume someone else's session into
 * the wrong tree — the runtime keeps the original working directory, so the
 * request would silently operate somewhere the caller did not ask for.
 */
async function assertResumableInWorkspace({ client, sessionId, workspace, workspacePath }) {
    let metadata;
    try {
        const sessions = await client.listSessions();
        metadata = sessions.find((candidate) => candidate.sessionId === sessionId);
    } catch (cause) {
        // Listing is an optimisation for a clear error message, not a gate.
        log.warn("could not list sessions before resume", { sessionId, error: String(cause) });
        return;
    }

    if (!metadata) {
        throw notFound("session_not_found", `No session with id "${sessionId}"`);
    }

    const cwd = metadata.context?.cwd;
    if (cwd && cwd !== workspacePath) {
        throw conflict(
            "session_workspace_mismatch",
            `Session "${sessionId}" belongs to a different workspace`,
            { requested: workspace, requestedPath: workspacePath, sessionPath: cwd },
        );
    }
}

function assertWorkspaceMatches(entry, sessionId, workspace) {
    if (entry.workspace === workspace) return;
    throw conflict(
        "session_workspace_mismatch",
        `Session "${sessionId}" belongs to workspace "${entry.workspace}"`,
        { requested: workspace, actual: entry.workspace },
    );
}

/**
 * A session's provider is fixed when it is created: setModel can change the
 * model, but not the service serving it. Switching mid-conversation would mean
 * replaying a transcript built elsewhere, so reject it rather than pretend.
 */
function assertProviderMatches(entry, sessionId, provider) {
    if (entry.provider === provider.name) return;
    throw conflict(
        "session_provider_mismatch",
        `Session "${sessionId}" is running on provider "${entry.provider}"`,
        { requested: provider.name, actual: entry.provider },
    );
}

async function applyModel(entry, model) {
    if (!model || entry.model === model) return;
    await entry.session.setModel(model);
    log.info("switched model", { sessionId: entry.session.sessionId, from: entry.model, to: model });
    entry.model = model;
}

const toolContext = ({ sessionId, workspace, workspacePath }) => ({
    sessionId,
    workspace,
    workspacePath,
    logger: log.child(`tools.${workspace}`),
});

function track(session, { workspace, workspacePath, provider }) {
    const entry = {
        session,
        workspace,
        workspacePath,
        provider: provider.name,
        model: provider.model,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        lock: Promise.resolve(),
    };
    live.set(session.sessionId, entry);
    scheduleIdleEviction(entry);
    return entry;
}

/**
 * Run one turn against a session, serialised against any other turn on the
 * same session. A Copilot session processes one message at a time, so two
 * concurrent requests sharing a session_id must queue rather than interleave.
 */
export function runTurn(entry, query, { timeoutMs = config.session.turnTimeoutMs } = {}) {
    const task = async () => {
        entry.lastUsedAt = Date.now();
        clearTimeout(entry.idleTimer);

        try {
            const message = await entry.session.sendAndWait({ prompt: query }, timeoutMs);
            if (!message) {
                throw gatewayTimeout(
                    "agent_turn_timeout",
                    `The agent did not finish within ${timeoutMs}ms`,
                    { sessionId: entry.session.sessionId, timeoutMs },
                );
            }
            return message.data.content ?? "";
        } catch (cause) {
            throw runtimeFailure("agent_turn_failed", "The agent could not complete the turn", cause, {
                sessionId: entry.session.sessionId,
            });
        } finally {
            entry.lastUsedAt = Date.now();
            scheduleIdleEviction(entry);
        }
    };

    // Chain onto the tail regardless of how the previous turn settled, so one
    // failed turn does not wedge the queue.
    const result = entry.lock.then(task, task);
    entry.lock = result.then(noop, noop);
    return result;
}

/**
 * Surface a runtime-side failure (auth, model, transport) as a 502 carrying the
 * underlying message. These are upstream problems, not bugs in this server, and
 * the caller can act on "no GitHub OAuth token" where it cannot act on a 500.
 */
function runtimeFailure(code, message, cause, details) {
    if (cause instanceof AppError) return cause;
    return badGateway(code, message, { ...details, reason: cause?.message ?? String(cause) });
}

const noop = () => {};

function scheduleIdleEviction(entry) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
        void disconnect(entry.session.sessionId, "idle");
    }, config.session.idleTimeoutMs);
    entry.idleTimer.unref?.();
}

function evictIfAtCapacity() {
    if (live.size < config.session.maxLive) return;

    let oldest = null;
    for (const entry of live.values()) {
        if (!oldest || entry.lastUsedAt < oldest.lastUsedAt) oldest = entry;
    }
    if (!oldest) return;

    // Only evict a session that is not mid-turn; otherwise refuse the new one
    // rather than cutting an in-flight request short.
    const idleFor = Date.now() - oldest.lastUsedAt;
    if (idleFor < 1000) {
        throw tooManyRequests(
            "session_capacity_reached",
            `All ${config.session.maxLive} session slots are busy`,
        );
    }

    void disconnect(oldest.session.sessionId, "capacity");
}

/** Disconnect a live session. Its transcript stays on disk and can be resumed. */
export async function disconnect(sessionId, reason = "requested") {
    const entry = live.get(sessionId);
    if (!entry) return false;

    live.delete(sessionId);
    clearTimeout(entry.idleTimer);
    try {
        await entry.session.disconnect();
        log.info("disconnected session", { sessionId, reason });
    } catch (cause) {
        log.warn("failed to disconnect session", { sessionId, reason, error: String(cause) });
    }
    return true;
}

export async function disconnectAll() {
    await Promise.all([...live.keys()].map((id) => disconnect(id, "shutdown")));
}

export const liveSessionCount = () => live.size;
