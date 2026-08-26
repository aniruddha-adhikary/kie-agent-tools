# bpmnctl

A command-line tool that lets AI coding agents (Claude Code, Codex, Devin, ...) edit
BPMN 2.0 files **semantically** — including Kogito / jBPM / KIE-flavored files with
`drools:` extensions — without ever touching diagram coordinates.

Raw XML edits to `.bpmn` files break because the diagram interchange (BPMN DI:
shapes, bounds, waypoints) must stay consistent with the process semantics.
`bpmnctl` solves this: every edit operates on the process model, and the full DI
is **regenerated automatically** after each change (via
[bpmn-auto-layout](https://github.com/bpmn-io/bpmn-auto-layout)), so files stay
openable in the Kogito/jBPM web modeler, VS Code BPMN editors, and bpmn.io tools.

Kogito/jBPM specifics are preserved end-to-end: `drools:*` attributes
(`packageName`, `ruleFlowGroup`, ...), `<drools:metaData>` extension elements,
io specifications, and potential owners all survive parsing, editing, and layout.

## Install

```sh
npm install        # from a checkout
npm link           # makes `bpmnctl` available on PATH
```

Requires Node.js >= 18.

## Quick tour

```sh
# scaffold a new executable process (start -> end)
bpmnctl new order.bpmn --id orders --name "Order Handling" --package org.acme

# see what's in a file (add --json for machine-readable output)
bpmnctl describe order.bpmn

# splice a user task into the existing start->end flow
bpmnctl add order.bpmn --type userTask --name "Review Order" --between start,end

# add a gateway and route it
bpmnctl add order.bpmn --type exclusiveGateway --name "Approved?" --between Review_Order,end
bpmnctl add order.bpmn --type endEvent --id rejected --name "Rejected"
bpmnctl rm  order.bpmn flow_Approved_end
bpmnctl connect order.bpmn Approved end --name yes --condition "return approved;" --language http://www.java.com/java
bpmnctl connect order.bpmn Approved rejected --name no --default

# jBPM/Kogito extension attributes and metadata
bpmnctl add order.bpmn --type businessRuleTask --name "Price Rules" \
    --between Review_Order,Approved --attr drools:ruleFlowGroup=pricing
bpmnctl set order.bpmn Review_Order --meta customAsync=true

# check the result
bpmnctl validate order.bpmn        # bpmnlint recommended rules + structural checks
bpmnctl render order.bpmn -o order.svg   # visual check without any editor
```

After a **raw XML edit** (sometimes the fastest way to change nested extension
elements), repair the diagram in one step:

```sh
bpmnctl layout order.bpmn
bpmnctl validate order.bpmn
```

## Commands

| Command | Purpose |
| --- | --- |
| `new <file> --id <id>` | scaffold a new process file (start -> end) |
| `describe <file> [--json]` | list nodes, flows, attributes, drools metadata |
| `add <file> --type <t> [--name] [--after id \| --before id \| --between a,b]` | add a node and wire it in |
| `connect <file> <src> <dst> [--condition expr] [--default]` | add a sequence flow |
| `rm <file> <id> [--reconnect]` | remove a node/flow; `--reconnect` bridges neighbors |
| `set <file> <id> [--name] [--attr k=v] [--meta k=v] [--script] [--condition]` | update properties |
| `layout <file>` | regenerate all DI coordinates from the process structure |
| `validate <file> [--json]` | bpmnlint (recommended rules) + structural checks; exits 1 on errors |
| `render <file> [-o out.svg]` | dependency-free SVG rendering for visual verification |
| `apply <file> <ops.json \| ->` | batch operations from JSON (see below) |

Node types for `add --type`: `task`, `userTask`, `scriptTask`, `serviceTask`,
`businessRuleTask`, `sendTask`, `receiveTask`, `manualTask`, `callActivity`,
`subProcess`, `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`,
`eventBasedGateway`, `startEvent`, `endEvent`, `intermediateCatchEvent`,
`intermediateThrowEvent`, `boundaryEvent`. Event nodes accept
`--event-def timer|message|signal|error|escalation|compensate|conditional|terminate`.

Every mutating command recomputes the layout by default; pass `--no-layout` to
skip it (e.g. mid-batch) and run `bpmnctl layout` at the end.

## Batch mode for agents

`bpmnctl apply` performs many edits in one invocation with a single layout pass:

```sh
bpmnctl apply order.bpmn - <<'EOF'
{ "ops": [
  { "op": "add", "type": "userTask", "id": "review", "name": "Review", "between": ["start", "end"] },
  { "op": "add", "type": "exclusiveGateway", "id": "gate", "name": "OK?", "between": ["review", "end"] },
  { "op": "add", "type": "endEvent", "id": "rejected", "name": "Rejected" },
  { "op": "connect", "source": "gate", "target": "rejected", "condition": "return !ok;" },
  { "op": "set", "id": "review", "meta": { "customAsync": "true" } }
] }
EOF
```

Supported ops: `add`, `connect`, `rm`, `set` — same fields as the CLI flags
(`attrs` for `--attr`, `meta` for `--meta`).

## Recommended agent workflow

1. `bpmnctl describe file.bpmn --json` — understand the current process.
2. Edit with `add` / `connect` / `rm` / `set`, or one `apply` batch.
3. `bpmnctl validate file.bpmn` — must exit 0.
4. `bpmnctl render file.bpmn` — optionally inspect the SVG.

Never hand-edit `<bpmndi:...>` sections; if DI is ever wrong or missing, run
`bpmnctl layout`.

## How it works

- [bpmn-moddle](https://github.com/bpmn-io/bpmn-moddle) parses/serializes BPMN 2.0
  XML; unknown namespaces (like `drools:`) are preserved as generic attributes and
  extension elements.
- [bpmn-auto-layout](https://github.com/bpmn-io/bpmn-auto-layout) discards existing
  DI and regenerates shapes/edges from the flow graph (left-to-right, branch-aware,
  subprocess-aware).
- [bpmnlint](https://github.com/bpmn-io/bpmnlint) provides the recommended lint
  rules behind `bpmnctl validate`.

### Known limitations

- Auto-layout replaces any manual layout: positions are deterministic from the
  graph, not hand-tuned. That is the tradeoff that makes agent edits safe.
- Collaborations with multiple pools/lanes are not laid out (bpmn-auto-layout
  limitation); `bpmnctl` falls back to saving without DI changes and warns.
- `<![CDATA[...]]>` wrappers are serialized as plain (escaped) text — semantically
  identical XML, and accepted by the Kogito/jBPM tooling.

## Development

```sh
npm test   # node --test, no build step
```
