import type { NodeInstance, ProcessInstance, UserTaskInstance } from "./dataindex.js";

function ts(value: string | null | undefined): string {
  return value ?? "…";
}

function durationMs(enter?: string | null, exit?: string | null): number | undefined {
  if (!enter || !exit) return undefined;
  const d = Date.parse(exit) - Date.parse(enter);
  return Number.isNaN(d) ? undefined : d;
}

export function formatInstanceList(instances: ProcessInstance[]): string {
  if (instances.length === 0) return "no process instances found";
  const lines = instances.map((i) => {
    const err = i.error?.message ? `  error: ${i.error.message}` : "";
    return `${i.id}  ${i.processId ?? "?"}  ${i.state ?? "?"}  start=${ts(i.start)}  end=${ts(i.end)}${err}`;
  });
  return lines.join("\n");
}

export interface TraceStep {
  name: string;
  type: string;
  definitionId?: string;
  enter?: string;
  exit?: string;
  durationMs?: number;
  active: boolean;
  errored: boolean;
}

export function traceSteps(instance: ProcessInstance): TraceStep[] {
  const nodes = [...(instance.nodes ?? [])];
  nodes.sort((a: NodeInstance, b: NodeInstance) => {
    const ta = a.enter ? Date.parse(a.enter) : Number.MAX_SAFE_INTEGER;
    const tb = b.enter ? Date.parse(b.enter) : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  const errorNode = instance.error?.nodeDefinitionId;
  return nodes.map((n) => {
    const dur = durationMs(n.enter, n.exit);
    return {
      name: n.name ?? n.definitionId ?? n.id,
      type: n.type ?? "?",
      ...(n.definitionId != null ? { definitionId: n.definitionId } : {}),
      ...(n.enter != null ? { enter: n.enter } : {}),
      ...(n.exit != null ? { exit: n.exit } : {}),
      ...(dur !== undefined ? { durationMs: dur } : {}),
      active: n.exit == null,
      errored: errorNode != null && n.definitionId === errorNode,
    };
  });
}

export function formatTrace(instance: ProcessInstance, tasks: UserTaskInstance[]): string {
  const lines: string[] = [];
  lines.push(`instance: ${instance.id}`);
  lines.push(`process:  ${instance.processId ?? "?"}${instance.processName ? ` (${instance.processName})` : ""}`);
  lines.push(`state:    ${instance.state ?? "?"}  start=${ts(instance.start)}  end=${ts(instance.end)}`);
  if (instance.businessKey) lines.push(`businessKey: ${instance.businessKey}`);
  if (instance.parentProcessInstanceId) lines.push(`parent: ${instance.parentProcessInstanceId}`);
  if (instance.error) {
    lines.push(`error:    ${instance.error.message ?? "?"} (at node definition ${instance.error.nodeDefinitionId ?? "?"})`);
  }
  lines.push("");
  lines.push("timeline:");
  for (const step of traceSteps(instance)) {
    const marker = step.errored ? "✗" : step.active ? "▶" : "✓";
    const dur = step.durationMs !== undefined ? `  (${step.durationMs}ms)` : "";
    lines.push(`  ${marker} ${ts(step.enter)}  [${step.type}] ${step.name}${dur}${step.active ? "  (still active)" : ""}`);
  }
  if (tasks.length > 0) {
    lines.push("");
    lines.push("user tasks:");
    for (const t of tasks) {
      const owner = t.actualOwner ? ` owner=${t.actualOwner}` : t.potentialGroups?.length ? ` groups=${t.potentialGroups.join(",")}` : "";
      lines.push(`  - ${t.name ?? t.id}: ${t.state ?? "?"}${owner}  started=${ts(t.started)}  completed=${ts(t.completed)}`);
    }
  }
  if (instance.variables !== undefined && instance.variables !== null) {
    lines.push("");
    lines.push("variables:");
    const vars = typeof instance.variables === "string" ? instance.variables : JSON.stringify(instance.variables, null, 2);
    lines.push(vars.split("\n").map((l) => `  ${l}`).join("\n"));
  }
  return lines.join("\n");
}
