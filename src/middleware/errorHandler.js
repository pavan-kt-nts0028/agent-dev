import { AppError } from "../lib/errors.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("http.error");

export function notFoundHandler(req, res) {
    res.status(404).json({
        error: { code: "route_not_found", message: `No route for ${req.method} ${req.path}` },
    });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
export function errorHandler(err, req, res, next) {
    const isAppError = err instanceof AppError;
    const status = isAppError ? err.status : 500;

    if (status >= 500) {
        log.error("unhandled request error", { requestId: req.id, error: err?.stack ?? String(err) });
    } else {
        log.warn("request rejected", { requestId: req.id, code: err.code, message: err.message });
    }

    if (res.headersSent) return next(err);

    res.status(status).json({
        error: {
            code: isAppError ? err.code : "internal_error",
            message: isAppError ? err.message : "Internal server error",
            ...(isAppError && err.details ? { details: err.details } : {}),
        },
        requestId: req.id,
    });
}
