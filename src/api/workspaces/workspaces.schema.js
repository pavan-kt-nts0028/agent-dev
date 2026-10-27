import { z } from "zod";

export const createWorkspaceSchema = z.object({
    /**
     * The name callers will pass as "workspace" on /agent. Restricted to
     * URL- and log-safe characters so it stays usable as an identifier.
     */
    name: z
        .string()
        .trim()
        .min(1, "name is required")
        .regex(/^[A-Za-z0-9._-]+$/, "name may contain only letters, digits, dot, dash, underscore"),

    /** Absolute path, or one starting with ~/. Must be an existing directory. */
    path: z.string().trim().min(1, "path is required"),
});
