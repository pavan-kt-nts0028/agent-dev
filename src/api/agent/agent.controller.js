import { config } from "../../config/index.js";
import { resolveWorkspacePath } from "../../config/workspaces.js";
import { resolveProvider } from "../../copilot/providers.js";
import { acquireSession, runTurn } from "../../copilot/sessionManager.js";
import { fallbackTitle, generateTitle } from "../../copilot/titles.js";

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
    const { response, toolCalls, traceFile } = await runTurn(entry, query, { requestId: req.id });

    // Name the conversation once, on the turn that created it. The model is
    // asked in a separate session; if it is slow or unavailable we fall back to
    // the opening words rather than failing the request over a cosmetic field.
    if (created && !entry.title) {
        entry.title =
            (await generateTitle({ providerName: entry.provider, model: entry.model, query })) ??
            fallbackTitle(query);
    }

    res.json({
        session_id: entry.session.sessionId,
        workspace,
        model_provider: entry.provider,
        model: entry.model,
        created,
        response,
        tool_calls: toolCalls,
        trace_file: traceFile,
        duration_ms: Date.now() - started,
        title: entry.title ?? fallbackTitle(query)
    });
}
