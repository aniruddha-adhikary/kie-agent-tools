import { listFlowElements } from './model.js';
import type { BpmnDefinitions, BpmnProcess, FlowElement, SequenceFlow } from './types.js';

function shortType(type: string): string {
  return type.replace(/^bpmn:/, '');
}

function metaOf(element: FlowElement): Record<string, string | undefined> {
  const values = element.extensionElements?.values ?? [];
  const out: Record<string, string | undefined> = {};
  for (const v of values) {
    if (v.$type === 'drools:metaData') {
      const name = v.name ?? v.$attrs?.name;
      if (name === undefined) continue;
      const child = v.$children?.[0];
      out[name] = child ? child.$body : undefined;
    }
  }
  return out;
}

export interface NodeDescription {
  id: string;
  type: string;
  name: string | undefined;
  incoming: string[];
  outgoing: string[];
  eventDefinitions: string[];
  container: string | undefined;
  attrs: Record<string, string> | undefined;
  meta: Record<string, string | undefined> | undefined;
}

export interface FlowDescription {
  id: string;
  name: string | undefined;
  source: string | undefined;
  target: string | undefined;
  condition: string | undefined;
  default: true | undefined;
}

export interface ProcessDescription {
  file: string | undefined;
  process: {
    id: string;
    name: string | undefined;
    isExecutable: boolean | undefined;
    attrs: Record<string, string>;
    meta: Record<string, string | undefined>;
  };
  nodes: NodeDescription[];
  flows: FlowDescription[];
}

export function describeProcess(
  definitions: BpmnDefinitions,
  process: BpmnProcess
): ProcessDescription {
  const elements = listFlowElements(process);
  const nodes = elements.filter((e) => e.$type !== 'bpmn:SequenceFlow');
  const flows = elements.filter(
    (e): e is SequenceFlow => e.$type === 'bpmn:SequenceFlow'
  );

  return {
    file: undefined,
    process: {
      id: process.id,
      name: process.name,
      isExecutable: process.isExecutable,
      attrs: process.$attrs ?? {},
      meta: metaOf(process),
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: shortType(n.$type),
      name: n.name,
      incoming: (n.incoming ?? []).map((f) => f.id),
      outgoing: (n.outgoing ?? []).map((f) => f.id),
      eventDefinitions: (n.eventDefinitions ?? []).map((d) => shortType(d.$type)),
      container: n.$parent === process ? undefined : n.$parent?.id,
      attrs: Object.keys(n.$attrs ?? {}).length ? n.$attrs : undefined,
      meta: Object.keys(metaOf(n)).length ? metaOf(n) : undefined,
    })),
    flows: flows.map((f) => ({
      id: f.id,
      name: f.name,
      source: f.sourceRef?.id,
      target: f.targetRef?.id,
      condition: f.conditionExpression?.body,
      default: f.sourceRef && f.sourceRef.default === f ? true : undefined,
    })),
  };
}

export function describeText(desc: ProcessDescription): string {
  const lines: string[] = [];
  const p = desc.process;
  lines.push(
    `process ${p.id}${p.name ? ` "${p.name}"` : ''}${p.isExecutable ? ' [executable]' : ''}`
  );
  for (const [k, v] of Object.entries(p.attrs)) lines.push(`  ${k} = ${v}`);
  lines.push('');
  lines.push('nodes:');
  for (const n of desc.nodes) {
    const extras: string[] = [];
    if (n.eventDefinitions.length) extras.push(n.eventDefinitions.join(','));
    if (n.container) extras.push(`in:${n.container}`);
    lines.push(
      `  ${n.id}  ${n.type}${n.name ? `  "${n.name}"` : ''}${extras.length ? `  (${extras.join(' ')})` : ''}`
    );
  }
  lines.push('');
  lines.push('flows:');
  for (const f of desc.flows) {
    const cond = f.condition ? `  [${f.condition}]` : f.default ? '  [default]' : '';
    lines.push(`  ${f.id}  ${f.source} -> ${f.target}${cond}`);
  }
  return lines.join('\n');
}
