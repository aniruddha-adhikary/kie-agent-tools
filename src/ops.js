import { findElement, listFlowElements, containerOf } from './model.js';

const NODE_TYPES = {
  task: 'bpmn:Task',
  userTask: 'bpmn:UserTask',
  scriptTask: 'bpmn:ScriptTask',
  serviceTask: 'bpmn:ServiceTask',
  businessRuleTask: 'bpmn:BusinessRuleTask',
  sendTask: 'bpmn:SendTask',
  receiveTask: 'bpmn:ReceiveTask',
  manualTask: 'bpmn:ManualTask',
  callActivity: 'bpmn:CallActivity',
  subProcess: 'bpmn:SubProcess',
  exclusiveGateway: 'bpmn:ExclusiveGateway',
  parallelGateway: 'bpmn:ParallelGateway',
  inclusiveGateway: 'bpmn:InclusiveGateway',
  eventBasedGateway: 'bpmn:EventBasedGateway',
  startEvent: 'bpmn:StartEvent',
  endEvent: 'bpmn:EndEvent',
  intermediateCatchEvent: 'bpmn:IntermediateCatchEvent',
  intermediateThrowEvent: 'bpmn:IntermediateThrowEvent',
  boundaryEvent: 'bpmn:BoundaryEvent',
};

const EVENT_DEFINITIONS = {
  timer: 'bpmn:TimerEventDefinition',
  message: 'bpmn:MessageEventDefinition',
  signal: 'bpmn:SignalEventDefinition',
  error: 'bpmn:ErrorEventDefinition',
  escalation: 'bpmn:EscalationEventDefinition',
  compensate: 'bpmn:CompensateEventDefinition',
  conditional: 'bpmn:ConditionalEventDefinition',
  terminate: 'bpmn:TerminateEventDefinition',
};

export function nodeTypeNames() {
  return Object.keys(NODE_TYPES);
}

export function eventDefinitionNames() {
  return Object.keys(EVENT_DEFINITIONS);
}

function slugify(text) {
  return (text || '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function generateId(process, prefix) {
  const base = slugify(prefix) || 'node';
  const taken = new Set(listFlowElements(process).map((e) => e.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function ensureUniqueId(process, id) {
  if (findElement(process, id, { optional: true })) {
    throw new Error(`id <${id}> already exists in process <${process.id}>`);
  }
  return id;
}

export function setDroolsMeta(moddle, element, name, value) {
  let ext = element.extensionElements;
  if (!ext) {
    ext = moddle.create('bpmn:ExtensionElements', { values: [] });
    ext.$parent = element;
    element.extensionElements = ext;
  }
  ext.values = ext.values || [];
  const existing = ext.values.find(
    (v) => v.$type === 'drools:metaData' && (v.name === name || (v.$attrs || {}).name === name)
  );
  if (existing) {
    ext.values = ext.values.filter((v) => v !== existing);
  }
  const metaValue = moddle.createAny('drools:metaValue', 'http://www.jboss.org/drools', {
    $body: value,
  });
  const meta = moddle.createAny('drools:metaData', 'http://www.jboss.org/drools', {
    name,
    $children: [metaValue],
  });
  meta.$parent = ext;
  metaValue.$parent = meta;
  ext.values.push(meta);
  return meta;
}

export function setAttrs(element, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (key.includes(':')) {
      element.set(key, value);
    } else {
      element.set(key, coerce(element, key, value));
    }
  }
}

function coerce(element, key, value) {
  const descriptor = element.$descriptor.propertiesByName[key];
  const type = descriptor && descriptor.type;
  if (type === 'Boolean') return value === 'true' || value === true;
  if (type === 'Integer') return parseInt(value, 10);
  return value;
}

export function addNode(moddle, process, opts) {
  const {
    type,
    id,
    name,
    after,
    before,
    between,
    container: containerId,
    eventDefinition,
    script,
    scriptFormat,
    attrs = {},
  } = opts;

  const bpmnType = NODE_TYPES[type];
  if (!bpmnType) {
    throw new Error(
      `unknown node type <${type}>; supported: ${Object.keys(NODE_TYPES).join(', ')}`
    );
  }

  const nodeId = id
    ? ensureUniqueId(process, id)
    : generateId(process, name || type);

  const props = { id: nodeId };
  if (name) props.name = name;
  const node = moddle.create(bpmnType, props);

  if (name) setDroolsMeta(moddle, node, 'elementname', name);

  if (eventDefinition) {
    const defType = EVENT_DEFINITIONS[eventDefinition];
    if (!defType) {
      throw new Error(
        `unknown event definition <${eventDefinition}>; supported: ${Object.keys(EVENT_DEFINITIONS).join(', ')}`
      );
    }
    const def = moddle.create(defType, {});
    def.$parent = node;
    node.eventDefinitions = [def];
  }

  if (script) {
    if (bpmnType !== 'bpmn:ScriptTask') {
      throw new Error('--script is only valid for scriptTask');
    }
    node.script = script;
    node.scriptFormat = scriptFormat || 'http://www.java.com/java';
  }

  setAttrs(node, attrs);

  let container = process;
  if (containerId) {
    container = findElement(process, containerId);
    if (container.$type !== 'bpmn:SubProcess') {
      throw new Error(`container <${containerId}> is not a subProcess`);
    }
  }
  container.flowElements = container.flowElements || [];
  container.flowElements.push(node);
  node.$parent = container;

  const flows = [];
  if (between) {
    const [srcId, dstId] = between;
    const src = findElement(process, srcId);
    const dst = findElement(process, dstId);
    const existing = (src.outgoing || []).find((f) => f.targetRef === dst);
    if (existing) {
      removeFlow(process, existing);
    }
    flows.push(connect(moddle, process, srcId, nodeId, {}));
    flows.push(connect(moddle, process, nodeId, dstId, {}));
  } else {
    if (after) flows.push(connect(moddle, process, after, nodeId, {}));
    if (before) flows.push(connect(moddle, process, nodeId, before, {}));
  }

  return { node, flows };
}

export function connect(moddle, process, sourceId, targetId, opts = {}) {
  const source = findElement(process, sourceId);
  const target = findElement(process, targetId);

  const srcContainer = containerOf(process, source);
  const dstContainer = containerOf(process, target);
  if (srcContainer !== dstContainer) {
    throw new Error(
      `cannot connect across containers: <${sourceId}> is in <${srcContainer.id}>, <${targetId}> is in <${dstContainer.id}>`
    );
  }

  const duplicate = (source.outgoing || []).find((f) => f.targetRef === target);
  if (duplicate) {
    throw new Error(
      `flow from <${sourceId}> to <${targetId}> already exists: <${duplicate.id}>`
    );
  }

  const flowId = opts.id
    ? ensureUniqueId(process, opts.id)
    : generateId(process, `flow_${sourceId}_${targetId}`);

  const flow = moddle.create('bpmn:SequenceFlow', {
    id: flowId,
    sourceRef: source,
    targetRef: target,
  });
  if (opts.name) flow.name = opts.name;

  if (opts.condition) {
    const expr = moddle.create('bpmn:FormalExpression', {
      body: opts.condition,
    });
    if (opts.language) expr.language = opts.language;
    expr.$parent = flow;
    flow.conditionExpression = expr;
  }
  if (opts.default) {
    source.set('default', flow);
  }

  const container = containerOf(process, source);
  container.flowElements.push(flow);
  flow.$parent = container;

  source.outgoing = source.outgoing || [];
  source.outgoing.push(flow);
  target.incoming = target.incoming || [];
  target.incoming.push(flow);

  return flow;
}

function removeFlow(process, flow) {
  const container = containerOf(process, flow) || process;
  container.flowElements = container.flowElements.filter((e) => e !== flow);
  if (flow.sourceRef) {
    flow.sourceRef.outgoing = (flow.sourceRef.outgoing || []).filter((f) => f !== flow);
    if (flow.sourceRef.default === flow) flow.sourceRef.default = undefined;
  }
  if (flow.targetRef) {
    flow.targetRef.incoming = (flow.targetRef.incoming || []).filter((f) => f !== flow);
  }
}

export function removeElement(moddle, process, id, { reconnect = false } = {}) {
  const element = findElement(process, id);

  if (element.$type === 'bpmn:SequenceFlow') {
    removeFlow(process, element);
    return { removed: [element], flows: [] };
  }

  const incoming = [...(element.incoming || [])];
  const outgoing = [...(element.outgoing || [])];

  const newFlows = [];
  if (reconnect) {
    for (const inFlow of incoming) {
      for (const outFlow of outgoing) {
        const src = inFlow.sourceRef;
        const dst = outFlow.targetRef;
        const exists = (src.outgoing || []).some(
          (f) => f.targetRef === dst && f !== inFlow && f !== outFlow
        );
        if (!exists && src !== element && dst !== element) {
          newFlows.push([src.id, dst.id]);
        }
      }
    }
  }

  for (const flow of [...incoming, ...outgoing]) {
    removeFlow(process, flow);
  }

  const container = containerOf(process, element) || process;
  container.flowElements = container.flowElements.filter((e) => e !== element);

  const created = newFlows.map(([srcId, dstId]) =>
    connect(moddle, process, srcId, dstId, {})
  );

  return { removed: [element, ...incoming, ...outgoing], flows: created };
}
