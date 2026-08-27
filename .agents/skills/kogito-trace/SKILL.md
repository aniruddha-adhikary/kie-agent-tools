---
name: kogito-trace
description: Debug Kogito/jBPM process instances by querying the Data Index GraphQL API with the kogito-trace CLI — find stuck or errored instances and read their node-by-node execution timeline instead of guessing from logs.
---

# Debugging Kogito process instances with kogito-trace

When a Kogito/jBPM process misbehaves at runtime (stuck, errored, wrong path taken), do NOT grep application logs first. Query the Data Index:

```sh
node packages/kogito-trace/bin/kogito-trace.js --help
```

## Workflow

1. **Find the instance.** List recent instances, filter as needed:

   ```sh
   kogito-trace instances --state ERROR --json
   kogito-trace instances --process loanApproval --limit 5
   ```

2. **Trace it.** One command gives the ordered node timeline (✓ completed, ▶ still active, ✗ errored), the error message + failing node definition id, user tasks (state/owner), and the process variables:

   ```sh
   kogito-trace trace <instanceId>
   kogito-trace trace <instanceId> --json   # structured: instance, steps[], userTasks[]
   ```

3. **Interpret.**
   - `✗` step + `error:` line → the node definition id maps to an element id in the `.bpmn` file; inspect it with `bpmnctl describe`.
   - Last `▶` step on an ACTIVE instance → where it's stuck (often a user task or async work item).
   - `variables:` shows the data state the failing node saw.

4. **Fix the asset** with `bpmnctl`/`dmnctl`, redeploy, re-run the process, and re-trace.

## Endpoint

Pass `--url <graphql-endpoint>` or set `DATA_INDEX_URL`. In Quarkus dev mode with the data-index add-on the endpoint is typically `http://localhost:8080/graphql`; a standalone Data Index service defaults to `http://localhost:8180/graphql`.

If the endpoint is unreachable the CLI says so explicitly — start the app in dev mode (`mvn quarkus:dev`) or the Data Index service before retrying.
