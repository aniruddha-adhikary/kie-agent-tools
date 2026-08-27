import type { BpmnDefinitions, DiWaypoint, SequenceFlow } from './types.js';

function esc(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLabel(text: string, maxChars: number): string[] {
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const GATEWAY_MARKERS: Record<string, string> = {
  'bpmn:ExclusiveGateway': '\u00d7',
  'bpmn:ParallelGateway': '+',
  'bpmn:InclusiveGateway': 'O',
  'bpmn:EventBasedGateway': '\u25ef',
};

const TASK_BADGES: Record<string, string> = {
  'bpmn:UserTask': 'user',
  'bpmn:ScriptTask': 'script',
  'bpmn:ServiceTask': 'service',
  'bpmn:BusinessRuleTask': 'rule',
  'bpmn:SendTask': 'send',
  'bpmn:ReceiveTask': 'receive',
  'bpmn:ManualTask': 'manual',
  'bpmn:CallActivity': 'call',
};

export function renderSvg(definitions: BpmnDefinitions): string {
  const diagram = (definitions.diagrams ?? [])[0];
  if (!diagram || !diagram.plane) {
    throw new Error('no BPMN diagram (DI) found — run `bpmnctl layout <file>` first');
  }
  const planeElements = diagram.plane.planeElement ?? [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const parts: string[] = [];

  for (const pe of planeElements) {
    if (pe.$type === 'bpmndi:BPMNShape' && pe.bounds) {
      include(pe.bounds.x, pe.bounds.y);
      include(pe.bounds.x + pe.bounds.width, pe.bounds.y + pe.bounds.height);
    }
    if (pe.$type === 'bpmndi:BPMNEdge') {
      for (const wp of pe.waypoint ?? []) include(wp.x, wp.y);
    }
  }
  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }

  for (const pe of planeElements) {
    const element = pe.bpmnElement;
    if (!element) continue;

    if (pe.$type === 'bpmndi:BPMNEdge') {
      const wps: DiWaypoint[] = pe.waypoint ?? [];
      const points = wps.map((wp) => `${wp.x},${wp.y}`).join(' ');
      parts.push(
        `<polyline points="${points}" fill="none" stroke="#444" stroke-width="1.5" marker-end="url(#arrow)"/>`
      );
      const flow = element as SequenceFlow;
      const label = element.name ?? flow.conditionExpression?.body;
      if (label && wps.length) {
        const a = wps[Math.floor((wps.length - 1) / 2)];
        const b = wps[Math.min(wps.length - 1, Math.floor((wps.length - 1) / 2) + 1)];
        if (a && b) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          parts.push(
            `<text x="${mx}" y="${my - 5}" font-size="10" fill="#666" text-anchor="middle" font-family="sans-serif">${esc(label)}</text>`
          );
        }
      }
      continue;
    }

    if (pe.$type !== 'bpmndi:BPMNShape' || !pe.bounds) continue;
    const { x, y, width: w, height: h } = pe.bounds;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const type = element.$type;
    const name = element.name ?? '';

    if (type.endsWith('Event')) {
      const r = Math.min(w, h) / 2;
      const isEnd = type === 'bpmn:EndEvent';
      const isIntermediate = type.startsWith('bpmn:Intermediate') || type === 'bpmn:BoundaryEvent';
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#444" stroke-width="${isEnd ? 3 : 1.5}"/>`
      );
      if (isIntermediate) {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r - 3}" fill="none" stroke="#444" stroke-width="1"/>`);
      }
      const defs = (element.eventDefinitions ?? []).map((d) =>
        d.$type.replace('bpmn:', '').replace('EventDefinition', '')
      );
      if (defs.length) {
        parts.push(
          `<text x="${cx}" y="${cy + 3}" font-size="8" text-anchor="middle" fill="#444" font-family="sans-serif">${esc(defs.join(','))}</text>`
        );
      }
      if (name) {
        parts.push(
          `<text x="${cx}" y="${y + h + 12}" font-size="10" text-anchor="middle" fill="#222" font-family="sans-serif">${esc(name)}</text>`
        );
      }
    } else if (type.endsWith('Gateway')) {
      const d = `M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`;
      parts.push(`<path d="${d}" fill="#fff" stroke="#444" stroke-width="1.5"/>`);
      const marker = GATEWAY_MARKERS[type] ?? '';
      if (marker) {
        parts.push(
          `<text x="${cx}" y="${cy + 6}" font-size="18" text-anchor="middle" fill="#444" font-family="sans-serif">${esc(marker)}</text>`
        );
      }
      if (name) {
        parts.push(
          `<text x="${cx}" y="${y + h + 12}" font-size="10" text-anchor="middle" fill="#222" font-family="sans-serif">${esc(name)}</text>`
        );
      }
    } else {
      const isSub = type === 'bpmn:SubProcess';
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${isSub ? 'none' : '#fff'}" stroke="#444" stroke-width="1.5"/>`
      );
      const badge = TASK_BADGES[type];
      if (badge) {
        parts.push(
          `<text x="${x + 5}" y="${y + 11}" font-size="8" fill="#888" font-family="sans-serif">${esc(badge)}</text>`
        );
      }
      const lines = wrapLabel(name, Math.max(8, Math.floor(w / 7)));
      const startY = cy - ((lines.length - 1) * 12) / 2 + 3;
      lines.forEach((line, i) => {
        parts.push(
          `<text x="${cx}" y="${startY + i * 12}" font-size="11" text-anchor="middle" fill="#222" font-family="sans-serif">${esc(line)}</text>`
        );
      });
    }
  }

  const pad = 30;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = maxX - minX + pad * 2;
  const vbH = maxY - minY + pad * 2 + 20;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#444"/></marker></defs>',
    `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#fdfdfd"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}
