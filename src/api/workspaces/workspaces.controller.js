import { listWorkspaceNames, registerWorkspace } from "../../config/workspaces.js";
import { live } from "../../copilot/sessionManager.js";
import { workspaceNameSchema } from "./workspaces.schema.js";

/** GET /workspaces — the workspace names this server will accept. */
export function getWorkspaces(_req, res) {
    const workspaces = listWorkspaceNames();
    res.json({ workspaces, count: workspaces.length });
}

/**
 * POST /workspaces — register a mapping for the lifetime of this process.
 *
 * The resolved path is echoed back (unlike GET, which lists names only) since
 * the caller supplied it and needs to see how ~ and relative segments resolved.
 */
export function postWorkspace(req, res) {
    const registered = registerWorkspace(req.body.name, req.body.path);

    res.status(201).json({
        workspace: registered.name,
        path: registered.path,
        count: listWorkspaceNames().length,
    });
}

/**
 * GET /workspaces/:workspace/sessions — list all live sessions for a specific workspace
 */
export async function getWorkspaceSessions(req, res) {
    // Validate the workspace parameter
    const validationResult = workspaceNameSchema.safeParse(req.params);
    if (!validationResult.success) {
        return res.status(400).json({
            error: "Invalid workspace name",
            details: validationResult.error.issues
        });
    }
    
    const { workspace } = validationResult.data;
    
    // Filter live sessions by the specified workspace
    const sessions = [];
    for (const [sessionId, entry] of live.entries()) {
        if (entry.workspace === workspace) {
            sessions.push({
                session_id: sessionId,
                workspace: entry.workspace,
                provider: entry.provider,
                model: entry.model,
                created_at: entry.createdAt,
                last_used_at: entry.lastUsedAt,
                title: entry.title || "New Chat"
            });
        }
    }
    
    res.json({
        workspace,
        sessions,
        count: sessions.length
    });
}
