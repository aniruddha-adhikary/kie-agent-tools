---
name: drl-authoring
description: Get fast feedback on Drools DRL rule files with the drlcheck CLI — compile-check with line-level diagnostics, inspect rules and declared types, and dry-run rule firing with JSON facts, without waiting for a full Kogito/Maven build.
---

# Authoring and debugging DRL rules with drlcheck

When editing `.drl` files, do NOT wait for a full application build to find out whether the rules compile or behave as intended. Use `drlcheck`:

```sh
node packages/drlcheck/bin/drlcheck.js --help
```

## Workflow

1. **One-time setup** (builds and caches a headless Drools runner; needs Java 17+ and Maven):

   ```sh
   drlcheck setup
   ```

2. **After every DRL edit, compile-check first:**

   ```sh
   drlcheck compile path/to/rules.drl --json
   ```

   Errors come with `line`/`column` — fix them before anything else. Pass all DRL files that belong together (shared `declare` types) in one invocation.

3. **Inspect what the file defines** (rule names, packages, declared fact types with fields):

   ```sh
   drlcheck describe path/to/rules.drl --json
   ```

4. **Dry-run the rules with realistic facts** to verify behavior — which rules fire, in what order, and how facts end up:

   ```sh
   drlcheck run path/to/rules.drl --facts '[{"type":"Applicant","data":{"age":30,"income":9000}}]' --json
   ```

   - `fired[]` is in firing order; `factsAfter[]` shows field values after execution.
   - `firedCount: 0` with valid facts usually means a condition is wrong — check field names/types via `describe`.
   - Unknown fact types fail with the list of declared types.

5. **Verify both directions**: facts that SHOULD fire a rule and facts that should NOT.

## Limits

- Facts must be DRL `declare`d types; rules matching project Java classes need the real application classpath — test those with the project's own build.
- `drlcheck` exercises rules in a plain KieSession; rule-flow-group activation (BPMN-driven) is not simulated.
