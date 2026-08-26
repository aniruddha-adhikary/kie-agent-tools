import {
  type ScesimModel,
  factMappings,
  scenarios,
  columnName,
  isDataColumn,
} from "./model.js";
import { cellText, rowDescription } from "./ops.js";

export interface ColumnInfo {
  name: string;
  kind: string;
  type: string;
  fact: string;
}

export interface RowInfo {
  index: number;
  description?: string;
  values: Record<string, string | null>;
}

export interface ModelDescription {
  type?: string;
  dmnFilePath?: string;
  dmnName?: string;
  dmnNamespace?: string;
  dmoSession?: string;
  ruleFlowGroup?: string;
  skipFromBuild?: boolean;
  columns: ColumnInfo[];
  rows: RowInfo[];
}

export function describeModel(model: ScesimModel): ModelDescription {
  const cols = factMappings(model).filter(isDataColumn);
  const columns: ColumnInfo[] = cols.map((fm) => ({
    name: columnName(fm),
    kind: fm.expressionIdentifier.type?.__$$text ?? "?",
    type: fm.className.__$$text,
    fact: fm.factAlias.__$$text,
  }));
  const rows: RowInfo[] = scenarios(model).map((row, i) => {
    const values: Record<string, string | null> = {};
    for (const fm of cols) values[columnName(fm)] = cellText(model, row, fm) ?? null;
    const description = rowDescription(row);
    return { index: i + 1, ...(description !== undefined ? { description } : {}), values };
  });
  const s = model.settings;
  return {
    ...(s.type?.__$$text !== undefined ? { type: s.type.__$$text } : {}),
    ...(s.dmnFilePath?.__$$text !== undefined ? { dmnFilePath: s.dmnFilePath.__$$text } : {}),
    ...(s.dmnName?.__$$text !== undefined ? { dmnName: s.dmnName.__$$text } : {}),
    ...(s.dmnNamespace?.__$$text !== undefined ? { dmnNamespace: s.dmnNamespace.__$$text } : {}),
    ...(s.dmoSession?.__$$text !== undefined ? { dmoSession: s.dmoSession.__$$text } : {}),
    ...(s.ruleFlowGroup?.__$$text !== undefined ? { ruleFlowGroup: s.ruleFlowGroup.__$$text } : {}),
    ...(s.skipFromBuild?.__$$text !== undefined ? { skipFromBuild: s.skipFromBuild.__$$text } : {}),
    columns,
    rows,
  };
}

export function describeText(d: ModelDescription): string {
  const lines: string[] = [];
  lines.push(`type: ${d.type ?? "?"}`);
  if (d.dmnFilePath) lines.push(`dmn: ${d.dmnFilePath} (${d.dmnName ?? "?"})`);
  if (d.dmoSession) lines.push(`session: ${d.dmoSession}`);
  if (d.ruleFlowGroup) lines.push(`ruleFlowGroup: ${d.ruleFlowGroup}`);
  lines.push("");
  lines.push("columns:");
  for (const c of d.columns) lines.push(`  [${c.kind}] ${c.name}: ${c.type}`);
  lines.push("");
  lines.push(`rows (${d.rows.length}):`);
  for (const r of d.rows) {
    const cells = d.columns.map((c) => `${c.name}=${r.values[c.name] ?? "∅"}`).join("  ");
    lines.push(`  ${r.index}. ${r.description ?? ""}`.trimEnd());
    lines.push(`     ${cells}`);
  }
  return lines.join("\n");
}
