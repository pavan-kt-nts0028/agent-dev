import workspaceInfo from "./builtin/workspaceInfo.tool.js";

/**
 * Every tool the agent can call. Add a module under ./builtin (or a sibling
 * folder for a provider, e.g. ./gitlab) and list it here — that is the only
 * wiring step.
 */
const registry = [workspaceInfo];

const names = new Set();
for (const tool of registry) {
    if (names.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
    names.add(tool.name);
}

/** Instantiate the tool set for one session. */
export function buildTools(ctx) {
    return registry.map((tool) => tool.create(ctx));
}

export const listToolNames = () => [...names].sort();
