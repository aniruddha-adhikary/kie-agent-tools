# scesimctl

Semantic CLI for KIE / Kogito / Drools `.scesim` test scenario files, built for AI coding
agents. `.scesim` files are grid-based XML where columns and cells are linked by internal
identifiers — hand-editing the XML breaks the grid. `scesimctl` edits the grid semantically
through the official `@kie-tools/scesim-marshaller`.

## Commands

```sh
scesimctl new <file> --dmn <model.dmn>       # DMN scenario; columns derived from inputs/decisions
scesimctl new <file> --rule [--session s] [--rule-flow-group g]
scesimctl describe <file> [--json]           # settings, columns, rows
scesimctl add-column <file> --given <path> --type <t>
scesimctl add-column <file> --expect <path> --type <t>
scesimctl rm-column <file> <name>
scesimctl add-row <file> --values '{"Col": "val", ...}' [--description d]
scesimctl set-cell <file> --row <n> --column <name> --value <v>
scesimctl rm-row <file> <n>
scesimctl sync-dmn <file> [--dmn <model.dmn>]   # add columns for new DMN inputs/decisions
scesimctl validate <file> [--json] [--dmn <model.dmn>]
```

Column names are expression paths: `Credit Score` for a simple input, `Applicant.Age` for a
field of a structured input. `new --dmn` and `sync-dmn` expand structured types (one level)
into per-field columns automatically.

`validate` checks grid integrity (duplicate columns, orphan cells, missing EXPECT columns)
and — when the DMN model is resolvable — cross-checks every column and the recorded
namespace against the model.

Cell values are FEEL expressions for DMN scenarios (e.g. `720`, `"yes"`, `true`).

## Development

```sh
npm install
npm test        # typecheck + bundle + CLI tests
```
