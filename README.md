<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
    <img src="docs/logo.svg" alt="kie-agent-tools" width="620">
  </picture>
</p>

# kie-agent-tools

Agent-oriented CLI tools for the Apache KIE / Kogito / Drools ecosystem. AI coding agents are bad at editing KIE's XML asset formats directly (broken diagram interchange, dangling references, index-based grids); these tools expose the assets through semantic, deterministic CLIs with JSON output so agents can maintain, debug, and test KIE projects reliably.

> This is an independent community project. It is **not** an official Apache Software Foundation, Apache KIE, Kogito, or Drools project, and is not affiliated with or endorsed by them.

## Packages

| Package | Status | What it does |
| --- | --- | --- |
| [`packages/bpmnctl`](packages/bpmnctl) | ready | Semantic BPMN 2.0 editing (Kogito/jBPM `drools:` extensions preserved) with automatic diagram layout, lint, and SVG render |
| [`packages/dmnctl`](packages/dmnctl) | ready | Semantic DMN editing with automatic diagram layout, FEEL linting, structural validation, and validate/eval via KIE jitexecutor |
| [`packages/scesimctl`](packages/scesimctl) | ready | Semantic editing and validation of `.scesim` test scenarios, with columns derived from the DMN model |
| [`packages/kogito-trace`](packages/kogito-trace) | ready | Process-instance execution traces (timeline, errors, user tasks, variables) via the Data Index GraphQL API |
| [`packages/drlcheck`](packages/drlcheck) | ready | Fast DRL compile-checks and rule-firing dry runs via a cached headless Drools runner (needs Java + Maven) |
| [`packages/kie-doctor`](packages/kie-doctor) | ready | Cross-asset broken-reference lint (BPMN ↔ DMN ↔ DRL ↔ scesim) |

## Installation

The tools aren't published to npm yet — install from source (Node.js >= 18 required):

```sh
git clone https://github.com/aniruddha-adhikary/kie-agent-tools.git
cd kie-agent-tools
npm install
npm run build
```

Run any tool directly:

```sh
node packages/<pkg>/bin/<tool>.js --help    # e.g. node packages/bpmnctl/bin/bpmnctl.js --help
```

Or put the ones you use on your PATH:

```sh
(cd packages/bpmnctl && npm link)     # repeat per package: dmnctl, scesimctl, kogito-trace, drlcheck, kie-doctor
bpmnctl --help
```

Extra requirements per tool (everything else is pure Node):

- **drlcheck** — Java 17+ and Maven; run `drlcheck setup` once to build and cache the Drools runner.
- **kogito-trace** — a running Kogito Data Index (point at it with `--url` or `DATA_INDEX_URL`).
- **dmnctl validate/eval `--jit`** — optional, needs a running [jitexecutor](https://github.com/apache/incubator-kie-tools/tree/main/packages/extended-services) for full validation/evaluation; everything else in dmnctl works offline.

## Getting started

A 2-minute tour — build a process, a decision, and a test scenario without touching XML:

```sh
# BPMN: scaffold a process, splice in a task, check it
bpmnctl new hello.bpmn --id hello --name "Hello"
bpmnctl add hello.bpmn --type userTask --name "Review" --between start,end
bpmnctl validate hello.bpmn
bpmnctl render hello.bpmn -o hello.svg        # look at what you built

# DMN: model a decision with FEEL logic
dmnctl new loan.dmn --name "Loan"
dmnctl add loan.dmn --type input-data --name "Income" --type-ref number
dmnctl add loan.dmn --type decision --name "Approved"
dmnctl connect loan.dmn Income Approved
dmnctl set-expression loan.dmn Approved --feel "Income > 5000"
dmnctl lint-feel loan.dmn

# SCESIM: a test scenario with columns derived from the DMN
scesimctl new loan.scesim --dmn loan.dmn
scesimctl add-row loan.scesim --values '{"Income": 9000, "Approved": "true"}'

# And lint every cross-asset reference in the directory
kie-doctor .
```

Diagram coordinates, ids, and cross-references are managed for you — `describe` any file to see its current state, and add `--json` to any read command for machine-readable output.

### For AI coding agents

If you're an agent (or configuring one): never edit `.bpmn`/`.dmn`/`.scesim` XML directly — raw edits break diagram interchange and dangling references. Use these CLIs instead. Ready-made skills live in [`.agents/skills/`](.agents/skills) (one per tool, in the standard SKILL.md format); copy them into your project or agent config to teach the workflows:

1. `describe --json` to read any asset before editing.
2. Mutate with semantic commands (`add`, `connect`, `set`, `set-expression`, `add-row`, …).
3. Verify: `validate` / `lint-feel` / `drlcheck compile` after each edit, `kie-doctor` after renames/moves, `render` for a visual check.

## CLI reference

Every command that reads a model supports `--json` for machine-readable output, and mutating commands recompute diagram layout automatically — never edit DI/DMNDI coordinates by hand.

### bpmnctl — edit `.bpmn` files

```sh
bpmnctl new file.bpmn --name "My Process"           # scaffold with start + end event
bpmnctl describe file.bpmn [--json]                 # nodes, flows, attributes
bpmnctl add file.bpmn --type userTask --name "Review" --after start   # or --between src,dst
bpmnctl connect file.bpmn <source> <target>         # add a sequence flow
bpmnctl rm file.bpmn <id> [--reconnect]             # remove node/flow, optionally bridge neighbors
bpmnctl set file.bpmn <id> --name ... --attr k=v --meta k=v           # attrs (drools: prefix ok) + drools:metaData
bpmnctl layout file.bpmn                            # regenerate all DI coordinates (fixes raw-XML edits)
bpmnctl validate file.bpmn [--json]                 # bpmnlint + structural checks, exit 1 on errors
bpmnctl render file.bpmn -o out.svg                 # visual check
bpmnctl apply file.bpmn ops.json                    # batch ops, single layout pass ("-" = stdin)
```

### dmnctl — edit `.dmn` files

```sh
dmnctl new file.dmn --name "Loan"                   # scaffold an empty model
dmnctl describe file.dmn [--json]                   # nodes, requirements, expressions, types
dmnctl add file.dmn --type decision --name "Approve"                   # decision/input-data/bkm/knowledge-source/decision-service/text-annotation
dmnctl connect file.dmn <source> <target>           # picks the right DMN requirement kind
dmnctl rm file.dmn <id>                             # remove node + requirements referencing it
dmnctl set file.dmn <id> --name ... --type-ref number
dmnctl set-expression file.dmn <decision> --feel "if income > 5000 then true else false"
dmnctl set-expression file.dmn <decision> --table table.json          # decision table
dmnctl layout file.dmn                              # regenerate DMNDI (elkjs)
dmnctl render file.dmn -o out.svg
dmnctl lint-feel file.dmn [--json]                  # offline FEEL syntax check
dmnctl validate file.dmn [--json] [--jit <url>]     # structural (+ full kie-dmn-validator via jitexecutor)
dmnctl eval file.dmn --context '{"income": 9000}' [--jit <url>]
```

### scesimctl — edit `.scesim` test scenarios

```sh
scesimctl new test.scesim --dmn model.dmn           # columns derived from DMN inputs/decisions (--rule for DRL-based)
scesimctl describe test.scesim [--json]             # settings, columns, rows
scesimctl add-column test.scesim --given "Applicant.Age" --type number    # or --expect "<decision name>"
scesimctl rm-column test.scesim <name>
scesimctl add-row test.scesim --values '{"Applicant.Age": 30, "Approved": true}'   # or --values @row.json
scesimctl set-cell test.scesim --row 1 --column <name> --value 42     # rows are 1-based
scesimctl rm-row test.scesim <n>
scesimctl sync-dmn test.scesim [--dmn model.dmn]    # add columns for new DMN inputs/decisions
scesimctl validate test.scesim [--json]             # structure + cross-check against the DMN
```

### kogito-trace — debug running process instances

```sh
kogito-trace instances [--url <graphql>] [--process <id>] [--state ERROR] [--limit 20] [--json]
kogito-trace trace <instanceId> [--url <graphql>] [--json]    # timeline, error, user tasks, variables
```

Endpoint resolution: `--url` → `DATA_INDEX_URL` env var → `http://localhost:8180/graphql`.

### drlcheck — compile-check and dry-run `.drl` rules

```sh
drlcheck setup                                      # one-time: build + cache the Drools runner (needs Java 17 + Maven)
drlcheck compile rules.drl [more.drl ...] [--json]  # line/column diagnostics, exit 1 on errors
drlcheck describe rules.drl [--json]                # rules + declared fact types
drlcheck run rules.drl --facts '[{"type":"Applicant","data":{"age":30}}]' [--json]   # or --facts @facts.json
```

### kie-doctor — lint cross-asset references

```sh
kie-doctor src/main/resources [--json]              # exit 0 clean, 1 broken references found
```

Checks BPMN call activities → process ids, rule tasks → DRL ruleflow-groups and DMN models, DMN imports, and scesim → DMN links.

## Agent skills

Reusable skills for coding agents live in [`.agents/skills/`](.agents/skills):

- [`bpmn-editing`](.agents/skills/bpmn-editing/SKILL.md) — edit `.bpmn` files with `bpmnctl`, never raw XML
- [`dmn-editing`](.agents/skills/dmn-editing/SKILL.md) — edit `.dmn` files with `dmnctl`, never raw XML
- [`scesim-editing`](.agents/skills/scesim-editing/SKILL.md) — edit `.scesim` test scenarios with `scesimctl`, never raw XML
- [`kogito-trace`](.agents/skills/kogito-trace/SKILL.md) — debug process instances via the Data Index instead of grepping logs
- [`drl-authoring`](.agents/skills/drl-authoring/SKILL.md) — compile-check and dry-run `.drl` rules with `drlcheck` before any full build
- [`kie-doctor`](.agents/skills/kie-doctor/SKILL.md) — lint cross-asset references after renaming/moving assets or editing links between them

## Development

npm workspaces (bpmnctl is plain ESM JavaScript; the other packages are strict TypeScript):

```sh
npm install
npm run build   # all packages
npm test        # all packages
```

## License

Apache-2.0
