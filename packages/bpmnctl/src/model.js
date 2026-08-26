import fs from 'node:fs';
import { BpmnModdle } from 'bpmn-moddle';

export function createModdle() {
  return new BpmnModdle();
}

export async function loadModel(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const moddle = createModdle();
  const { rootElement: definitions, warnings } = await moddle.fromXML(xml);
  return { moddle, definitions, warnings, xml };
}

export async function serializeModel(moddle, definitions) {
  const { xml } = await moddle.toXML(definitions, { format: true });
  return xml;
}

export async function saveModel(file, moddle, definitions) {
  const xml = await serializeModel(moddle, definitions);
  fs.writeFileSync(file, xml);
  return xml;
}

export function getProcess(definitions, processId) {
  const processes = definitions.rootElements.filter(
    (e) => e.$type === 'bpmn:Process'
  );
  if (processId) {
    const found = processes.find((p) => p.id === processId);
    if (!found) {
      throw new Error(
        `process <${processId}> not found; available: ${processes.map((p) => p.id).join(', ')}`
      );
    }
    return found;
  }
  if (processes.length === 0) {
    throw new Error('no <bpmn:process> found in file');
  }
  if (processes.length > 1) {
    throw new Error(
      `multiple processes found, pass --process <id>; available: ${processes.map((p) => p.id).join(', ')}`
    );
  }
  return processes[0];
}

export function findElement(process, id, { optional = false } = {}) {
  const stack = [...(process.flowElements || [])];
  while (stack.length) {
    const el = stack.shift();
    if (el.id === id) return el;
    if (el.flowElements) stack.push(...el.flowElements);
  }
  if (optional) return null;
  throw new Error(
    `element <${id}> not found in process <${process.id}>; ` +
      `known ids: ${listFlowElements(process).map((e) => e.id).join(', ')}`
  );
}

export function listFlowElements(process) {
  const out = [];
  const stack = [...(process.flowElements || [])];
  while (stack.length) {
    const el = stack.shift();
    out.push(el);
    if (el.flowElements) stack.push(...el.flowElements);
  }
  return out;
}

export function containerOf(process, element) {
  const walk = (container) => {
    for (const el of container.flowElements || []) {
      if (el === element) return container;
      if (el.flowElements) {
        const found = walk(el);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(process);
}
