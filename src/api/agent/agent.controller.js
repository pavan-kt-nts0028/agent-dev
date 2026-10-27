import { config } from "../../config/index.js";
import { resolveWorkspacePath } from "../../config/workspaces.js";
import { resolveProvider } from "../../copilot/providers.js";
import { acquireSession, runTurn } from "../../copilot/sessionManager.js";

/**
 * POST /agent — run one turn and return the agent's reply.
 *
 * Creates a session when session_id is absent, otherwise continues the named
 * one (resuming it from disk if it is no longer resident).
 */
export async function postAgent(req, res) {
    const { model, model_provider: modelProvider, workspace, session_id, query } = req.body;

    const workspacePath = resolveWorkspacePath(workspace);
    const provider = resolveProvider(modelProvider ?? config.defaultProvider, model);

    const { entry, created } = await acquireSession({
        sessionId: session_id,
        workspace,
        workspacePath,
        provider,
    });

    const started = Date.now();
    const response = await runTurn(entry, query);

    res.json({
        session_id: entry.session.sessionId,
        workspace,
        model_provider: entry.provider,
        model: entry.model,
        created,
        response,
        duration_ms: Date.now() - started,
    });
}
