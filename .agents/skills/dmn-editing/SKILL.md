---
name: dmn-editing
description: Edit DMN decision models (Apache KIE / Kogito / Drools) safely with dmnctl instead of raw XML. Use whenever a task involves creating or modifying .dmn files.
---

# Editing DMN files with dmnctl

Never hand-edit DMN XML. Raw edits break the DMNDI diagram section, drop required `variable` elements, and leave dangling requirement references — the KIE/Kogito editors will then fail to open the file. Use `dmnctl` (in `packages/dmnctl` of this repo) for all DMN changes; it edits the semantic model through the official KIE marshaller and regenerates diagram coordinates automatically.

## Workflow

1. **Inspect first**: `dmnctl describe file.dmn --json` — node ids/names, requirement links, expressions, item definitions.
2. **Edit semantically**:
   - `dmnctl add file.dmn --type input-data --name "Credit Score" --type-ref number`
   - `dmnctl add file.dmn --type decision --name "Preapproval" --type-ref boolean`
   - `dmnctl connect file.dmn "Credit Score" "Preapproval"` (picks the right requirement kind automatically)
   - `dmnctl set-expression file.dmn Preapproval --feel "Credit Score >= 700" --type-ref boolean`
   - `dmnctl set-expression file.dmn Preapproval --table table.json` (see README for the JSON shape)
   - `dmnctl set file.dmn <id> --name "New Name"` renames the node *and* its variable together — never rename via XML.
   - `dmnctl rm file.dmn <id>` removes a node and every requirement that references it.
3. **Verify**: `dmnctl validate file.dmn --json` after every batch of edits. Fix all `error` issues; `feel-syntax` errors usually mean an expression references a variable that doesn't exist (names are case- and space-sensitive).
4. **Visual check**: `dmnctl render file.dmn -o file.svg` and view the SVG.

## Rules

- Names with spaces are fine as arguments (`"Credit Score"`); every `<id>` argument also accepts the node name.
- Node types: `input-data`, `decision`, `bkm`, `knowledge-source`, `decision-service`, `text-annotation`.
- If you ever had to touch the XML directly (e.g. merge conflict), run `dmnctl layout file.dmn` afterward to rebuild all diagram coordinates, then `dmnctl validate`.
- FEEL expressions may reference other DRG nodes by name, including multi-word names — `lint-feel` knows the model's variables.
- With a running KIE jitexecutor, `dmnctl validate --jit <url>` runs the full kie-dmn-validator and `dmnctl eval --context '{...}' --jit <url>` actually evaluates the decisions — use these for behavioral verification when available.
