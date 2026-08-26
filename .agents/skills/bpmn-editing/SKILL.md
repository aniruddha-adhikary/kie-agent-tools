---
name: bpmn-editing
description: Edit BPMN 2.0 files (Kogito / jBPM / KIE flavored) safely using the bpmnctl CLI. Use this whenever a task requires creating or modifying .bpmn / .bpmn2 process files — adding tasks, gateways, events, sequence flows, conditions, or drools attributes/metadata. Never hand-edit BPMN diagram (DI) coordinates; bpmnctl recomputes them automatically.
---

# Editing BPMN files with bpmnctl

## Why this skill exists

`.bpmn` files contain two coupled layers: the process semantics
(`<bpmn2:process>`) and the diagram interchange (`<bpmndi:BPMNDiagram>` —
shapes, bounds, edge waypoints). Raw XML edits that change the process without
updating the DI produce files that render broken or fail to open in the
Kogito/jBPM modelers. `bpmnctl` edits the semantics and regenerates the
**entire DI automatically**, so you never compute coordinates.

## Setup

From the repo root:

```sh
npm install
node bin/bpmnctl.js --help     # or: npm link && bpmnctl --help
```

Requires Node.js >= 18.

## Workflow (follow in order)

1. **Inspect first**: `bpmnctl describe file.bpmn --json` — get node ids, types,
   flows, drools attributes. All later commands refer to these ids.
2. **Edit semantically** with `add` / `connect` / `rm` / `set`, or one `apply`
   batch for multi-step changes.
3. **Validate**: `bpmnctl validate file.bpmn` — must exit 0. Fix every reported
   error (e.g. `no-implicit-split` means a non-gateway node has multiple
   outgoing flows — insert a gateway).
4. **Verify visually** (optional): `bpmnctl render file.bpmn -o out.svg` and
   view the SVG.

## Command cheat sheet

```sh
# create a new executable process (start -> end already wired)
bpmnctl new file.bpmn --id myProcess --name "My Process" --package org.acme

# insert a node INTO an existing flow (preferred — keeps the graph connected)
bpmnctl add file.bpmn --type userTask --name "Review" --between start,end

# append after / before a node (creates only one flow)
bpmnctl add file.bpmn --type serviceTask --name "Notify" --after Review

# gateways + conditional routing
bpmnctl add file.bpmn --type exclusiveGateway --name "OK?" --between Review,end
bpmnctl add file.bpmn --type endEvent --id rejected --name "Rejected"
bpmnctl connect file.bpmn OK rejected --name no --default
bpmnctl set file.bpmn flow_OK_end --condition "return approved;" --language http://www.java.com/java

# events with definitions
bpmnctl add file.bpmn --type intermediateCatchEvent --name "Wait" --between a,b --event-def timer

# Kogito/jBPM extension attributes and metadata
bpmnctl add file.bpmn --type businessRuleTask --name "Pricing" --between a,b --attr drools:ruleFlowGroup=pricing
bpmnctl set file.bpmn Review --meta customAsync=true

# remove a node and bridge its neighbors
bpmnctl rm file.bpmn Review --reconnect

# many edits, one layout pass
bpmnctl apply file.bpmn - <<'EOF'
{ "ops": [
  { "op": "add", "type": "userTask", "id": "review", "name": "Review", "between": ["start", "end"] },
  { "op": "connect", "source": "review", "target": "end" },
  { "op": "set", "id": "review", "meta": { "customAsync": "true" }, "attrs": { "drools:priority": "1" } }
] }
EOF
```

Node types: `task userTask scriptTask serviceTask businessRuleTask sendTask
receiveTask manualTask callActivity subProcess exclusiveGateway parallelGateway
inclusiveGateway eventBasedGateway startEvent endEvent intermediateCatchEvent
intermediateThrowEvent boundaryEvent`.
Event definitions: `timer message signal error escalation compensate
conditional terminate`.

## Rules

- **Never** edit anything inside `<bpmndi:BPMNDiagram>` by hand.
- If you must make a raw XML edit (e.g. complex nested extension elements not
  covered by `set`), edit only the `<bpmn2:process>` section, then run
  `bpmnctl layout file.bpmn && bpmnctl validate file.bpmn` to repair the DI.
- Prefer `--between src,dst` when inserting into an existing path; `--after`
  alone adds a second outgoing flow, which on non-gateway nodes is an implicit
  split and fails validation.
- `--attr` keys containing `:` (e.g. `drools:packageName`) are written as
  namespaced attributes; `--meta` writes `<drools:metaData>` entries.
- `validate` exit code 1 means errors — do not consider the edit done.
- Layout is deterministic from the flow graph; any manual layout in the file is
  intentionally replaced.
