import { badRequest } from "../lib/errors.js";

/**
 * Validate req.body against a Zod schema and expose the parsed value as
 * req.body, so handlers work with coerced, trusted data only.
 */
export function validateBody(schema) {
    return (req, _res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return next(
                badRequest("invalid_request", "Request body failed validation", {
                    issues: result.error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                }),
            );
        }
        req.body = result.data;
        next();
    };
}
