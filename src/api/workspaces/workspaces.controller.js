import { listWorkspaceNames, registerWorkspace } from "../../config/workspaces.js";

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
