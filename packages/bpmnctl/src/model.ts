import fs from 'node:fs';
import { BpmnModdle } from 'bpmn-moddle';
import type {
  BpmnDefinitions,
  BpmnModdleApi,
  BpmnProcess,
  FlowElement,
  ParseWarning,
} from './types.js';

export function createModdle(): BpmnModdleApi {
  return new BpmnModdle();
}

export interface LoadedModel {
  moddle: BpmnModdleApi;
  definitions: BpmnDefinitions;
  warnings: ParseWarning[];
  xml: string;
}

export async function loadModel(file: string): Promise<LoadedModel> {
  const xml = fs.readFileSync(file, 'utf8');
  const moddle = createModdle();
  const { rootElement: definitions, warnings } = await moddle.fromXML(xml);
  return { moddle, definitions, warnings, xml };
}

export async function serializeModel(
  moddle: BpmnModdleApi,
  definitions: BpmnDefinitions
): Promise<string> {
  const { xml } = await moddle.toXML(definitions, { format: true });
  return xml;
}

export async function saveModel(
  file: string,
  moddle: BpmnModdleApi,
  definitions: BpmnDefinitions
): Promise<string> {
  const xml = await serializeModel(moddle, definitions);
  fs.writeFileSync(file, xml);
  return xml;
}

export function getProcess(definitions: BpmnDefinitions, processId?: string): BpmnProcess {
  const processes = definitions.rootElements.filter(
    (e): e is BpmnProcess => e.$type === 'bpmn:Process'
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
  const first = processes[0];
  if (!first) {
    throw new Error('no <bpmn:process> found in file');
  }
  if (processes.length > 1) {
    throw new Error(
      `multiple processes found, pass --process <id>; available: ${processes.map((p) => p.id).join(', ')}`
    );
  }
  return first;
}

export function findElement(process: BpmnProcess, id: string): FlowElement;
export function findElement(
  process: BpmnProcess,
  id: string,
  opts: { optional: true }
): FlowElement | null;
export function findElement(
  process: BpmnProcess,
  id: string,
  { optional = false }: { optional?: boolean } = {}
): FlowElement | null {
  const stack: FlowElement[] = [...(process.flowElements ?? [])];
  while (stack.length) {
    const el = stack.shift();
    if (!el) break;
    if (el.id === id) return el;
    if (el.flowElements) stack.push(...el.flowElements);
  }
  if (optional) return null;
  throw new Error(
    `element <${id}> not found in process <${process.id}>; ` +
      `known ids: ${listFlowElements(process).map((e) => e.id).join(', ')}`
  );
}

export function listFlowElements(process: BpmnProcess): FlowElement[] {
  const out: FlowElement[] = [];
  const stack: FlowElement[] = [...(process.flowElements ?? [])];
  while (stack.length) {
    const el = stack.shift();
    if (!el) break;
    out.push(el);
    if (el.flowElements) stack.push(...el.flowElements);
  }
  return out;
}

export function containerOf(process: BpmnProcess, element: FlowElement): FlowElement | null {
  const walk = (container: FlowElement): FlowElement | null => {
    for (const el of container.flowElements ?? []) {
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
