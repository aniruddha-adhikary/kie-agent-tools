import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { ProcessDescription } from '../src/describe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'bin', 'bpmnctl.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'kogito-sample.bpmn');

interface ExecError extends Error {
  status?: number;
  stdout?: string;
  stderr?: string;
}

function run(args: string[], opts: Record<string, unknown> = {}): string {
  return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
}

function describeFile(file: string): ProcessDescription {
  return JSON.parse(run(['describe', file, '--json'])) as ProcessDescription;
}

function tmpFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpmnctl-'));
  return path.join(dir, name);
}

test('new + describe', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1', '--name', 'Proc One', '--package', 'org.acme']);
  const desc = describeFile(file);
  assert.equal(desc.process.id, 'proc1');
  assert.equal(desc.process.attrs['drools:packageName'], 'org.acme');
  assert.equal(desc.nodes.length, 2);
  assert.equal(desc.flows.length, 1);
  const xml = fs.readFileSync(file, 'utf8');
  assert.match(xml, /BPMNShape/);
  assert.match(xml, /waypoint/);
});

test('add --between splices into an existing flow', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  run(['add', file, '--type', 'userTask', '--name', 'Review', '--between', 'start,end']);
  const desc = describeFile(file);
  assert.deepEqual(
    desc.flows.map((f) => `${f.source}->${f.target}`).sort(),
    ['Review->end', 'start->Review']
  );
  const review = desc.nodes.find((n) => n.id === 'Review');
  assert.ok(review);
  assert.equal(review.type, 'UserTask');
  assert.equal(review.meta?.elementname, 'Review');
});

test('connect with condition and default', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  run(['add', file, '--type', 'exclusiveGateway', '--name', 'Gate', '--between', 'start,end']);
  run(['add', file, '--type', 'endEvent', '--id', 'end2', '--name', 'Alt End']);
  run(['rm', file, 'flow_Gate_end']);
  run(['connect', file, 'Gate', 'end', '--condition', 'return ok;', '--language', 'http://www.java.com/java']);
  run(['connect', file, 'Gate', 'end2', '--default']);
  const desc = describeFile(file);
  const yes = desc.flows.find((f) => f.target === 'end');
  const no = desc.flows.find((f) => f.target === 'end2');
  assert.ok(yes);
  assert.ok(no);
  assert.equal(yes.condition, 'return ok;');
  assert.equal(no.default, true);
});

test('rm --reconnect bridges neighbors', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  run(['add', file, '--type', 'scriptTask', '--id', 'st', '--name', 'S', '--between', 'start,end']);
  run(['rm', file, 'st', '--reconnect']);
  const desc = describeFile(file);
  assert.equal(desc.nodes.length, 2);
  assert.deepEqual(desc.flows.map((f) => `${f.source}->${f.target}`), ['start->end']);
});

test('set updates attrs, meta, and script', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  run(['add', file, '--type', 'scriptTask', '--id', 'st', '--name', 'S', '--between', 'start,end']);
  run(['set', file, 'st', '--script', 'System.out.println("hi");', '--attr', 'drools:priority=2', '--meta', 'customAsync=true']);
  const xml = fs.readFileSync(file, 'utf8');
  assert.match(xml, /drools:priority="2"/);
  assert.match(xml, /<drools:metaData name="customAsync">/);
  assert.match(xml, /System\.out\.println\(&quot;hi&quot;\);|System.out.println/);
  assert.match(xml, /scriptFormat="http:\/\/www\.java\.com\/java"/);
});

test('layout preserves drools extensions on a real Kogito-style file', () => {
  const file = tmpFile('p.bpmn');
  fs.copyFileSync(FIXTURE, file);
  run(['layout', file]);
  const xml = fs.readFileSync(file, 'utf8');
  assert.match(xml, /drools:packageName="com.example"/);
  assert.match(xml, /<drools:metaData name="riskLevel">/);
  assert.match(xml, /potentialOwner/);
  assert.match(xml, /BPMNShape/);
  assert.match(xml, /waypoint/);
});

test('edits on the Kogito fixture keep extensions intact', () => {
  const file = tmpFile('p.bpmn');
  fs.copyFileSync(FIXTURE, file);
  run(['add', file, '--type', 'businessRuleTask', '--id', 'rules', '--name', 'Run Rules', '--between', 'reviewTask,end', '--attr', 'drools:ruleFlowGroup=validation']);
  const xml = fs.readFileSync(file, 'utf8');
  assert.match(xml, /drools:ruleFlowGroup="validation"/);
  assert.match(xml, /drools:packageName="com.example"/);
  const desc = describeFile(file);
  assert.deepEqual(
    desc.flows.map((f) => `${f.source}->${f.target}`).sort(),
    ['reviewTask->rules', 'rules->end', 'start->reviewTask']
  );
});

test('validate flags implicit split and exits 1', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  run(['add', file, '--type', 'endEvent', '--id', 'end2']);
  run(['connect', file, 'start', 'end2']);
  assert.throws(
    () => run(['validate', file]),
    (err: unknown) => {
      const e = err as ExecError;
      assert.equal(e.status, 1);
      assert.match(e.stdout ?? '', /no-implicit-split/);
      return true;
    }
  );
});

test('validate passes on a clean file', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  const out = run(['validate', file]);
  assert.match(out, /OK/);
});

test('render produces an SVG with shapes and edges', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  run(['add', file, '--type', 'userTask', '--name', 'Review', '--between', 'start,end']);
  const svgFile = file.replace(/\.bpmn$/, '.svg');
  run(['render', file, '-o', svgFile]);
  const svg = fs.readFileSync(svgFile, 'utf8');
  assert.match(svg, /<svg /);
  assert.match(svg, /Review/);
  assert.match(svg, /polyline/);
});

test('apply runs a batch of ops', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  const ops = {
    ops: [
      { op: 'add', type: 'userTask', id: 'review', name: 'Review', between: ['start', 'end'] },
      { op: 'add', type: 'exclusiveGateway', id: 'gate', name: 'OK?', between: ['review', 'end'] },
      { op: 'add', type: 'endEvent', id: 'rejected', name: 'Rejected' },
      { op: 'connect', source: 'gate', target: 'rejected', condition: 'return !ok;' },
      { op: 'set', id: 'review', meta: { customAsync: 'true' } },
    ],
  };
  const opsFile = tmpFile('ops.json');
  fs.writeFileSync(opsFile, JSON.stringify(ops));
  run(['apply', file, opsFile]);
  const desc = describeFile(file);
  assert.equal(desc.nodes.length, 5);
  assert.equal(desc.flows.length, 4);
  const xml = fs.readFileSync(file, 'utf8');
  assert.match(xml, /customAsync/);
});

test('event definitions', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  run(['add', file, '--type', 'intermediateCatchEvent', '--id', 'wait', '--name', 'Wait', '--between', 'start,end', '--event-def', 'timer']);
  const desc = describeFile(file);
  const wait = desc.nodes.find((n) => n.id === 'wait');
  assert.ok(wait);
  assert.deepEqual(wait.eventDefinitions, ['TimerEventDefinition']);
});

test('errors are actionable: unknown id lists known ids', () => {
  const file = tmpFile('p.bpmn');
  run(['new', file, '--id', 'proc1']);
  assert.throws(
    () => run(['connect', file, 'nope', 'end'], { stdio: 'pipe' }),
    (err: unknown) => {
      const e = err as ExecError;
      assert.match(String(e.stderr), /not found/);
      assert.match(String(e.stderr), /known ids/);
      return true;
    }
  );
});
