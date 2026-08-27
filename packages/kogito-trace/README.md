# kogito-trace

Agent-friendly CLI for tracing Kogito process-instance execution via the **Data Index GraphQL API** — turn "why is this process stuck / errored?" into one command.

## Requirements

A running Kogito Data Index GraphQL endpoint. That's either:

- the Data Index service (`org.kie.kogito:data-index-service-*`), or
- a Quarkus app in dev mode with the `kogito-addons-quarkus-data-index-*` add-on (the embedded endpoint is usually `http://localhost:8080/graphql`).

Point the CLI at it with `--url <endpoint>` or `DATA_INDEX_URL` (default: `http://localhost:8180/graphql`).

## Usage

```sh
# most recent process instances (filterable)
kogito-trace instances [--url <endpoint>] [--process <processId>] [--state ERROR] [--limit 20] [--json]

# full execution trace of one instance:
# ordered node timeline (✓ done, ▶ active, ✗ errored), error details,
# user tasks, and process variables
kogito-trace trace <instanceId> [--url <endpoint>] [--json]
```

`--json` output is deterministic and machine-readable; `trace --json` additionally includes computed `steps` (sorted by enter time, with `durationMs`, `active`, `errored`).

## Typical debugging loop

1. `kogito-trace instances --state ERROR` — find the failing instance.
2. `kogito-trace trace <id>` — see which node errored, what ran before it, and the variable state.
3. Fix the BPMN/DMN/DRL asset (see `bpmnctl` / `dmnctl`), redeploy, re-run.

## Development

```sh
npm run build   # strict typecheck + esbuild bundle to dist/cli.cjs
npm test        # runs against a local mock Data Index server
```
