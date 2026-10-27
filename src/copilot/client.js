import { CopilotClient } from "@github/copilot-sdk";
import { config } from "../config/index.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("copilot.client");

/**
 * One CopilotClient per server process. It owns the Copilot runtime, and every
 * session created by the API is multiplexed over this single connection.
 */
let client = null;

export async function startCopilotClient() {
    if (client) return client;

    const instance = new CopilotClient({
        logLevel: config.copilot.logLevel,
        ...(config.copilot.baseDirectory ? { baseDirectory: config.copilot.baseDirectory } : {}),
        ...(config.copilot.gitHubToken ? { gitHubToken: config.copilot.gitHubToken } : {}),
    });

    await instance.start();
    client = instance;
    log.info("copilot runtime started");
    return client;
}

export function getCopilotClient() {
    if (!client) throw new Error("Copilot client has not been started yet");
    return client;
}

export async function stopCopilotClient() {
    if (!client) return;
    const instance = client;
    client = null;
    const errors = await instance.stop();
    for (const error of errors ?? []) {
        log.warn("error while stopping copilot runtime", { error: String(error) });
    }
    log.info("copilot runtime stopped");
}
