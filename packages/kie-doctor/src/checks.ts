import fs from "node:fs";
import path from "node:path";
import type { Finding, ProjectIndex } from "./types.js";

function rel(root: string, file: string): string {
  return path.relative(root, file) || file;
}

function resolveAsset(root: string, fromFile: string, ref: string): string | undefined {
  const candidates = [path.resolve(root, ref), path.resolve(path.dirname(fromFile), ref)];
  return candidates.find((c) => fs.existsSync(c));
}

export function runChecks(index: ProjectIndex): Finding[] {
  const findings: Finding[] = [];
  const add = (f: Finding): void => {
    findings.push(f);
  };

  for (const asset of [...index.bpmn, ...index.dmn, ...index.scesim]) {
    if (asset.parseError !== undefined) {
      add({
        severity: "error",
        rule: "parse-error",
        file: rel(index.root, asset.file),
        message: `failed to parse: ${asset.parseError}`,
      });
    }
  }

  const processIds = new Set(index.bpmn.flatMap((b) => b.processIds));
  const dmnByNamespace = new Map(index.dmn.filter((d) => d.namespace !== undefined).map((d) => [d.namespace, d]));
  const drlGroups = new Set(index.drl.flatMap((d) => d.ruleFlowGroups));
  const usedGroups = new Set<string>();

  for (const bpmn of index.bpmn) {
    const file = rel(index.root, bpmn.file);
    for (const call of bpmn.callActivities) {
      if (call.calledElement === undefined || call.calledElement === "") {
        add({
          severity: "error",
          rule: "call-activity-missing-called-element",
          file,
          message: `call activity "${call.name ?? call.id}" has no calledElement`,
        });
      } else if (!processIds.has(call.calledElement)) {
        add({
          severity: "error",
          rule: "call-activity-unknown-process",
          file,
          message: `call activity "${call.name ?? call.id}" calls process "${call.calledElement}" but no scanned BPMN file defines it`,
        });
      }
    }
    for (const task of bpmn.ruleTasks) {
      const label = task.name ?? task.id;
      if (task.ruleFlowGroup !== undefined) {
        usedGroups.add(task.ruleFlowGroup);
        if (!drlGroups.has(task.ruleFlowGroup)) {
          add({
            severity: "error",
            rule: "rule-task-unknown-ruleflow-group",
            file,
            message: `business rule task "${label}" uses ruleflow-group "${task.ruleFlowGroup}" but no scanned DRL file declares it`,
          });
        }
      }
      if (task.dmnFileName !== undefined) {
        const resolved = resolveAsset(index.root, bpmn.file, task.dmnFileName);
        if (resolved === undefined) {
          add({
            severity: "error",
            rule: "rule-task-dmn-file-missing",
            file,
            message: `business rule task "${label}" references DMN file "${task.dmnFileName}" which does not exist`,
          });
        }
      }
      if (task.dmnNamespace !== undefined) {
        const dmn = dmnByNamespace.get(task.dmnNamespace);
        if (dmn === undefined) {
          add({
            severity: "error",
            rule: "rule-task-dmn-namespace-unknown",
            file,
            message: `business rule task "${label}" binds DMN namespace "${task.dmnNamespace}" but no scanned DMN file has it`,
          });
        } else if (task.dmnModelName !== undefined && dmn.name !== task.dmnModelName) {
          add({
            severity: "error",
            rule: "rule-task-dmn-model-mismatch",
            file,
            message: `business rule task "${label}" binds DMN model "${task.dmnModelName}" but ${rel(index.root, dmn.file)} is named "${dmn.name ?? "?"}"`,
          });
        }
      }
    }
  }

  for (const dmn of index.dmn) {
    const file = rel(index.root, dmn.file);
    for (const imp of dmn.imports) {
      const isDmnImport = imp.importType === undefined || /dmn/i.test(imp.importType);
      if (!isDmnImport || imp.namespace === undefined) continue;
      if (!dmnByNamespace.has(imp.namespace)) {
        add({
          severity: "error",
          rule: "dmn-import-unknown-namespace",
          file,
          message: `imports DMN namespace "${imp.namespace}" but no scanned DMN file has it`,
        });
      }
    }
  }

  for (const scesim of index.scesim) {
    const file = rel(index.root, scesim.file);
    if (scesim.type !== "DMN") continue;
    if (scesim.dmnFilePath === undefined) {
      add({
        severity: "error",
        rule: "scesim-missing-dmn-path",
        file,
        message: "DMN test scenario has no settings.dmnFilePath",
      });
      continue;
    }
    const resolved = resolveAsset(index.root, scesim.file, scesim.dmnFilePath);
    if (resolved === undefined) {
      add({
        severity: "error",
        rule: "scesim-dmn-file-missing",
        file,
        message: `settings.dmnFilePath "${scesim.dmnFilePath}" does not exist`,
      });
      continue;
    }
    const dmn = index.dmn.find((d) => path.resolve(d.file) === resolved);
    if (dmn === undefined) continue;
    if (scesim.dmnNamespace !== undefined && dmn.namespace !== undefined && scesim.dmnNamespace !== dmn.namespace) {
      add({
        severity: "error",
        rule: "scesim-dmn-namespace-mismatch",
        file,
        message: `settings.dmnNamespace "${scesim.dmnNamespace}" does not match "${dmn.namespace}" in ${rel(index.root, dmn.file)}`,
      });
    }
    if (scesim.dmnName !== undefined && dmn.name !== undefined && scesim.dmnName !== dmn.name) {
      add({
        severity: "warning",
        rule: "scesim-dmn-name-mismatch",
        file,
        message: `settings.dmnName "${scesim.dmnName}" does not match "${dmn.name}" in ${rel(index.root, dmn.file)}`,
      });
    }
  }

  for (const drl of index.drl) {
    const file = rel(index.root, drl.file);
    for (const group of drl.ruleFlowGroups) {
      if (!usedGroups.has(group)) {
        add({
          severity: "warning",
          rule: "drl-orphan-ruleflow-group",
          file,
          message: `ruleflow-group "${group}" is not activated by any scanned BPMN business rule task`,
        });
      }
    }
  }

  return findings;
}
