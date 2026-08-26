import { type Definitions, type ModelElement, allElements } from "./model.js";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function labelText(el: ModelElement | undefined): string {
  if (!el) return "";
  if (el.__$$element === "textAnnotation") return el.text?.__$$text ?? "";
  if ("@_name" in el) return el["@_name"] ?? "";
  return "";
}

function shapeSvg(el: ModelElement | undefined, b: Box): string {
  const { x, y, w, h } = b;
  const label = `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-family="sans-serif">${esc(labelText(el))}</text>`;
  switch (el?.__$$element) {
    case "inputData":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#e8f0fe" stroke="#333"/>` + label;
    case "decision":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#333"/>` + label;
    case "businessKnowledgeModel": {
      const c = 15;
      const pts = [
        [x + c, y],
        [x + w, y],
        [x + w, y + h - c],
        [x + w - c, y + h],
        [x, y + h],
        [x, y + c],
      ]
        .map((p) => p.join(","))
        .join(" ");
      return `<polygon points="${pts}" fill="#fef7e0" stroke="#333"/>` + label;
    }
    case "knowledgeSource": {
      const wave = h * 0.15;
      const d = `M ${x} ${y} H ${x + w} V ${y + h - wave} Q ${x + w * 0.75} ${y + h - 2 * wave} ${x + w / 2} ${y + h - wave} T ${x} ${y + h - wave} Z`;
      return `<path d="${d}" fill="#fce8e6" stroke="#333"/>` + label;
    }
    case "decisionService":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="#333"/>` + label;
    case "textAnnotation":
      return `<path d="M ${x + 12} ${y} H ${x} V ${y + h} H ${x + 12}" fill="none" stroke="#333"/>` + label;
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#999" stroke-dasharray="4"/>` + label;
  }
}

export function renderSvg(definitions: Definitions): string {
  const diagram = definitions["dmndi:DMNDI"]?.["dmndi:DMNDiagram"]?.[0];
  if (!diagram?.["dmndi:DMNDiagramElement"]?.length) {
    throw new Error("no DMN diagram present; run: dmnctl layout <file>");
  }
  const byId = new Map(allElements(definitions).map((e) => [e["@_id"], e]));
  const parts: string[] = [];
  let maxX = 0;
  let maxY = 0;

  for (const de of diagram["dmndi:DMNDiagramElement"]) {
    if (de.__$$element === "dmndi:DMNShape") {
      const bounds = de["dc:Bounds"];
      if (!bounds) continue;
      const b: Box = {
        x: Number(bounds["@_x"]),
        y: Number(bounds["@_y"]),
        w: Number(bounds["@_width"]),
        h: Number(bounds["@_height"]),
      };
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
      parts.push(shapeSvg(byId.get(de["@_dmnElementRef"]), b));
    } else if (de.__$$element === "dmndi:DMNEdge") {
      const wps = (de["di:waypoint"] ?? []).map((p) => [Number(p["@_x"]), Number(p["@_y"])] as const);
      if (wps.length < 2) continue;
      for (const [px, py] of wps) {
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
      const points = wps.map((p) => p.join(",")).join(" ");
      parts.unshift(`<polyline points="${points}" fill="none" stroke="#555" marker-end="url(#arrow)"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX + 40} ${maxY + 40}" width="${maxX + 40}" height="${maxY + 40}">
<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#555"/></marker></defs>
<rect width="100%" height="100%" fill="white"/>
${parts.join("\n")}
</svg>`;
}
