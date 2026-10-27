import { randomUUID } from "node:crypto";
import { createLogger } from "../lib/logger.js";

const log = createLogger("http");

/** Attach a request id so a log line can be traced back to one HTTP call. */
export function requestContext(req, res, next) {
    req.id = req.get("x-request-id") ?? randomUUID();
    res.setHeader("x-request-id", req.id);
    next();
}

/** Log one line per completed request. */
export function requestLogger(req, res, next) {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        log.info(`${req.method} ${req.originalUrl}`, {
            requestId: req.id,
            status: res.statusCode,
            ms: Math.round(ms),
        });
    });
    next();
}
