# kie-doctor

Cross-asset broken-reference lint for Apache KIE / Kogito projects. Scans a directory for
`.bpmn`/`.bpmn2`, `.dmn`, `.drl`, and `.scesim` files and reports references between them
that are broken — the class of errors that only surfaces at build or runtime otherwise.

```sh
kie-doctor [dir] [--json]      # dir defaults to . — point it at src/main/resources
```

Exit codes: `0` clean (warnings allowed), `1` errors found, `2` bad invocation.

## Checks

| Rule | Severity | Meaning |
| --- | --- | --- |
| `parse-error` | error | A BPMN/DMN/scesim file failed to parse |
| `call-activity-missing-called-element` | error | BPMN call activity has no `calledElement` |
| `call-activity-unknown-process` | error | `calledElement` matches no process id in scanned BPMN files |
| `rule-task-unknown-ruleflow-group` | error | Business rule task activates a `ruleflow-group` no scanned DRL declares |
| `rule-task-dmn-file-missing` | error | Business rule task (DMN kind) binds a `fileName` that doesn't exist |
| `rule-task-dmn-namespace-unknown` | error | Bound DMN `namespace` matches no scanned DMN model |
| `rule-task-dmn-model-mismatch` | error | Bound DMN `model` name doesn't match the model in that namespace |
| `dmn-import-unknown-namespace` | error | DMN `<import>` points to a namespace no scanned DMN file has |
| `scesim-missing-dmn-path` | error | DMN test scenario has no `settings.dmnFilePath` |
| `scesim-dmn-file-missing` | error | `settings.dmnFilePath` doesn't exist |
| `scesim-dmn-namespace-mismatch` | error | scesim `dmnNamespace` doesn't match the referenced DMN file |
| `scesim-dmn-name-mismatch` | warning | scesim `dmnName` doesn't match the referenced DMN file |
| `drl-orphan-ruleflow-group` | warning | DRL `ruleflow-group` not activated by any scanned BPMN task |

Relative paths (`dmnFilePath`, DMN-binding `fileName`) are resolved against both the scan
root and the referencing file's directory.

## JSON output

`--json` emits `{ root, scanned: {bpmn, dmn, drl, scesim}, findings: [{severity, rule, file, message}], ok }`
— stable and machine-readable, for agents.

## Implementation notes

- BPMN is parsed with the official `@kie-tools/bpmn-marshaller` (drools extension enabled),
  DMN with `@kie-tools/dmn-marshaller`, scesim with `@kie-tools/scesim-marshaller`.
- DRL is scanned lexically (package, `ruleflow-group`, `agenda-group`) — use
  [`drlcheck`](../drlcheck) for real compile diagnostics.
- `node_modules`, `target`, `dist`, `build`, and `.git` directories are skipped.
