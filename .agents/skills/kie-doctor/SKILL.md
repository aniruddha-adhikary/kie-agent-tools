---
name: kie-doctor
description: Detect broken cross-asset references in KIE/Kogito projects (BPMN, DMN, DRL, scesim) with the kie-doctor CLI. Use after renaming/moving/deleting assets or editing references between them.
---

# Cross-asset reference checking for KIE/Kogito projects

KIE/Kogito assets reference each other by id, namespace, and file path: BPMN call
activities call process ids, business rule tasks activate DRL ruleflow-groups or bind DMN
models by namespace, and `.scesim` test scenarios point at DMN files. These links break
silently when files are renamed, moved, or deleted — the build may still pass, and the
failure only shows up at runtime.

`kie-doctor` (in `packages/kie-doctor`) lints all of that in one pass.

## Workflow

Run it on the resources directory after any change that touches more than one asset:

```sh
kie-doctor src/main/resources --json
```

- Exit 0 → all cross-references resolve (warnings may remain).
- Exit 1 → `findings[]` lists each problem with `severity`, `rule`, `file`, `message`.

Always run it after:

- renaming or deleting a `.bpmn`, `.dmn`, or `.drl` file,
- changing a process id, DMN name/namespace, or `ruleflow-group`,
- editing a call activity's `calledElement` or a business rule task's DMN binding,
- regenerating a `.scesim` file or moving its DMN.

## Fixing findings

- `call-activity-unknown-process`: the `calledElement` must equal the `<bpmn2:process id>`
  of another BPMN file in the project — fix with `bpmnctl set`.
- `rule-task-unknown-ruleflow-group`: add `ruleflow-group "<name>"` to a rule in a DRL
  file, or fix the task's `drools:ruleFlowGroup`. Verify the DRL with `drlcheck compile`.
- `rule-task-dmn-*` / `scesim-dmn-*`: the DMN file moved or its name/namespace changed.
  Get the current values with `dmnctl describe file.dmn --json`, then fix the reference
  (for scesim use `scesimctl sync-dmn`).
- `dmn-import-unknown-namespace`: the imported DMN model isn't in the scanned tree —
  restore it or update the `<import namespace>`.
- `drl-orphan-ruleflow-group` (warning): rules in that group will never fire from a
  process; either wire a business rule task to it or remove the group.

## Limits

- Only files under the scanned directory count as "known" — run it from the resources
  root, not a subfolder, or references into unscanned folders will be reported missing.
- DRL is scanned lexically, not compiled; run `drlcheck` for real DRL diagnostics.
- Java class references (e.g. service task implementations) are not checked.
