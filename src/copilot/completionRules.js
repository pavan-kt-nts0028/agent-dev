import { config } from "../config/index.js";

/**
 * Extra system-prompt guidance about how to finish a turn.
 *
 * An agent loop ends only when the model returns a response containing no tool
 * calls. A model that writes "I'm done" and attaches one more call in the same
 * response has not ended anything: the loop runs again, the result lands in
 * context as new material, and the cycle repeats. Traced runs show agents
 * announcing completion four and five times while still calling tools, so the
 * rule is stated outright rather than left to be inferred.
 */
const RULES = `
## Finishing

Your turn ends only when you reply without calling any tool. A reply that
contains both a summary and a tool call does not end it — it starts another
round.

Once the work you were asked to do is done:
- Reply with a short summary and call no tools in that reply.
- Do not re-read, re-check or re-summarise anything you have already acted on.
- Do not delegate verification of work you just did.

A commit, push or write that reported success is done. Report it and stop;
confirming a result you have already seen adds nothing.

Before you finish, stop any background shell you started that is still running.
`.trim();

/** SystemMessageConfig for createSession/resumeSession, or undefined when disabled. */
export function completionRules() {
    if (!config.session.completionRules) return undefined;
    return { mode: "append", content: RULES };
}
