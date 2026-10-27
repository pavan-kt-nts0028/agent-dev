import { config } from "./config/index.js";
import { loadWorkspaces } from "./config/workspaces.js";
import { startCopilotClient, stopCopilotClient } from "./copilot/client.js";
import { disconnectAll } from "./copilot/sessionManager.js";
import { createApp } from "./app.js";
import { createLogger } from "./lib/logger.js";

const log = createLogger("server");

async function main() {
    loadWorkspaces();
    await startCopilotClient();

    const server = createApp().listen(config.port, config.host, () => {
        log.info("listening", { url: `http://${config.host}:${config.port}` });
    });

    installShutdownHandlers(server);
}

function installShutdownHandlers(server) {
    let shuttingDown = false;

    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info("shutting down", { signal });

        await new Promise((resolve) => server.close(resolve));
        await disconnectAll();
        await stopCopilotClient();

        log.info("shutdown complete");
        process.exit(0);
    };

    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => void shutdown(signal));
    }

    process.on("unhandledRejection", (reason) => {
        log.error("unhandled rejection", { error: reason?.stack ?? String(reason) });
    });
}

main().catch((error) => {
    log.error("failed to start", { error: error?.stack ?? String(error) });
    process.exit(1);
});
