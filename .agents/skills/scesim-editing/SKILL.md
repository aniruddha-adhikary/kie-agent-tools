---
name: scesim-editing
description: Create and edit KIE/Kogito .scesim test scenario files safely with scesimctl instead of raw XML. Use whenever a task involves creating or modifying .scesim files.
---

# Editing .scesim test scenarios with scesimctl

Never hand-edit `.scesim` XML. The format is a grid where every cell is linked to its column
by internal `expressionIdentifier`/`factIdentifier` pairs — raw edits silently desynchronize
the grid and the KIE editors/test runner reject the file. Use `scesimctl` (in
`packages/scesimctl` of this repo); it edits the grid semantically through the official KIE
scesim marshaller.

## Workflow

1. **Create from the DMN model** (columns are derived automatically):
   `scesimctl new tests.scesim --dmn src/main/resources/loan.dmn`
   For DRL-based tests: `scesimctl new tests.scesim --rule --session default`.
2. **Inspect**: `scesimctl describe tests.scesim --json` — settings, columns (with GIVEN/EXPECT
   kind and type), and all rows.
3. **Edit rows**:
   - `scesimctl add-row tests.scesim --values '{"Credit Score": "720", "Approval": "true"}' --description "good credit"`
   - `scesimctl set-cell tests.scesim --row 2 --column "Applicant.Age" --value 41`
   - `scesimctl rm-row tests.scesim 3`
4. **Keep columns in sync with the DMN model**: after adding inputs/decisions to the DMN, run
   `scesimctl sync-dmn tests.scesim` — it adds only the missing columns.
5. **Verify**: `scesimctl validate tests.scesim --json` after every batch. Fix all `error`
   findings; `unknown-dmn-node` means a column no longer matches any DMN input/decision.

## Rules

- Column names are expression paths: `Credit Score` (simple input) or `Applicant.Age`
  (field of a structured input). Get the exact names from `describe`.
- Cell values are FEEL expressions for DMN scenarios: numbers `720`, strings `"yes"`,
  booleans `true`. Leave a cell out of `--values` to keep it empty.
- Rows are 1-based everywhere.
- EXPECT columns are the assertions — a scenario file with no EXPECT column tests nothing
  (`validate` warns about this).
- Running scenarios requires a Kogito build (`mvn test`); scesimctl covers authoring and
  static validation only.
