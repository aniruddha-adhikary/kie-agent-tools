import { createRequire } from 'node:module';
import { listFlowElements } from './model.js';
import type {
  BpmnDefinitions,
  BpmnProcess,
  FlowElement,
  Issue,
  LinterConstructor,
  NodeResolverConstructor,
  ParseWarning,
} from './types.js';

const require = createRequire(import.meta.url);

export async function lint(definitions: BpmnDefinitions): Promise<Issue[]> {
  const { Linter } = require('bpmnlint') as { Linter: LinterConstructor };
  const NodeResolver = require(
    'bpmnlint/lib/resolver/node-resolver.js'
  ) as NodeResolverConstructor;

  const linter = new Linter({
    config: { extends: 'bpmnlint:recommended' },
    resolver: new NodeResolver({ require }),
  });

  const reports = await linter.lint(definitions);
  const issues: Issue[] = [];
  for (const [rule, ruleReports] of Object.entries(reports)) {
    for (const report of ruleReports) {
      issues.push({
        rule,
        id: report.id,
        message: report.message,
        category: report.category ?? 'error',
      });
    }
  }
  return issues;
}

export function structuralChecks(
  process: BpmnProcess,
  parseWarnings: ParseWarning[] = []
): Issue[] {
  const issues: Issue[] = [];
  const elements = listFlowElements(process);
  const nodes = elements.filter((e) => e.$type !== 'bpmn:SequenceFlow');

  for (const warning of parseWarnings) {
    issues.push({
      rule: 'parse',
      id: warning.element?.id,
      message: warning.message,
      category: 'error',
    });
  }

  for (const n of nodes) {
    const isStart = n.$type === 'bpmn:StartEvent';
    const isEnd = n.$type === 'bpmn:EndEvent';
    const isBoundary = n.$type === 'bpmn:BoundaryEvent';
    const hasIn = (n.incoming ?? []).length > 0;
    const hasOut = (n.outgoing ?? []).length > 0;
    if (!isStart && !isBoundary && !hasIn) {
      issues.push({
        rule: 'structure/disconnected',
        id: n.id,
        message: `${n.$type.replace('bpmn:', '')} <${n.id}> has no incoming sequence flow`,
        category: 'warn',
      });
    }
    if (!isEnd && !hasOut) {
      issues.push({
        rule: 'structure/disconnected',
        id: n.id,
        message: `${n.$type.replace('bpmn:', '')} <${n.id}> has no outgoing sequence flow`,
        category: 'warn',
      });
    }
  }

  const ids = new Map<string, FlowElement>();
  for (const e of elements) {
    if (ids.has(e.id)) {
      issues.push({
        rule: 'structure/duplicate-id',
        id: e.id,
        message: `duplicate element id <${e.id}>`,
        category: 'error',
      });
    }
    ids.set(e.id, e);
  }

  return issues;
}
