# kie-agent-tools

Agent-oriented CLI tools for the Apache KIE / Kogito / Drools ecosystem. AI coding agents are bad at editing KIE's XML asset formats directly (broken diagram interchange, dangling references, index-based grids); these tools expose the assets through semantic, deterministic CLIs with JSON output so agents can maintain, debug, and test KIE projects reliably.

## Packages

| Package | Status | What it does |
| --- | --- | --- |
| [`packages/bpmnctl`](packages/bpmnctl) | ready | Semantic BPMN 2.0 editing (Kogito/jBPM `drools:` extensions preserved) with automatic diagram layout, lint, and SVG render |
| [`packages/dmnctl`](packages/dmnctl) | ready | Semantic DMN editing with automatic diagram layout, FEEL linting, structural validation, and validate/eval via KIE jitexecutor |
| [`packages/scesimctl`](packages/scesimctl) | ready | Semantic editing and validation of `.scesim` test scenarios, with columns derived from the DMN model |
| [`packages/kogito-trace`](packages/kogito-trace) | ready | Process-instance execution traces (timeline, errors, user tasks, variables) via the Data Index GraphQL API |
| `drlcheck` | planned | Fast DRL compile-check and rule-firing dry runs |
| `kie-doctor` | planned | Cross-asset broken-reference lint (BPMN ↔ DMN ↔ DRL ↔ scesim) |

## Agent skills

Reusable skills for coding agents live in [`.agents/skills/`](.agents/skills):

- [`bpmn-editing`](.agents/skills/bpmn-editing/SKILL.md) — edit `.bpmn` files with `bpmnctl`, never raw XML
- [`dmn-editing`](.agents/skills/dmn-editing/SKILL.md) — edit `.dmn` files with `dmnctl`, never raw XML
- [`scesim-editing`](.agents/skills/scesim-editing/SKILL.md) — edit `.scesim` test scenarios with `scesimctl`, never raw XML
- [`kogito-trace`](.agents/skills/kogito-trace/SKILL.md) — debug process instances via the Data Index instead of grepping logs

## Development

npm workspaces (bpmnctl is plain ESM JavaScript; dmnctl, scesimctl, and kogito-trace are strict TypeScript):

```sh
npm install
npm run build   # all packages
npm test        # all packages
```

## License

Apache-2.0
