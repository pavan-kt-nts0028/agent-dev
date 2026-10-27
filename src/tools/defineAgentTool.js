import { defineTool } from "@github/copilot-sdk";

/**
 * Declare a tool the agent can call.
 *
 * Tools are declared as factories rather than plain objects because a tool
 * almost always needs the request it is serving: which workspace is checked
 * out, which session is asking, where to log. `build` receives that context
 * once per session and returns the SDK tool definition.
 *
 * @param {object} spec
 * @param {string} spec.name              Tool name shown to the model.
 * @param {string} spec.description       What the tool does and when to reach for it.
 * @param {object} spec.parameters        Zod schema or raw JSON Schema for the arguments.
 * @param {boolean} [spec.skipPermission] Skip the permission prompt (read-only tools).
 * @param {boolean} [spec.overridesBuiltInTool] Required when shadowing a built-in tool name.
 * @param {(ctx: ToolContext) => (args: any, invocation: any) => unknown} spec.build
 */
export function defineAgentTool(spec) {
    const { name, description, parameters, skipPermission, overridesBuiltInTool, build } = spec;

    if (typeof build !== "function") {
        throw new Error(`Tool "${name}" must provide a build(ctx) function`);
    }

    return {
        name,
        create(ctx) {
            return defineTool(name, {
                description,
                parameters,
                ...(skipPermission === undefined ? {} : { skipPermission }),
                ...(overridesBuiltInTool === undefined ? {} : { overridesBuiltInTool }),
                handler: build(ctx),
            });
        },
    };
}

/**
 * @typedef {object} ToolContext
 * @property {string} workspace      Workspace name from the request.
 * @property {string} workspacePath  Absolute path the session runs in.
 * @property {string} sessionId      Session the tool call belongs to.
 * @property {import("../lib/logger.js").Logger} logger
 */
