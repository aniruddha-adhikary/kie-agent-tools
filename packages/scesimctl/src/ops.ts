import {
  type ScesimModel,
  type FactMapping,
  type Scenario,
  factMappings,
  scenarios,
  columnName,
  isDataColumn,
  findColumn,
} from "./model.js";

export interface AddColumnOpts {
  kind: "GIVEN" | "EXPECT";
  /** Full expression path, e.g. "Credit Score" or "Applicant.Age". First segment is the fact. */
  path: string;
  /** Type of the cell values (FEEL type for DMN scesim, Java class for RULE). */
  type: string;
  /** Type of the fact itself; defaults to `type` for single-segment paths. */
  factType?: string;
}

function nextExpressionName(model: ScesimModel): string {
  let max = 0;
  for (const fm of factMappings(model)) {
    const m = /^\d+\|(\d+)$/.exec(fm.expressionIdentifier.name?.__$$text ?? "");
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return `1|${max + 1}`;
}

export function addColumn(model: ScesimModel, opts: AddColumnOpts): FactMapping {
  const segments = opts.path.split(".").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) throw new Error("empty column path");
  const fact = segments[0];
  if (!fact) throw new Error("empty column path");
  const cols = factMappings(model);
  if (cols.some((fm) => isDataColumn(fm) && columnName(fm) === opts.path)) {
    throw new Error(`column "${opts.path}" already exists`);
  }
  const factType = opts.factType ?? (segments.length === 1 ? opts.type : fact);
  const fm: FactMapping = {
    expressionElements: { ExpressionElement: segments.map((s) => ({ step: { __$$text: s } })) },
    expressionIdentifier: {
      name: { __$$text: nextExpressionName(model) },
      type: { __$$text: opts.kind },
    },
    factIdentifier: { name: { __$$text: fact }, className: { __$$text: factType } },
    className: { __$$text: opts.type },
    factAlias: { __$$text: fact },
    expressionAlias: { __$$text: segments.length === 1 ? "value" : segments.slice(1).join(".") },
    columnWidth: { __$$text: 150 },
  };
  cols.push(fm);
  // keep every existing row aligned with the new column
  for (const row of scenarios(model)) {
    (row.factMappingValues.FactMappingValue ??= []).push({
      factIdentifier: fm.factIdentifier,
      expressionIdentifier: fm.expressionIdentifier,
    });
  }
  return fm;
}

export function removeColumn(model: ScesimModel, name: string): FactMapping {
  const fm = findColumn(model, name);
  const cols = factMappings(model);
  cols.splice(cols.indexOf(fm), 1);
  for (const row of scenarios(model)) {
    const values = row.factMappingValues.FactMappingValue ?? [];
    row.factMappingValues.FactMappingValue = values.filter(
      (v) => v.expressionIdentifier.name?.__$$text !== fm.expressionIdentifier.name?.__$$text
    );
  }
  return fm;
}

function valueFor(row: Scenario, fm: FactMapping) {
  return (row.factMappingValues.FactMappingValue ?? []).find(
    (v) => v.expressionIdentifier.name?.__$$text === fm.expressionIdentifier.name?.__$$text
  );
}

export function addRow(model: ScesimModel, values: Record<string, string>, description?: string): number {
  const cols = factMappings(model).filter(isDataColumn);
  const known = new Set(cols.map(columnName));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) {
      throw new Error(`unknown column "${key}". Known columns: ${[...known].join(", ") || "none"}`);
    }
  }
  const row: Scenario = {
    factMappingValues: {
      FactMappingValue: [
        {
          factIdentifier: { name: { __$$text: "Scenario description" }, className: { __$$text: "java.lang.String" } },
          expressionIdentifier: { name: { __$$text: "Description" }, type: { __$$text: "OTHER" } },
          ...(description !== undefined ? { rawValue: { __$$text: description } } : {}),
        },
        ...cols.map((fm) => ({
          factIdentifier: fm.factIdentifier,
          expressionIdentifier: fm.expressionIdentifier,
          ...(values[columnName(fm)] !== undefined
            ? { rawValue: { __$$text: values[columnName(fm)] as string } }
            : {}),
        })),
      ],
    },
  };
  const rows = scenarios(model);
  rows.push(row);
  return rows.length;
}

export function setCell(model: ScesimModel, rowIndex: number, column: string, value: string): void {
  const rows = scenarios(model);
  const row = rows[rowIndex - 1];
  if (!row) throw new Error(`no row ${rowIndex} (rows are 1-based; file has ${rows.length})`);
  const fm = findColumn(model, column);
  const existing = valueFor(row, fm);
  if (existing) {
    existing.rawValue = { __$$text: value };
  } else {
    (row.factMappingValues.FactMappingValue ??= []).push({
      factIdentifier: fm.factIdentifier,
      expressionIdentifier: fm.expressionIdentifier,
      rawValue: { __$$text: value },
    });
  }
}

export function removeRow(model: ScesimModel, rowIndex: number): void {
  const rows = scenarios(model);
  if (rowIndex < 1 || rowIndex > rows.length) {
    throw new Error(`no row ${rowIndex} (rows are 1-based; file has ${rows.length})`);
  }
  rows.splice(rowIndex - 1, 1);
}

export function cellText(model: ScesimModel, row: Scenario, fm: FactMapping): string | undefined {
  return valueFor(row, fm)?.rawValue?.__$$text;
}

export function rowDescription(row: Scenario): string | undefined {
  return (row.factMappingValues.FactMappingValue ?? []).find(
    (v) => v.expressionIdentifier.name?.__$$text === "Description"
  )?.rawValue?.__$$text;
}
