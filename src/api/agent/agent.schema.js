import { z } from "zod";
import { PROVIDER_NAMES } from "../../copilot/providers.js";

export const agentRequestSchema = z.object({
    /** Where to send model requests. Falls back to AGENT_DEFAULT_PROVIDER. */
    model_provider: z.enum(PROVIDER_NAMES).optional(),

    /** Model id, meaningful to the chosen provider. Falls back to that provider's default. */
    model: z.string().trim().min(1).optional(),

    /** Registered workspace name — not a path. See GET /workspaces. */
    workspace: z.string().trim().min(1, "workspace is required"),

    /** Continue an existing conversation. Omit to start a new one. */
    session_id: z.string().trim().min(1).optional(),

    /** The prompt to send to the agent. */
    query: z.string().min(1, "query is required"),
});
