import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { DMN16__tDMNElementReference } from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_6/ts-gen/types.js";
import { type Definitions, drgElements, artifacts, getDiagram, newId } from "./model.js";

const NODE_SIZE = { width: 160, height: 80 };
const ANNOTATION_SIZE = { width: 200, height: 60 };

interface EdgeSpec {
  id: string;
  source: string;
  target: string;
}

function refId(ref: DMN16__tDMNElementReference | undefined): string | undefined {
  return ref?.["@_href"]?.replace(/^#/, "");
}

export function collectEdges(definitions: Definitions): EdgeSpec[] {
  const edges: (Omit<EdgeSpec, "source" | "target"> & {
    source: string | undefined;
    target: string | undefined;
  })[] = [];
  for (const el of drgElements(definitions)) {
    const target = el["@_id"];
    if (el.__$$element === "decision") {
      for (const req of el.informationRequirement ?? []) {
        edges.push({ id: req["@_id"] ?? newId(), source: refId(req.requiredInput ?? req.requiredDecision), target });
      }
    }
    if (el.__$$element === "decision" || el.__$$element === "businessKnowledgeModel") {
      for (const req of el.knowledgeRequirement ?? []) {
        edges.push({ id: req["@_id"] ?? newId(), source: refId(req.requiredKnowledge), target });
      }
    }
    if (
      el.__$$element === "decision" ||
      el.__$$element === "businessKnowledgeModel" ||
      el.__$$element === "knowledgeSource"
    ) {
      for (const req of el.authorityRequirement ?? []) {
        edges.push({
          id: req["@_id"] ?? newId(),
          source: refId(req.requiredInput ?? req.requiredDecision ?? req.requiredAuthority),
          target,
        });
      }
    }
  }
  for (const a of artifacts(definitions)) {
    if (a.__$$element === "association") {
      edges.push({ id: a["@_id"] ?? newId(), source: refId(a.sourceRef), target: refId(a.targetRef) });
    }
  }
  return edges.filter((e): e is EdgeSpec => Boolean(e.source && e.target));
}

export async function layoutModel(definitions: Definitions): Promise<void> {
  const nodes = [
    ...drgElements(definitions).map((el) => ({ id: el["@_id"] ?? newId(), ...NODE_SIZE })),
    ...artifacts(definitions)
      .filter((a) => a.__$$element === "textAnnotation")
      .map((a) => ({ id: a["@_id"] ?? newId(), ...ANNOTATION_SIZE })),
  ];
  const edges = collectEdges(definitions);

  const elk = new ELK();
  const graph = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "UP",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.padding": "[top=40,left=40,bottom=40,right=40]",
    },
    children: nodes,
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  });

  const diagram = getDiagram(definitions);
  const children = graph.children ?? [];
  const positions = new Map(children.map((c) => [c.id, c]));

  type DiagramElement = NonNullable<
    NonNullable<Definitions["dmndi:DMNDI"]>["dmndi:DMNDiagram"]
  >[number]["dmndi:DMNDiagramElement"];
  const diagramElements: NonNullable<DiagramElement> = [];

  for (const c of children) {
    diagramElements.push({
      __$$element: "dmndi:DMNShape",
      "@_id": newId(),
      "@_dmnElementRef": c.id,
      "dc:Bounds": { "@_x": c.x ?? 0, "@_y": c.y ?? 0, "@_width": c.width ?? 0, "@_height": c.height ?? 0 },
    });
  }
  for (const e of edges) {
    const s = positions.get(e.source);
    const t = positions.get(e.target);
    if (!s || !t) continue;
    const elkEdge = (graph.edges ?? []).find((ge) => ge.id === e.id);
    const section = elkEdge?.sections?.[0];
    const waypoints = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [
          { x: (s.x ?? 0) + (s.width ?? 0) / 2, y: (s.y ?? 0) + (s.height ?? 0) / 2 },
          { x: (t.x ?? 0) + (t.width ?? 0) / 2, y: (t.y ?? 0) + (t.height ?? 0) / 2 },
        ];
    diagramElements.push({
      __$$element: "dmndi:DMNEdge",
      "@_id": newId(),
      "@_dmnElementRef": e.id,
      "di:waypoint": waypoints.map((p) => ({ "@_x": p.x, "@_y": p.y })),
    });
  }
  diagram["dmndi:DMNDiagramElement"] = diagramElements;
}
