import { type Definitions, allElements, drgElements } from "./model.js";
import { collectEdges } from "./layout.js";
import { lintModelFeel } from "./feel.js";

export interface ValidationIssue {
  severity: "error" | "warning";
  rule: string;
  message: string;
}

export function structuralChecks(definitions: Definitions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const all = allElements(definitions);

  const seen = new Map<string, number>();
  for (const el of all) {
    const id = el["@_id"];
    if (!id) {
      issues.push({ severity: "error", rule: "missing-id", message: `a ${el.__$$element} has no id` });
      continue;
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push({ severity: "error", rule: "duplicate-id", message: `id "${id}" is used ${count} times` });
    }
  }

  const ids = new Set(seen.keys());
  for (const e of collectEdges(definitions)) {
    if (!ids.has(e.source)) {
      issues.push({ severity: "error", rule: "dangling-ref", message: `requirement ${e.id} references missing element "${e.source}"` });
    }
    if (!ids.has(e.target)) {
      issues.push({ severity: "error", rule: "dangling-ref", message: `requirement ${e.id} references missing element "${e.target}"` });
    }
  }

  const names = new Map<string, number>();
  for (const el of drgElements(definitions)) {
    const name = el["@_name"];
    if (!name) continue;
    names.set(name, (names.get(name) ?? 0) + 1);
    if ("variable" in el && el.variable && el.variable["@_name"] !== name) {
      issues.push({
        severity: "warning",
        rule: "variable-name-mismatch",
        message: `${el.__$$element} "${name}" has variable named "${el.variable["@_name"]}" (must match)`,
      });
    }
  }
  for (const [name, count] of names) {
    if (count > 1) {
      issues.push({ severity: "error", rule: "duplicate-name", message: `DRG element name "${name}" is used ${count} times` });
    }
  }

  for (const el of drgElements(definitions)) {
    if (el.__$$element === "decision" && !el.expression) {
      issues.push({
        severity: "warning",
        rule: "decision-without-logic",
        message: `decision "${el["@_name"]}" has no expression (set one with: dmnctl set-expression)`,
      });
    }
  }

  for (const issue of lintModelFeel(definitions)) {
    issues.push({
      severity: "error",
      rule: "feel-syntax",
      message: `${issue.where}: ${issue.message} (in: ${issue.expression})`,
    });
  }

  return issues;
}
