import fs from "node:fs";
import path from "node:path";
import { config } from "./index.js";
import { createLogger } from "../lib/logger.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";

const log = createLogger("workspaces");

/** name -> absolute path. Populated by loadWorkspaces() at boot. */
const registry = new Map();

/**
 * Read the workspace mapping file and validate every entry resolves to a real
 * directory. Called once during bootstrap; throws if the file is unusable so
 * the server fails fast rather than 404ing every request later.
 */
export function loadWorkspaces(file = config.workspacesFile) {
    let raw;
    try {
        raw = fs.readFileSync(file, "utf8");
    } catch (cause) {
        throw new Error(`Cannot read workspaces file at ${file}: ${cause.message}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (cause) {
        throw new Error(`Workspaces file at ${file} is not valid JSON: ${cause.message}`);
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Workspaces file at ${file} must be a JSON object of name -> path`);
    }

    registry.clear();
    for (const [name, value] of Object.entries(parsed)) {
        registry.set(name, toWorkspacePath(name, value));
    }

    log.info("loaded workspaces", { file, count: registry.size });
    return registry.size;
}

const expandHome = (value) =>
    value.startsWith("~/") ? path.join(process.env.HOME ?? "", value.slice(2)) : value;

/**
 * Normalise one mapping to an absolute directory, rejecting anything that is
 * not a real directory. Shared by boot-time loading and runtime registration so
 * both apply the same rule; callers translate the thrown Error as they need.
 */
function toWorkspacePath(name, value) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Workspace "${name}" must map to a non-empty path string`);
    }
    const absolute = path.resolve(expandHome(value));
    const stats = fs.statSync(absolute, { throwIfNoEntry: false });
    if (!stats) throw new Error(`Workspace "${name}" points at a missing path: ${absolute}`);
    if (!stats.isDirectory()) {
        throw new Error(`Workspace "${name}" points at a file, not a directory: ${absolute}`);
    }
    return absolute;
}

/**
 * Add a mapping at runtime.
 *
 * In-memory only: the mapping file is never rewritten, so a workspace
 * registered this way is gone after a restart. Registering is additive — an
 * existing name is rejected rather than repointed, because live sessions are
 * already bound to the old directory and would keep using it.
 */
export function registerWorkspace(name, value) {
    if (registry.has(name)) {
        throw conflict("workspace_exists", `Workspace "${name}" is already registered`, {
            path: registry.get(name),
        });
    }

    let absolute;
    try {
        absolute = toWorkspacePath(name, value);
    } catch (cause) {
        throw badRequest("invalid_workspace_path", cause.message);
    }

    registry.set(name, absolute);
    log.info("registered workspace", { name, path: absolute });
    return { name, path: absolute };
}

/** Workspace names exposed over the API, sorted for a stable response. */
export const listWorkspaceNames = () => [...registry.keys()].sort();

export const hasWorkspace = (name) => registry.has(name);

/** Resolve a workspace name to its path, or throw a 404 naming the unknown workspace. */
export function resolveWorkspacePath(name) {
    const workspacePath = registry.get(name);
    if (!workspacePath) {
        throw notFound("workspace_not_found", `Unknown workspace "${name}"`, {
            available: listWorkspaceNames(),
        });
    }
    return workspacePath;
}
