import fs from "node:fs";
import path from "node:path";
import "@kie-tools/xml-parser-ts/dist/node/index.js";
import { getMarshaller as getBpmnMarshaller } from "@kie-tools/bpmn-marshaller";
import "@kie-tools/bpmn-marshaller/dist/drools-extension.js";
import type {
  BPMN20__tBusinessRuleTask,
  BPMN20__tCallActivity,
  BPMN20__tProcess,
} from "@kie-tools/bpmn-marshaller/dist/schemas/bpmn-2_0/ts-gen/types.js";
import { getMarshaller as getDmnMarshaller } from "@kie-tools/dmn-marshaller";
import { getMarshaller as getScesimMarshaller } from "@kie-tools/scesim-marshaller";
import type {
  BpmnAsset,
  BpmnCallActivity,
  BpmnRuleTask,
  DmnAsset,
  DrlAsset,
  ProjectIndex,
  ScesimAsset,
} from "./types.js";

const SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", ".git"]);

export function scanFiles(root: string): Map<string, string[]> {
  const byExt = new Map<string, string[]>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      const key = ext === ".bpmn2" ? ".bpmn" : ext;
      if ([".bpmn", ".dmn", ".drl", ".scesim"].includes(key)) {
        const list = byExt.get(key) ?? [];
        list.push(path.join(dir, entry.name));
        byExt.set(key, list);
      }
    }
  };
  walk(root);
  for (const list of byExt.values()) list.sort();
  return byExt;
}

function dmnBinding(task: BPMN20__tBusinessRuleTask): {
  fileName?: string;
  namespace?: string;
  modelName?: string;
} {
  const inputNames = new Map<string, string>();
  for (const input of task.ioSpecification?.dataInput ?? []) {
    const id = input["@_id"];
    const name = input["@_name"];
    if (id !== undefined && name !== undefined) inputNames.set(id, name);
  }
  const result: { fileName?: string; namespace?: string; modelName?: string } = {};
  for (const dia of task.dataInputAssociation ?? []) {
    const target = dia.targetRef.__$$text;
    const name = inputNames.get(target);
    const value = dia.assignment?.[0]?.from.__$$text?.trim();
    if (name === undefined || value === undefined) continue;
    if (name === "fileName") result.fileName = value;
    else if (name === "namespace") result.namespace = value;
    else if (name === "model") result.modelName = value;
  }
  return result;
}

export function parseBpmn(file: string): BpmnAsset {
  const asset: BpmnAsset = { file, processIds: [], ruleTasks: [], callActivities: [] };
  try {
    const xml = fs.readFileSync(file, "utf8");
    const json = getBpmnMarshaller(xml).parser.parse();
    for (const root of json.definitions.rootElement ?? []) {
      if (root.__$$element !== "process") continue;
      const process: BPMN20__tProcess = root;
      const pid = process["@_id"];
      if (pid !== undefined) asset.processIds.push(pid);
      for (const el of process.flowElement ?? []) {
        if (el.__$$element === "businessRuleTask") {
          const task: BPMN20__tBusinessRuleTask = el;
          const binding = dmnBinding(task);
          const ruleTask: BpmnRuleTask = { id: task["@_id"] ?? "?" };
          if (task["@_name"] !== undefined) ruleTask.name = task["@_name"];
          const group = task["@_drools:ruleFlowGroup"];
          if (group !== undefined) ruleTask.ruleFlowGroup = group;
          if (binding.fileName !== undefined) ruleTask.dmnFileName = binding.fileName;
          if (binding.namespace !== undefined) ruleTask.dmnNamespace = binding.namespace;
          if (binding.modelName !== undefined) ruleTask.dmnModelName = binding.modelName;
          asset.ruleTasks.push(ruleTask);
        } else if (el.__$$element === "callActivity") {
          const call: BPMN20__tCallActivity = el;
          const callActivity: BpmnCallActivity = { id: call["@_id"] ?? "?" };
          if (call["@_name"] !== undefined) callActivity.name = call["@_name"];
          if (call["@_calledElement"] !== undefined) callActivity.calledElement = call["@_calledElement"];
          asset.callActivities.push(callActivity);
        }
      }
    }
  } catch (err) {
    asset.parseError = err instanceof Error ? err.message : String(err);
  }
  return asset;
}

export function parseDmn(file: string): DmnAsset {
  const asset: DmnAsset = { file, imports: [] };
  try {
    const xml = fs.readFileSync(file, "utf8");
    const json = getDmnMarshaller(xml, { upgradeTo: "latest" }).parser.parse();
    const definitions = json.definitions;
    if (definitions["@_name"] !== undefined) asset.name = definitions["@_name"];
    if (definitions["@_namespace"] !== undefined) asset.namespace = definitions["@_namespace"];
    for (const imp of definitions.import ?? []) {
      asset.imports.push({
        ...(imp["@_namespace"] !== undefined ? { namespace: imp["@_namespace"] } : {}),
        ...(imp["@_importType"] !== undefined ? { importType: imp["@_importType"] } : {}),
      });
    }
  } catch (err) {
    asset.parseError = err instanceof Error ? err.message : String(err);
  }
  return asset;
}

export function parseDrl(file: string): DrlAsset {
  const source = fs.readFileSync(file, "utf8");
  const withoutComments = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const asset: DrlAsset = { file, ruleFlowGroups: [], agendaGroups: [] };
  const pkg = /^\s*package\s+([\w.]+)/m.exec(withoutComments);
  if (pkg?.[1] !== undefined) asset.packageName = pkg[1];
  for (const match of withoutComments.matchAll(/ruleflow-group\s+"([^"]+)"/g)) {
    if (match[1] !== undefined && !asset.ruleFlowGroups.includes(match[1])) {
      asset.ruleFlowGroups.push(match[1]);
    }
  }
  for (const match of withoutComments.matchAll(/agenda-group\s+"([^"]+)"/g)) {
    if (match[1] !== undefined && !asset.agendaGroups.includes(match[1])) {
      asset.agendaGroups.push(match[1]);
    }
  }
  return asset;
}

export function parseScesim(file: string): ScesimAsset {
  const asset: ScesimAsset = { file };
  try {
    const xml = fs.readFileSync(file, "utf8");
    const json = getScesimMarshaller(xml).parser.parse();
    const settings = json.ScenarioSimulationModel.settings;
    if (settings.type?.__$$text !== undefined) asset.type = settings.type.__$$text;
    if (settings.dmnFilePath?.__$$text !== undefined) asset.dmnFilePath = settings.dmnFilePath.__$$text;
    if (settings.dmnNamespace?.__$$text !== undefined) asset.dmnNamespace = settings.dmnNamespace.__$$text;
    if (settings.dmnName?.__$$text !== undefined) asset.dmnName = settings.dmnName.__$$text;
  } catch (err) {
    asset.parseError = err instanceof Error ? err.message : String(err);
  }
  return asset;
}

export function buildIndex(root: string): ProjectIndex {
  const files = scanFiles(root);
  return {
    root,
    bpmn: (files.get(".bpmn") ?? []).map(parseBpmn),
    dmn: (files.get(".dmn") ?? []).map(parseDmn),
    drl: (files.get(".drl") ?? []).map(parseDrl),
    scesim: (files.get(".scesim") ?? []).map(parseScesim),
  };
}
