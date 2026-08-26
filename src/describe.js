import { listFlowElements } from './model.js';

function shortType(type) {
  return type.replace(/^bpmn:/, '');
}

function metaOf(element) {
  const values = (element.extensionElements && element.extensionElements.values) || [];
  const out = {};
  for (const v of values) {
    if (v.$type === 'drools:metaData') {
      const name = v.name || (v.$attrs || {}).name;
      const child = (v.$children || [])[0];
      out[name] = child ? child.$body : undefined;
    }
  }
  return out;
}

export function describeProcess(definitions, process) {
  const elements = listFlowElements(process);
  const nodes = elements.filter((e) => e.$type !== 'bpmn:SequenceFlow');
  const flows = elements.filter((e) => e.$type === 'bpmn:SequenceFlow');

  return {
    file: undefined,
    process: {
      id: process.id,
      name: process.name,
      isExecutable: process.isExecutable,
      attrs: process.$attrs || {},
      meta: metaOf(process),
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: shortType(n.$type),
      name: n.name,
      incoming: (n.incoming || []).map((f) => f.id),
      outgoing: (n.outgoing || []).map((f) => f.id),
      eventDefinitions: (n.eventDefinitions || []).map((d) => shortType(d.$type)),
      container: n.$parent === process ? undefined : n.$parent.id,
      attrs: Object.keys(n.$attrs || {}).length ? n.$attrs : undefined,
      meta: Object.keys(metaOf(n)).length ? metaOf(n) : undefined,
    })),
    flows: flows.map((f) => ({
      id: f.id,
      name: f.name,
      source: f.sourceRef && f.sourceRef.id,
      target: f.targetRef && f.targetRef.id,
      condition: f.conditionExpression && f.conditionExpression.body,
      default: f.sourceRef && f.sourceRef.default === f ? true : undefined,
    })),
  };
}

export function describeText(desc) {
  const lines = [];
  const p = desc.process;
  lines.push(`process ${p.id}${p.name ? ` "${p.name}"` : ''}${p.isExecutable ? ' [executable]' : ''}`);
  for (const [k, v] of Object.entries(p.attrs)) lines.push(`  ${k} = ${v}`);
  lines.push('');
  lines.push('nodes:');
  for (const n of desc.nodes) {
    const extras = [];
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
