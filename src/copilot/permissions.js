import { config } from "../config/index.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("copilot.permissions");

/**
 * No human is attached to an HTTP request, so every permission decision has to
 * be made by policy. Two modes:
 *
 *   auto     — approve everything the agent asks for (the workspace is trusted).
 *   readonly — approve reads, custom tools and MCP calls; reject shell and writes.
 *
 * Requests carrying `managedApprovalRequired` need a real person by definition,
 * so both modes decline them rather than approving on the user's behalf.
 */
export function createPermissionHandler({ sessionId, workspace }) {
    const mode = config.session.permissionMode;

    return (request) => {
        const base = { sessionId, workspace, kind: request.kind, tool: request.toolName };

        if (request?.managedApprovalRequired === true) {
            log.warn("declining request that needs human approval", base);
            return { kind: "user-not-available" };
        }

        if (mode === "readonly" && (request.kind === "shell" || request.kind === "write")) {
            log.info("rejecting write-capable request in readonly mode", {
                ...base,
                file: request.fileName,
                command: request.fullCommandText,
            });
            return {
                kind: "reject",
                feedback:
                    "This agent runs in read-only mode. Shell commands and file writes are " +
                    "unavailable; answer from what you can read instead.",
            };
        }

        log.debug("approving request", base);
        return { kind: "approve-once" };
    };
}
