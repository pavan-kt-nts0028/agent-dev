import express from "express";
import { router } from "./api/routes.js";
import { requestContext, requestLogger } from "./middleware/requestContext.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/** Build the Express app. Kept free of side effects so tests can mount it directly. */
export function createApp() {
    const app = express();

    app.disable("x-powered-by");
    app.use(express.json({ limit: "2mb" }));
    app.use(requestContext);
    app.use(requestLogger);

    app.use(router);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}
