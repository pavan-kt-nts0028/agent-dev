import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineAgentTool } from "../defineAgentTool.js";

/**
 * Reference implementation of a workspace-scoped tool. Copy this shape when
 * adding real ones (GitLab MRs, pipelines, issue lookups).
 */
export default defineAgentTool({
    name: "workspace_info",
    description:
        "Describe the workspace this session is attached to: its registered name, " +
        "absolute path, and the entries at its root. Use it to orient before reading files.",
    parameters: z.object({
        includeHidden: z
            .boolean()
            .optional()
            .describe("Include dotfiles and dot-directories in the listing"),
    }),
    skipPermission: true,
    build: (ctx) => async ({ includeHidden = false }) => {
        const entries = await fs.readdir(ctx.workspacePath, { withFileTypes: true });
        const visible = entries.filter((e) => includeHidden || !e.name.startsWith("."));
        return {
            workspace: ctx.workspace,
            path: ctx.workspacePath,
            entries: visible
                .map((e) => ({
                    name: e.name + (e.isDirectory() ? path.sep : ""),
                    type: e.isDirectory() ? "directory" : "file",
                }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        };
    },
});
