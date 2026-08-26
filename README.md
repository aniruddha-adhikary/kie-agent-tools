# kie-agent-tools

Agent-oriented CLI tools for the Apache KIE / Kogito / Drools ecosystem. AI coding agents are bad at editing KIE's XML asset formats directly (broken diagram interchange, dangling references, index-based grids); these tools expose the assets through semantic, deterministic CLIs with JSON output so agents can maintain, debug, and test KIE projects reliably.

## Packages

| Package | Status | What it does |
| --- | --- | --- |
| [`packages/bpmnctl`](packages/bpmnctl) | ready | Semantic BPMN 2.0 editing (Kogito/jBPM `drools:` extensions preserved) with automatic diagram layout, lint, and SVG render |
| [`packages/dmnctl`](packages/dmnctl) | ready | Semantic DMN editing with automatic diagram layout, FEEL linting, structural validation, and validate/eval via KIE jitexecutor |
| `scesimctl` | planned | Scaffold/edit/run `.scesim` test scenarios |
| `kogito-trace` | planned | Process-instance execution traces via Data Index GraphQL |
| `drlcheck` | planned | Fast DRL compile-check and rule-firing dry runs |
| `kie-doctor` | planned | Cross-asset broken-reference lint (BPMN ↔ DMN ↔ DRL ↔ scesim) |

## Agent skills

Reusable skills for coding agents live in [`.agents/skills/`](.agents/skills):

- [`bpmn-editing`](.agents/skills/bpmn-editing/SKILL.md) — edit `.bpmn` files with `bpmnctl`, never raw XML
- [`dmn-editing`](.agents/skills/dmn-editing/SKILL.md) — edit `.dmn` files with `dmnctl`, never raw XML

## Development

npm workspaces (bpmnctl is plain ESM JavaScript, dmnctl is strict TypeScript):

```sh
npm install
npm run build   # all packages
npm test        # all packages
```

## License

Apache-2.0
