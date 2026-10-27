import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";
import { createLogger } from "./logger.js";

const log = createLogger("turnlog");

/** Events carrying file contents or tool output can be large; keep one line bounded. */
const MAX_RECORD_BYTES = 128 * 1024;

const NOOP = { file: null, event() {}, note() {}, close() {} };

const safe = (value, fallback = "unknown") =>
    String(value ?? fallback).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 60) || fallback;

/**
 * Per-turn trace file.
 *
 * One file per /agent call, holding every session event the runtime emitted
 * while that turn ran: model calls, tool executions, permission decisions,
 * errors. This is the only place the "agent narrated a tool call instead of
 * making one" failure is visible — the HTTP response looks identical either
 * way, so without the trace a silent no-op reads as success.
 *
 * Written as JSON Lines: one self-contained JSON object per line, so a partial
 * file from a crashed turn is still readable.
 */
export function createTurnLog(meta) {
    if (!config.turnLog.enabled) return NOOP;

    const startedAt = new Date();
    const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
    const name = [
        stamp,
        safe(meta.workspace, "noworkspace"),
        safe(meta.sessionId).slice(0, 8),
        safe(meta.requestId).slice(0, 8),
    ].join("_") + ".jsonl";

    const file = path.join(config.turnLog.dir, name);
    let stream;
    try {
        fs.mkdirSync(config.turnLog.dir, { recursive: true });
        stream = fs.createWriteStream(file, { flags: "a" });
        stream.on("error", (error) => log.warn("trace write failed", { file, error: String(error) }));
    } catch (cause) {
        log.warn("could not open trace file", { file, error: String(cause) });
        return NOOP;
    }

    const counts = Object.create(null);
    let toolCalls = 0;

    const write = (record) => {
        let line;
        try {
            line = JSON.stringify({ at: new Date().toISOString(), ...record });
        } catch (cause) {
            line = JSON.stringify({ at: new Date().toISOString(), kind: "unserializable", error: String(cause) });
        }
        if (line.length > MAX_RECORD_BYTES) {
            line = JSON.stringify({
                at: new Date().toISOString(),
                kind: record.kind,
                type: record.type,
                truncated: true,
                bytes: line.length,
                preview: line.slice(0, 2000),
            });
        }
        stream.write(line + "\n");
    };

    write({ kind: "request", ...meta, startedAt: startedAt.toISOString() });

    return {
        file,

        /** Record one session event. */
        event(e) {
            counts[e.type] = (counts[e.type] ?? 0) + 1;
            if (e.type === "tool.execution_start") toolCalls += 1;
            write({ kind: "event", type: e.type, data: e.data });
        },

        /** Record an arbitrary note from the server itself. */
        note(message, fields) {
            write({ kind: "note", message, ...fields });
        },

        /** Close the trace with a summary. Returns what was counted. */
        close(outcome) {
            const summary = {
                kind: "result",
                ...outcome,
                durationMs: Date.now() - startedAt.getTime(),
                toolCalls,
                eventCounts: counts,
            };
            write(summary);
            stream.end();
            return { file, toolCalls, eventCounts: counts };
        },
    };
}
