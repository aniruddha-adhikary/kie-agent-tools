import type {
  DMN16__tAssociation,
  DMN16__tDecisionTable,
  DMN16__tLiteralExpression,
} from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_6/ts-gen/types.js";
import {
  type Definitions,
  type DrgElement,
  type ModelElement,
  drgElements,
  artifacts,
  findElement,
  newId,
} from "./model.js";

export const NODE_TYPES = {
  "input-data": "inputData",
  decision: "decision",
  bkm: "businessKnowledgeModel",
  "knowledge-source": "knowledgeSource",
  "decision-service": "decisionService",
  "text-annotation": "textAnnotation",
} as const;

export type NodeTypeAlias = keyof typeof NODE_TYPES;

export interface AddNodeOpts {
  type: string;
  name?: string;
  typeRef?: string;
  id?: string;
}

export function addNode(definitions: Definitions, opts: AddNodeOpts): ModelElement {
  const element = NODE_TYPES[opts.type as NodeTypeAlias];
  if (!element) {
    throw new Error(`unknown node type "${opts.type}". Known types: ${Object.keys(NODE_TYPES).join(", ")}`);
  }
  const nodeId = opts.id ?? newId();

  if (element === "textAnnotation") {
    const node = {
      __$$element: element,
      "@_id": nodeId,
      text: { __$$text: opts.name ?? "" },
    } as const;
    (definitions.artifact ??= []).push(node);
    return node;
  }

  const name = opts.name ?? nodeId;
  const variable =
    element === "inputData" || element === "decision" || element === "businessKnowledgeModel"
      ? { "@_id": newId(), "@_name": name, ...(opts.typeRef ? { "@_typeRef": opts.typeRef } : {}) }
      : undefined;
  const node: DrgElement = {
    __$$element: element,
    "@_id": nodeId,
    "@_name": name,
    ...(variable ? { variable } : {}),
  };
  (definitions.drgElement ??= []).push(node);
  return node;
}

export interface ConnectResult {
  kind: "informationRequirement" | "knowledgeRequirement" | "authorityRequirement" | "association";
  id: string;
}

export function connect(definitions: Definitions, sourceRef: string, targetRef: string): ConnectResult {
  const source = findElement(definitions, sourceRef);
  const target = findElement(definitions, targetRef);
  const s = source.__$$element;
  const t = target.__$$element;
  const href = `#${source["@_id"]}`;
  const reqId = newId();

  if (t === "textAnnotation" || s === "textAnnotation" || t === "group" || s === "group") {
    const assoc: DMN16__tAssociation & { __$$element: "association" } = {
      __$$element: "association",
      "@_id": reqId,
      sourceRef: { "@_href": `#${source["@_id"]}` },
      targetRef: { "@_href": `#${target["@_id"]}` },
    };
    (definitions.artifact ??= []).push(assoc);
    return { kind: "association", id: reqId };
  }

  if (target.__$$element === "decision") {
    if (s === "inputData") {
      (target.informationRequirement ??= []).push({ "@_id": reqId, requiredInput: { "@_href": href } });
      return { kind: "informationRequirement", id: reqId };
    }
    if (s === "decision") {
      (target.informationRequirement ??= []).push({ "@_id": reqId, requiredDecision: { "@_href": href } });
      return { kind: "informationRequirement", id: reqId };
    }
    if (s === "businessKnowledgeModel" || s === "decisionService") {
      (target.knowledgeRequirement ??= []).push({ "@_id": reqId, requiredKnowledge: { "@_href": href } });
      return { kind: "knowledgeRequirement", id: reqId };
    }
    if (s === "knowledgeSource") {
      (target.authorityRequirement ??= []).push({ "@_id": reqId, requiredAuthority: { "@_href": href } });
      return { kind: "authorityRequirement", id: reqId };
    }
  }

  if (target.__$$element === "businessKnowledgeModel") {
    if (s === "businessKnowledgeModel" || s === "decisionService") {
      (target.knowledgeRequirement ??= []).push({ "@_id": reqId, requiredKnowledge: { "@_href": href } });
      return { kind: "knowledgeRequirement", id: reqId };
    }
    if (s === "knowledgeSource") {
      (target.authorityRequirement ??= []).push({ "@_id": reqId, requiredAuthority: { "@_href": href } });
      return { kind: "authorityRequirement", id: reqId };
    }
  }

  if (target.__$$element === "knowledgeSource") {
    if (s === "inputData") {
      (target.authorityRequirement ??= []).push({ "@_id": reqId, requiredInput: { "@_href": href } });
      return { kind: "authorityRequirement", id: reqId };
    }
    if (s === "decision") {
      (target.authorityRequirement ??= []).push({ "@_id": reqId, requiredDecision: { "@_href": href } });
      return { kind: "authorityRequirement", id: reqId };
    }
  }

  throw new Error(`cannot connect ${s} -> ${t}: no valid DMN requirement exists for this pair`);
}

export function removeElement(definitions: Definitions, idOrName: string): ModelElement {
  const el = findElement(definitions, idOrName);
  const id = el["@_id"];
  const href = `#${id}`;

  definitions.drgElement = drgElements(definitions).filter((e) => e !== el);
  definitions.artifact = artifacts(definitions).filter(
    (e) =>
      e !== el &&
      !(
        e.__$$element === "association" &&
        (e.sourceRef?.["@_href"] === href || e.targetRef?.["@_href"] === href)
      )
  );

  for (const node of drgElements(definitions)) {
    if ("informationRequirement" in node && node.informationRequirement) {
      node.informationRequirement = node.informationRequirement.filter(
        (r) => r.requiredInput?.["@_href"] !== href && r.requiredDecision?.["@_href"] !== href
      );
      if (node.informationRequirement.length === 0) delete node.informationRequirement;
    }
    if ("knowledgeRequirement" in node && node.knowledgeRequirement) {
      node.knowledgeRequirement = node.knowledgeRequirement.filter(
        (r) => r.requiredKnowledge?.["@_href"] !== href
      );
      if (node.knowledgeRequirement.length === 0) delete node.knowledgeRequirement;
    }
    if ("authorityRequirement" in node && node.authorityRequirement) {
      node.authorityRequirement = node.authorityRequirement.filter(
        (r) =>
          r.requiredInput?.["@_href"] !== href &&
          r.requiredDecision?.["@_href"] !== href &&
          r.requiredAuthority?.["@_href"] !== href
      );
      if (node.authorityRequirement.length === 0) delete node.authorityRequirement;
    }
  }

  for (const diagram of definitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"] ?? []) {
    if (!diagram["dmndi:DMNDiagramElement"]) continue;
    diagram["dmndi:DMNDiagramElement"] = diagram["dmndi:DMNDiagramElement"].filter(
      (de) => de["@_dmnElementRef"] !== id
    );
  }
  return el;
}

export function setLiteralExpression(
  definitions: Definitions,
  idOrName: string,
  opts: { feel: string; typeRef?: string }
): DMN16__tLiteralExpression {
  const el = findElement(definitions, idOrName);
  if (el.__$$element !== "decision") {
    throw new Error(`"${idOrName}" is a ${el.__$$element}; only decisions hold expressions (BKM logic not supported yet)`);
  }
  const literal: DMN16__tLiteralExpression & { __$$element: "literalExpression" } = {
    __$$element: "literalExpression",
    "@_id": newId(),
    text: { __$$text: opts.feel },
    ...(opts.typeRef ? { "@_typeRef": opts.typeRef } : {}),
  };
  el.expression = literal;
  return literal;
}

export interface DecisionTableSpec {
  hitPolicy?: DMN16__tDecisionTable["@_hitPolicy"];
  inputs?: { expression: string; typeRef?: string }[];
  outputs?: { name?: string; typeRef?: string }[];
  rules?: { when: string[]; then: string[] }[];
}

export function setDecisionTable(
  definitions: Definitions,
  idOrName: string,
  table: DecisionTableSpec
): DMN16__tDecisionTable {
  const el = findElement(definitions, idOrName);
  if (el.__$$element !== "decision") {
    throw new Error(`"${idOrName}" is a ${el.__$$element}; only decisions can hold a decision table`);
  }
  const dt: DMN16__tDecisionTable & { __$$element: "decisionTable" } = {
    __$$element: "decisionTable",
    "@_id": newId(),
    "@_hitPolicy": table.hitPolicy ?? "UNIQUE",
    input: (table.inputs ?? []).map((inp) => ({
      "@_id": newId(),
      inputExpression: {
        "@_id": newId(),
        text: { __$$text: inp.expression },
        ...(inp.typeRef ? { "@_typeRef": inp.typeRef } : {}),
      },
    })),
    output: (table.outputs ?? [{}]).map((out) => ({
      "@_id": newId(),
      ...(out.name ? { "@_name": out.name } : {}),
      ...(out.typeRef ? { "@_typeRef": out.typeRef } : {}),
    })),
    rule: (table.rules ?? []).map((rule) => ({
      "@_id": newId(),
      inputEntry: rule.when.map((w) => ({ "@_id": newId(), text: { __$$text: w } })),
      outputEntry: rule.then.map((t) => ({ "@_id": newId(), text: { __$$text: t } })),
    })),
  };
  el.expression = dt;
  return dt;
}

export function setProps(
  definitions: Definitions,
  idOrName: string,
  opts: { name?: string; typeRef?: string }
): ModelElement {
  const el = findElement(definitions, idOrName);
  if (el.__$$element === "textAnnotation") {
    if (opts.name !== undefined) el.text = { __$$text: opts.name };
    return el;
  }
  if (el.__$$element === "group" || el.__$$element === "association") {
    throw new Error(`cannot set properties on ${el.__$$element}`);
  }
  if (opts.name !== undefined) {
    el["@_name"] = opts.name;
    if ("variable" in el && el.variable) el.variable["@_name"] = opts.name;
  }
  if (opts.typeRef !== undefined && "variable" in el && el.variable) {
    el.variable["@_typeRef"] = opts.typeRef;
  }
  return el;
}
