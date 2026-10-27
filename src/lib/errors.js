/**
 * Application error carrying an HTTP status and a stable machine-readable code.
 * Anything thrown that is not an AppError is treated as a 500 by the error handler.
 */
export class AppError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const notFound = (code, message, details) => new AppError(404, code, message, details);
export const conflict = (code, message, details) => new AppError(409, code, message, details);
export const tooManyRequests = (code, message, details) => new AppError(429, code, message, details);
export const badGateway = (code, message, details) => new AppError(502, code, message, details);
export const gatewayTimeout = (code, message, details) => new AppError(504, code, message, details);
