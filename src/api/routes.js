import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { agentRequestSchema } from "./agent/agent.schema.js";
import { postAgent } from "./agent/agent.controller.js";
import { getWorkspaces, postWorkspace } from "./workspaces/workspaces.controller.js";
import { createWorkspaceSchema } from "./workspaces/workspaces.schema.js";
import { liveSessionCount } from "../copilot/sessionManager.js";
import { listToolNames } from "../tools/index.js";

export const router = Router();

router.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        uptime_s: Math.round(process.uptime()),
        live_sessions: liveSessionCount(),
        tools: listToolNames(),
    });
});

router.get("/workspaces", getWorkspaces);
router.post("/workspaces", validateBody(createWorkspaceSchema), postWorkspace);
router.post("/agent", validateBody(agentRequestSchema), postAgent);
