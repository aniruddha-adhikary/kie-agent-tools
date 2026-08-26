import type {
  DMN16__tDecision,
  DMN16__tDMNElementReference,
} from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_6/ts-gen/types.js";
import { type Definitions, drgElements, artifacts } from "./model.js";

function refId(ref: DMN16__tDMNElementReference | undefined): string | undefined {
  return ref?.["@_href"]?.replace(/^#/, "");
}

export interface RequirementDesc {
  kind: "information" | "knowledge" | "authority";
  from: string | undefined;
}

export interface ExpressionDesc {
  kind: string;
  text?: string;
  typeRef?: string;
  hitPolicy?: string;
  inputs?: { expression: string | undefined; typeRef: string | undefined }[];
  outputs?: { name: string | undefined; typeRef: string | undefined }[];
  rules?: { when: (string | undefined)[]; then: (string | undefined)[] }[];
}

export interface NodeDesc {
  id: string | undefined;
  type: string;
  name: string | undefined;
  typeRef?: string;
  requires?: RequirementDesc[];
  expression?: ExpressionDesc;
}

export interface ModelDesc {
  id: string | undefined;
  name: string;
  namespace: string;
  nodes: NodeDesc[];
  annotations?: { id: string | undefined; text: string | undefined }[];
  itemDefinitions?: {
    name: string;
    typeRef: string | undefined;
    isCollection: boolean;
    components: { name: string; typeRef: string | undefined }[];
  }[];
  hasDiagram: boolean;
}

function describeExpression(expr: DMN16__tDecision["expression"]): ExpressionDesc | undefined {
  if (!expr) return undefined;
  if (expr.__$$element === "literalExpression") {
    return { kind: expr.__$$element, text: expr.text?.__$$text, typeRef: expr["@_typeRef"] };
  }
  if (expr.__$$element === "decisionTable") {
    return {
      kind: expr.__$$element,
      hitPolicy: expr["@_hitPolicy"] ?? "UNIQUE",
      inputs: (expr.input ?? []).map((i) => ({
        expression: i.inputExpression?.text?.__$$text,
        typeRef: i.inputExpression?.["@_typeRef"],
      })),
      outputs: (expr.output ?? []).map((o) => ({ name: o["@_name"], typeRef: o["@_typeRef"] })),
      rules: (expr.rule ?? []).map((r) => ({
        when: (r.inputEntry ?? []).map((e) => e.text?.__$$text),
        then: (r.outputEntry ?? []).map((e) => e.text?.__$$text),
      })),
    };
  }
  return { kind: expr.__$$element };
}

export function describeModel(definitions: Definitions): ModelDesc {
  const nodes: NodeDesc[] = drgElements(definitions).map((el) => {
    const node: NodeDesc = {
      id: el["@_id"],
      type: el.__$$element,
      name: el["@_name"],
    };
    if ("variable" in el && el.variable?.["@_typeRef"]) node.typeRef = el.variable["@_typeRef"];

    const requires: RequirementDesc[] = [];
    if (el.__$$element === "decision") {
      for (const req of el.informationRequirement ?? []) {
        requires.push({ kind: "information", from: refId(req.requiredInput ?? req.requiredDecision) });
      }
    }
    if (el.__$$element === "decision" || el.__$$element === "businessKnowledgeModel") {
      for (const req of el.knowledgeRequirement ?? []) {
        requires.push({ kind: "knowledge", from: refId(req.requiredKnowledge) });
      }
    }
    if (
      el.__$$element === "decision" ||
      el.__$$element === "businessKnowledgeModel" ||
      el.__$$element === "knowledgeSource"
    ) {
      for (const req of el.authorityRequirement ?? []) {
        requires.push({
          kind: "authority",
          from: refId(req.requiredInput ?? req.requiredDecision ?? req.requiredAuthority),
        });
      }
    }
    if (requires.length) node.requires = requires;
    if (el.__$$element === "decision") {
      const expr = describeExpression(el.expression);
      if (expr) node.expression = expr;
    }
    return node;
  });

  const annotations = artifacts(definitions)
    .filter((a) => a.__$$element === "textAnnotation")
    .map((a) => ({ id: a["@_id"], text: a.__$$element === "textAnnotation" ? a.text?.__$$text : undefined }));

  const itemDefinitions = (definitions.itemDefinition ?? []).map((d) => ({
    name: d["@_name"],
    typeRef: d.typeRef?.__$$text,
    isCollection: d["@_isCollection"] === true,
    components: (d.itemComponent ?? []).map((c) => ({
      name: c["@_name"],
      typeRef: c.typeRef?.__$$text,
    })),
  }));

  return {
    id: definitions["@_id"],
    name: definitions["@_name"],
    namespace: definitions["@_namespace"],
    nodes,
    ...(annotations.length ? { annotations } : {}),
    ...(itemDefinitions.length ? { itemDefinitions } : {}),
    hasDiagram: Boolean(definitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.length),
  };
}

export function describeText(desc: ModelDesc): string {
  const lines = [`model: ${desc.name} (${desc.id ?? "no id"})`, `namespace: ${desc.namespace}`];
  if (desc.itemDefinitions?.length) {
    lines.push("types:");
    for (const t of desc.itemDefinitions) {
      const base = t.components.length
        ? `{ ${t.components.map((c) => `${c.name}: ${c.typeRef ?? "?"}`).join(", ")} }`
        : t.typeRef ?? "?";
      lines.push(`  ${t.name} = ${base}${t.isCollection ? "[]" : ""}`);
    }
  }
  lines.push("nodes:");
  for (const n of desc.nodes) {
    lines.push(`  [${n.type}] ${n.name} (${n.id})${n.typeRef ? ` : ${n.typeRef}` : ""}`);
    for (const r of n.requires ?? []) lines.push(`    requires (${r.kind}): ${r.from}`);
    if (n.expression?.kind === "literalExpression") lines.push(`    = ${n.expression.text}`);
    if (n.expression?.kind === "decisionTable") {
      lines.push(`    decision table (${n.expression.hitPolicy}), ${n.expression.rules?.length ?? 0} rules`);
    }
  }
  for (const a of desc.annotations ?? []) lines.push(`  [annotation] ${a.text} (${a.id})`);
  lines.push(desc.hasDiagram ? "diagram: present" : "diagram: MISSING (run: dmnctl layout <file>)");
  return lines.join("\n");
}
