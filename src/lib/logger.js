import { config } from "../config/index.js";

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function emit(level, scope, message, fields) {
    if (LEVELS[level] > LEVELS[config.logLevel]) return;
    const line = { ts: new Date().toISOString(), level, scope, message, ...fields };
    const text = config.logFormat === "json" ? JSON.stringify(line) : format(line);
    (level === "error" ? process.stderr : process.stdout).write(text + "\n");
}

function format({ ts, level, scope, message, ...rest }) {
    const extra = Object.entries(rest)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ");
    return `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${extra ? " " + extra : ""}`;
}

/** Create a logger bound to a scope, e.g. createLogger("copilot.session"). */
export function createLogger(scope) {
    const log = (level) => (message, fields) => emit(level, scope, message, fields);
    return {
        error: log("error"),
        warn: log("warn"),
        info: log("info"),
        debug: log("debug"),
        child: (sub) => createLogger(`${scope}.${sub}`),
    };
}
