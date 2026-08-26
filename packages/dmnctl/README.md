# dmnctl

Semantic DMN editing for AI coding agents (and humans) in the Apache KIE / Kogito / Drools ecosystem.

Agents editing raw DMN XML break diagram interchange (DMNDI), forget `variable` elements, and produce dangling requirement references. `dmnctl` exposes DMN editing as semantic operations built on the official `@kie-tools/dmn-marshaller`: every mutation keeps the semantic model consistent and regenerates diagram coordinates automatically (elkjs), so agents never touch coordinates or DI XML.

## Install

```sh
npm install
npm run build   # typechecks (strict TS) and bundles dist/cli.cjs
```

Run via `bin/dmnctl.js` (or `npm link` to get `dmnctl` on your PATH).

## Commands

```text
dmnctl new <file> --name <name>                     create an empty model (DMN 1.6 / 20230324)
dmnctl describe <file> [--json]                     summarize nodes, requirements, expressions, types
dmnctl add <file> --type <t> [--name] [--type-ref]  add a DRG node or text annotation
dmnctl connect <file> <source> <target>             add the appropriate DMN requirement (or association)
dmnctl rm <file> <id>                               remove a node + all requirements referencing it
dmnctl set <file> <id> [--name] [--type-ref]        rename (node + variable together) / retype
dmnctl set-expression <file> <decision> --feel <e>  set a FEEL literal expression
dmnctl set-expression <file> <decision> --table <f> set a decision table from JSON
dmnctl layout <file>                                regenerate all DMNDI coordinates
dmnctl render <file> [-o out.svg]                   render the diagram to SVG for visual checks
dmnctl lint-feel <file> [--json]                    offline FEEL syntax check of all expressions
dmnctl validate <file> [--json] [--jit <url>]       structural + FEEL checks; full validator via jitexecutor
dmnctl eval <file> --context <json> [--jit <url>]   evaluate the model via jitexecutor
```

Node types for `add --type`: `input-data`, `decision`, `bkm`, `knowledge-source`, `decision-service`, `text-annotation`.

Everywhere an `<id>` is accepted, the node **name** works too (e.g. `"Credit Score"`).

## Example

```sh
dmnctl new loan.dmn --name "Loan Approval"
dmnctl add loan.dmn --type input-data --name "Credit Score" --type-ref number
dmnctl add loan.dmn --type decision --name "Preapproval" --type-ref boolean
dmnctl connect loan.dmn "Credit Score" "Preapproval"
dmnctl set-expression loan.dmn Preapproval --feel "Credit Score >= 700" --type-ref boolean
dmnctl validate loan.dmn
dmnctl render loan.dmn -o loan.svg
```

Decision table JSON for `set-expression --table`:

```json
{
  "hitPolicy": "FIRST",
  "inputs": [{ "expression": "Credit Score", "typeRef": "number" }],
  "outputs": [{ "name": "Preapproval", "typeRef": "boolean" }],
  "rules": [
    { "when": [">= 700"], "then": ["true"] },
    { "when": ["-"], "then": ["false"] }
  ]
}
```

## Validation and evaluation

`validate` runs offline structural checks (duplicate IDs/names, dangling requirement references, name/variable mismatches, decisions without logic) plus FEEL syntax linting via the official KIE FEEL grammar (`@kie-tools/dmn-feel-antlr4-parser`), with all DRG variable names in scope so multi-word names like `Credit Score` parse correctly.

For the full `kie-dmn-validator` and actual evaluation, point at a running [KIE jitexecutor](https://github.com/apache/incubator-kie-tools/tree/main/packages/extended-services-java) with `--jit <url>` or `JITEXECUTOR_URL`:

```sh
dmnctl validate loan.dmn --jit http://localhost:21345
dmnctl eval loan.dmn --context '{"Credit Score": 720}' --jit http://localhost:21345
```

## Compatibility

Files parse through `@kie-tools/dmn-marshaller` (the marshaller behind the KIE DMN editor / Kogito tooling): DMN 1.0–1.5 inputs are upgraded to the latest supported version on save, and KIE extensions, item definitions, and existing content are preserved.

## Development

```sh
npm run typecheck   # tsc --noEmit, strict
npm test            # builds, then runs the CLI test suite
```
