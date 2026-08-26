import {
  type ScesimModel,
  factMappings,
  scenarios,
  columnName,
  isDataColumn,
} from "./model.js";
import { readDmnModel } from "./dmnsync.js";

export interface Finding {
  severity: "error" | "warning";
  rule: string;
  message: string;
}

export function structuralChecks(model: ScesimModel, opts: { dmnFile?: string } = {}): Finding[] {
  const findings: Finding[] = [];
  const cols = factMappings(model).filter(isDataColumn);
  const names = cols.map(columnName);

  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      findings.push({ severity: "error", rule: "duplicate-column", message: `duplicate column "${name}"` });
    }
    seen.add(name);
  }

  if (!model.settings.type?.__$$text) {
    findings.push({ severity: "error", rule: "missing-type", message: "settings.type is missing (DMN or RULE)" });
  }
  if (model.settings.type?.__$$text === "DMN" && !model.settings.dmnFilePath?.__$$text) {
    findings.push({ severity: "error", rule: "missing-dmn-path", message: "DMN scenario has no dmnFilePath" });
  }

  if (cols.length === 0) {
    findings.push({ severity: "warning", rule: "no-columns", message: "no GIVEN/EXPECT columns defined" });
  }
  if (!cols.some((fm) => fm.expressionIdentifier.type?.__$$text === "EXPECT")) {
    findings.push({ severity: "warning", rule: "no-expect", message: "no EXPECT columns — scenarios assert nothing" });
  }

  const colIds = new Set(cols.map((fm) => fm.expressionIdentifier.name?.__$$text));
  scenarios(model).forEach((row, i) => {
    for (const v of row.factMappingValues.FactMappingValue ?? []) {
      const id = v.expressionIdentifier.name?.__$$text;
      if (id !== undefined && id !== "Index" && id !== "Description" && !colIds.has(id)) {
        findings.push({
          severity: "error",
          rule: "orphan-cell",
          message: `row ${i + 1} has a value for unknown column id "${id}"`,
        });
      }
    }
  });

  if (opts.dmnFile) {
    const dmn = readDmnModel(opts.dmnFile);
    const dmnPaths = new Set(dmn.columns.map((c) => c.path));
    const dmnFacts = new Set(dmn.columns.map((c) => c.path.split(".")[0]));
    for (const name of names) {
      const fact = name.split(".")[0] ?? name;
      if (!dmnPaths.has(name) && !dmnFacts.has(fact)) {
        findings.push({
          severity: "error",
          rule: "unknown-dmn-node",
          message: `column "${name}" does not match any input/decision in the DMN model`,
        });
      }
    }
    const dmnName = model.settings.dmnName?.__$$text;
    if (dmnName !== undefined && dmnName !== dmn.name) {
      findings.push({
        severity: "warning",
        rule: "dmn-name-mismatch",
        message: `settings.dmnName "${dmnName}" != DMN model name "${dmn.name}"`,
      });
    }
    const ns = model.settings.dmnNamespace?.__$$text;
    if (ns !== undefined && ns !== dmn.namespace) {
      findings.push({
        severity: "error",
        rule: "dmn-namespace-mismatch",
        message: `settings.dmnNamespace does not match the DMN model namespace`,
      });
    }
  }

  return findings;
}
