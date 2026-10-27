# agent_dev

An HTTP wrapper around the [GitHub Copilot SDK](https://www.npmjs.com/package/@github/copilot-sdk).
It holds one Copilot runtime per process and exposes agent sessions, scoped to
named workspaces, over a small JSON API.

## Running

```bash
npm install
cp .env.example .env        # optional; every value has a default
npm start                   # or: npm run dev  (node --watch)
```

By default requests go to a local **Ollama** instance, so no GitHub login is
needed. Make sure Ollama is running and has the model named by
`OLLAMA_DEFAULT_MODEL` pulled.

Only `model_provider: "copilot"` needs GitHub credentials — log in once with the
Copilot CLI (`copilot`, then `/login`) or set `COPILOT_GITHUB_TOKEN`. Without
either, those requests return `502 agent_turn_failed` with
`No GitHub OAuth token or Copilot HMAC key provided`.

## Workspaces

A workspace is a **name**, not a path. `config/workspaces.json` maps names to
absolute directories and is read once at boot:

```json
{
    "agent-dev": "/Users/pavan-25216/zoho-org/agent_dev",
    "billing-api": "~/zoho-org/billing-api"
}
```

Every path is resolved and checked at startup, so a bad mapping fails the boot
rather than every request. Point `WORKSPACES_FILE` elsewhere to use a different
file. `POST /workspaces` adds further mappings at runtime, for this process only.

## API

### `GET /workspaces`

```json
{ "workspaces": ["agent-dev", "billing-api"], "count": 2 }
```

### `POST /workspaces`

Register a mapping while the server is running:

```json
{ "name": "billing-api", "path": "~/zoho-org/billing-api" }
```

```json
{ "workspace": "billing-api", "path": "/Users/you/zoho-org/billing-api", "count": 3 }
```

`name` is restricted to letters, digits, dot, dash and underscore. `path` must
be an existing directory; `~/` is expanded and relative paths resolve against
the server's working directory. The resolved absolute path is echoed back so
you can confirm where it landed.

The mapping is **in-memory only** — `config/workspaces.json` is not rewritten,
so anything registered this way is gone after a restart. Registration is
additive: an existing name returns `409` rather than being repointed, because
live sessions are already bound to the old directory.

### `POST /agent`

```json
{
    "workspace": "agent-dev",
    "query": "What does src/app.js set up?",
    "model_provider": "ollama",
    "model": "mistral:latest",
    "session_id": "9db0855c-37d6-4556-8397-2b83104e4c91"
}
```

| Field            | Required | Notes                                                            |
| ---------------- | -------- | ---------------------------------------------------------------- |
| `workspace`      | yes      | A name from `GET /workspaces`.                                   |
| `query`          | yes      | The prompt.                                                      |
| `model_provider` | no       | `ollama` or `copilot`. Defaults to `AGENT_DEFAULT_PROVIDER`.     |
| `model`          | no       | Defaults to the chosen provider's default model.                 |
| `session_id`     | no       | Omit to start a new conversation; supply one to continue it.      |

Response:

```json
{
    "session_id": "9db0855c-...",
    "workspace": "agent-dev",
    "model_provider": "ollama",
    "model": "mistral:latest",
    "created": true,
    "response": "…",
    "duration_ms": 8421
}
```

`created` tells the caller whether it got a fresh transcript. Keep `session_id`
and send it back to continue the conversation.

### `GET /health`

Uptime, live session count, and the registered tool names.

### Errors

Every failure returns `{ "error": { "code", "message", "details?" }, "requestId" }`.

| Status | Code                        | When                                                   |
| ------ | --------------------------- | ------------------------------------------------------ |
| 400    | `invalid_request`           | Body failed schema validation.                         |
| 400    | `invalid_workspace_path`    | Registered path is missing or is not a directory.       |
| 400    | `unknown_model_provider`    | `model_provider` is not a configured provider.          |
| 404    | `workspace_not_found`       | Unknown workspace name (lists the valid ones).          |
| 409    | `workspace_exists`          | That workspace name is already registered.              |
| 404    | `session_not_found`         | `session_id` has no transcript on disk.                 |
| 409    | `session_workspace_mismatch`| The session belongs to a different workspace.           |
| 409    | `session_provider_mismatch` | The session runs on a different model provider.         |
| 429    | `session_capacity_reached`  | All session slots are busy.                             |
| 502    | `agent_session_failed`      | The runtime refused to create the session.              |
| 502    | `agent_turn_failed`         | The turn failed upstream — `details.reason` says why.   |
| 504    | `agent_turn_timeout`        | The turn outran `AGENT_TURN_TIMEOUT_MS`.                |

## Model providers

Sessions route to one of two providers, chosen per request with
`model_provider` and defaulting to `AGENT_DEFAULT_PROVIDER` (`ollama`):

| Provider  | Routing                                              | Default model        |
| --------- | ---------------------------------------------------- | -------------------- |
| `ollama`  | BYOK to `OLLAMA_BASE_URL` (OpenAI-compatible)        | `OLLAMA_DEFAULT_MODEL` |
| `copilot` | GitHub Copilot API on the logged-in seat             | `COPILOT_DEFAULT_MODEL` |

Each provider carries its own default model, because a model id only means
something to the service serving it — `claude-sonnet-4.5` is meaningless to
Ollama and `mistral:latest` is meaningless to Copilot.

A session's provider is fixed when it is created. `model` can change on a live
session, but reusing a `session_id` with a different `model_provider` returns
`409 session_provider_mismatch`. Note that provider choice is not recorded in
session metadata, so a **cold resume** (session evicted from memory, restored
from disk) adopts whichever provider the request asks for.

Only `copilot` needs GitHub credentials. Running on the `ollama` default, the
server works with no GitHub login at all.

## Conversation titles

The first turn of a new session gets an LLM-generated `title` in the response:

| Query | Title |
| ----- | ----- |
| `List out all the local git branches` | `Local Git Branches List` |
| `How are workspaces resolved?` | `Workspace Resolution Explanation` |
| `hi` | `Greeting` |

The title is generated once, on the turn that creates the session, and reused on
later turns — a follow-up returns the same title without another model call.

It runs in its own short-lived session with no tools and a replaced system
message, rather than on the working session. Asking the working session to name
itself would put the request and its answer into the transcript the agent then
reasons over, and inheriting the agent's large system prompt would both slow the
call down and tempt smaller models into answering the question instead of naming
it.

Titles are cosmetic and never fail a turn: if the model is slow, unavailable, or
returns nothing usable, the response falls back to the opening words of the query
(`What does the session manager do…`).

- `AGENT_TITLE_LLM=false` — skip the model call and always use the fallback.
- `AGENT_TITLE_MODEL` — name a smaller, faster model; defaults to the request's.
- `AGENT_TITLE_TIMEOUT_MS` — give up and fall back after this long (default 30s).

## Per-turn traces

Every `/agent` call writes a JSON Lines trace to `AGENT_LOG_DIR` (default
`logs/`), named `<timestamp>_<workspace>_<session>_<request>.jsonl`. The
response points at it:

```json
{ "response": "...", "tool_calls": 1,
  "trace_file": ".../logs/2026-10-27T08-59-21-512Z_agent-dev_6c95bc7e_516b0a1a.jsonl" }
```

Each file covers one request: a `request` record with the query, model and
workspace; one `event` record per runtime event (model calls, tool executions,
permission decisions, errors); and a `result` record with the outcome, duration
and a count of every event type seen.

`tool_calls` is the field to watch. A model that cannot emit tool calls will
describe them in prose instead, and the HTTP response looks like success either
way — only the count tells them apart:

| Model | `tool_calls` | Trace shows |
| ----- | ------------ | ----------- |
| `qwen2.5:32b` | 1 | `tool.execution_start`, `permission.requested`, `tool.execution_complete` |
| `qwen3-coder:30b` | 0 | no tool events; the call leaked into the reply text |

So `tool_calls: 0` on a request that asked for work means nothing ran.

Records over 128 KB are truncated to a preview, so one large file read cannot
produce a runaway trace. `logs/` is gitignored. Set `AGENT_TURN_LOG=false` to
disable tracing.

## Session lifecycle

Sessions stay resident between requests so follow-ups are cheap. An idle one is
disconnected after `AGENT_SESSION_IDLE_TIMEOUT_MS`; its transcript stays on disk
and is resumed transparently when the same `session_id` comes back. Two requests
sharing a `session_id` are serialised — a Copilot session handles one message at
a time.

## Layout

```
src/
  index.js                  bootstrap: config → runtime → HTTP → graceful shutdown
  app.js                    Express app factory (no side effects; mountable in tests)
  config/
    index.js                environment parsing, all defaults in one place
    workspaces.js           name → path registry
  api/
    routes.js               route table
    agent/                  POST /agent: schema + controller
    workspaces/             GET + POST /workspaces: schema + controller
  copilot/
    client.js               the single CopilotClient and its lifecycle
    providers.js            provider registry: routing + per-provider defaults
    sessionManager.js       create / resume / serialise / evict sessions
    permissions.js          headless permission policy
  tools/
    index.js                tool registry
    defineAgentTool.js      helper that binds a tool to its request context
    builtin/                tool implementations
  middleware/               request id, logging, validation, error handling
  lib/                      errors, logger
```

## Adding a tool

Tools are declared as factories so each one receives the context of the session
it serves (`workspace`, `workspacePath`, `sessionId`, `logger`).

1. Create `src/tools/<area>/<name>.tool.js`:

```js
import { z } from "zod";
import { defineAgentTool } from "../defineAgentTool.js";

export default defineAgentTool({
    name: "list_merge_requests",
    description: "List open merge requests for this workspace's GitLab project.",
    parameters: z.object({ state: z.enum(["opened", "merged", "closed"]).optional() }),
    skipPermission: true, // read-only
    build: (ctx) => async ({ state = "opened" }) => {
        return gitlab.listMergeRequests({ path: ctx.workspacePath, state });
    },
});
```

2. Register it in `src/tools/index.js` by adding it to `registry`.

That is the whole wiring step — the tool is then built for every new session and
re-supplied on resume. `build(ctx)` runs once per session; the function it
returns runs per call.

## Configuration

See `.env.example`. Notable knobs:

- `AGENT_PERMISSION_MODE` — `auto` approves everything the agent asks for;
  `readonly` rejects shell commands and file writes. No human is attached to an
  HTTP request, so requests flagged `managedApprovalRequired` are always declined.
- `AGENT_MAX_LIVE_SESSIONS` — cap on resident sessions; the least recently used
  idle session is evicted when the cap is hit.
- `COPILOT_HOME` — where session transcripts live (defaults to `~/.copilot`).
