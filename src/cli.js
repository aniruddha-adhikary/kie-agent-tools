import fs from 'node:fs';
import { Command, Option } from 'commander';
import { layoutProcess } from 'bpmn-auto-layout';
import {
  loadModel,
  saveModel,
  serializeModel,
  getProcess,
  findElement,
} from './model.js';
import {
  addNode,
  connect,
  removeElement,
  setAttrs,
  setDroolsMeta,
  nodeTypeNames,
  eventDefinitionNames,
} from './ops.js';
import { describeProcess, describeText } from './describe.js';
import { lint, structuralChecks } from './validate.js';
import { renderSvg } from './render.js';
import { scaffoldXml } from './scaffold.js';

function collectKeyValue(value, previous) {
  const idx = value.indexOf('=');
  if (idx < 0) {
    throw new Error(`expected key=value, got: ${value}`);
  }
  return { ...previous, [value.slice(0, idx)]: value.slice(idx + 1) };
}

async function writeBack(file, moddle, definitions, { layout = true } = {}) {
  let xml = await serializeModel(moddle, definitions);
  if (layout) {
    try {
      xml = await layoutProcess(xml);
    } catch (err) {
      console.error(`warning: auto-layout failed (${err.message}); saved without DI update`);
    }
  }
  fs.writeFileSync(file, xml);
}

async function relayout(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const laid = await layoutProcess(xml);
  fs.writeFileSync(file, laid);
}

export function buildProgram() {
  const program = new Command();

  program
    .name('bpmnctl')
    .description(
      'Edit BPMN 2.0 files (Kogito / jBPM / KIE flavored) semantically from the command line.\n' +
        'Diagram coordinates (BPMN DI) are recomputed automatically after every edit,\n' +
        'so callers never deal with x/y positions or waypoints.'
    )
    .version('0.1.0');

  program
    .command('new')
    .description('create a new BPMN file with a start and end event')
    .argument('<file>', 'output .bpmn file')
    .requiredOption('--id <id>', 'process id')
    .option('--name <name>', 'process name (defaults to id)')
    .option('--package <package>', 'drools:packageName', 'com.example')
    .option('--force', 'overwrite existing file')
    .action(async (file, opts) => {
      if (fs.existsSync(file) && !opts.force) {
        throw new Error(`${file} already exists (use --force to overwrite)`);
      }
      fs.writeFileSync(file, scaffoldXml({ id: opts.id, name: opts.name, packageName: opts.package }));
      await relayout(file);
      console.log(`created ${file} with process <${opts.id}> (start -> end)`);
    });

  program
    .command('describe')
    .description('summarize the process: nodes, flows, attributes (agent-friendly)')
    .argument('<file>')
    .option('--process <id>', 'process id (if the file has several)')
    .option('--json', 'output JSON instead of text')
    .action(async (file, opts) => {
      const { definitions } = await loadModel(file);
      const process = getProcess(definitions, opts.process);
      const desc = describeProcess(definitions, process);
      desc.file = file;
      console.log(opts.json ? JSON.stringify(desc, null, 2) : describeText(desc));
    });

  program
    .command('add')
    .description('add a node and wire it into the flow; layout is recomputed')
    .argument('<file>')
    .addOption(
      new Option('--type <type>', 'node type').choices(nodeTypeNames()).makeOptionMandatory()
    )
    .option('--id <id>', 'node id (generated from name if omitted)')
    .option('--name <name>', 'node name')
    .option('--after <nodeId>', 'connect from this node to the new node')
    .option('--before <nodeId>', 'connect from the new node to this node')
    .option(
      '--between <src,dst>',
      'splice the new node into the existing flow between two nodes',
      (v) => v.split(',').map((s) => s.trim())
    )
    .option('--container <subProcessId>', 'add inside this subProcess')
    .addOption(
      new Option('--event-def <kind>', 'event definition for event nodes').choices(
        eventDefinitionNames()
      )
    )
    .option('--script <code>', 'script body (scriptTask only)')
    .option('--script-format <format>', 'script format URI (default java)')
    .option('--attr <key=value>', 'set attribute (repeatable; use drools: prefix for extensions)', collectKeyValue, {})
    .option('--meta <name=value>', 'set drools:metaData entry (repeatable)', collectKeyValue, {})
    .option('--process <id>', 'process id (if the file has several)')
    .option('--no-layout', 'skip DI regeneration')
    .action(async (file, opts) => {
      const { moddle, definitions } = await loadModel(file);
      const process = getProcess(definitions, opts.process);
      const { node, flows } = addNode(moddle, process, {
        type: opts.type,
        id: opts.id,
        name: opts.name,
        after: opts.after,
        before: opts.before,
        between: opts.between,
        container: opts.container,
        eventDefinition: opts.eventDef,
        script: opts.script,
        scriptFormat: opts.scriptFormat,
        attrs: opts.attr,
      });
      for (const [k, v] of Object.entries(opts.meta)) {
        setDroolsMeta(moddle, node, k, v);
      }
      await writeBack(file, moddle, definitions, { layout: opts.layout });
      console.log(
        `added ${opts.type} <${node.id}>${flows.length ? `; flows: ${flows.map((f) => `${f.sourceRef.id} -> ${f.targetRef.id}`).join(', ')}` : ''}`
      );
    });

  program
    .command('connect')
    .description('add a sequence flow between two nodes; layout is recomputed')
    .argument('<file>')
    .argument('<source>', 'source node id')
    .argument('<target>', 'target node id')
    .option('--id <id>', 'flow id')
    .option('--name <name>', 'flow name')
    .option('--condition <expression>', 'condition expression body')
    .option('--language <uri>', 'expression language URI (e.g. http://www.java.com/java)')
    .option('--default', 'mark as the default flow of the source gateway/activity')
    .option('--process <id>', 'process id (if the file has several)')
    .option('--no-layout', 'skip DI regeneration')
    .action(async (file, source, target, opts) => {
      const { moddle, definitions } = await loadModel(file);
      const process = getProcess(definitions, opts.process);
      const flow = connect(moddle, process, source, target, {
        id: opts.id,
        name: opts.name,
        condition: opts.condition,
        language: opts.language,
        default: opts.default,
      });
      await writeBack(file, moddle, definitions, { layout: opts.layout });
      console.log(`connected ${source} -> ${target} as <${flow.id}>`);
    });

  program
    .command('rm')
    .description('remove a node (and its flows) or a sequence flow; layout is recomputed')
    .argument('<file>')
    .argument('<id>', 'node or flow id')
    .option('--reconnect', 'bridge predecessors to successors of the removed node')
    .option('--process <id>', 'process id (if the file has several)')
    .option('--no-layout', 'skip DI regeneration')
    .action(async (file, id, opts) => {
      const { moddle, definitions } = await loadModel(file);
      const process = getProcess(definitions, opts.process);
      const { removed, flows } = removeElement(moddle, process, id, {
        reconnect: opts.reconnect,
      });
      await writeBack(file, moddle, definitions, { layout: opts.layout });
      console.log(
        `removed ${removed.map((e) => `<${e.id}>`).join(', ')}${flows.length ? `; reconnected: ${flows.map((f) => `${f.sourceRef.id} -> ${f.targetRef.id}`).join(', ')}` : ''}`
      );
    });

  program
    .command('set')
    .description('update properties of a node, flow, or the process itself')
    .argument('<file>')
    .argument('<id>', 'element id, or the process id')
    .option('--name <name>', 'set name')
    .option('--attr <key=value>', 'set attribute (repeatable; use drools: prefix for extensions)', collectKeyValue, {})
    .option('--meta <name=value>', 'set drools:metaData entry (repeatable)', collectKeyValue, {})
    .option('--script <code>', 'set script body (scriptTask only)')
    .option('--script-format <format>', 'script format URI')
    .option('--condition <expression>', 'set condition expression (sequenceFlow only)')
    .option('--language <uri>', 'expression language URI for --condition')
    .option('--process <id>', 'process id (if the file has several)')
    .option('--no-layout', 'skip DI regeneration')
    .action(async (file, id, opts) => {
      const { moddle, definitions } = await loadModel(file);
      const process = getProcess(definitions, opts.process);
      const element = process.id === id ? process : findElement(process, id);
      if (opts.name !== undefined) {
        element.name = opts.name;
        if (element !== process) setDroolsMeta(moddle, element, 'elementname', opts.name);
      }
      setAttrs(element, opts.attr);
      for (const [k, v] of Object.entries(opts.meta)) {
        setDroolsMeta(moddle, element, k, v);
      }
      if (opts.script !== undefined) {
        if (element.$type !== 'bpmn:ScriptTask') {
          throw new Error(`--script requires a scriptTask, <${id}> is ${element.$type}`);
        }
        element.script = opts.script;
        element.scriptFormat = opts.scriptFormat || element.scriptFormat || 'http://www.java.com/java';
      }
      if (opts.condition !== undefined) {
        if (element.$type !== 'bpmn:SequenceFlow') {
          throw new Error(`--condition requires a sequenceFlow, <${id}> is ${element.$type}`);
        }
        const expr = moddle.create('bpmn:FormalExpression', { body: opts.condition });
        if (opts.language) expr.language = opts.language;
        expr.$parent = element;
        element.conditionExpression = expr;
      }
      await writeBack(file, moddle, definitions, { layout: opts.layout });
      console.log(`updated <${id}>`);
    });

  program
    .command('layout')
    .description('regenerate all diagram coordinates from the process structure (fixes DI after raw XML edits)')
    .argument('<file>')
    .action(async (file) => {
      await relayout(file);
      console.log(`layout regenerated for ${file}`);
    });

  program
    .command('validate')
    .description('lint the file (bpmnlint recommended rules + structural checks); exits 1 on errors')
    .argument('<file>')
    .option('--process <id>', 'process id (if the file has several)')
    .option('--json', 'output JSON')
    .action(async (file, opts) => {
      const { definitions, warnings } = await loadModel(file);
      const process = getProcess(definitions, opts.process);
      const issues = [
        ...structuralChecks(process, warnings),
        ...(await lint(definitions)),
      ];
      if (opts.json) {
        console.log(JSON.stringify({ file, issues }, null, 2));
      } else if (!issues.length) {
        console.log(`${file}: OK`);
      } else {
        for (const issue of issues) {
          console.log(`${issue.category}  ${issue.id || '-'}  ${issue.message}  (${issue.rule})`);
        }
      }
      if (issues.some((i) => i.category === 'error')) {
        globalThis.process.exitCode = 1;
      }
    });

  program
    .command('render')
    .description('render the diagram to SVG so the result can be checked visually')
    .argument('<file>')
    .option('-o, --output <file>', 'output SVG file (default: <file>.svg)')
    .action(async (file, opts) => {
      const { definitions } = await loadModel(file);
      const svg = renderSvg(definitions);
      const out = opts.output || file.replace(/\.bpmn2?$/, '') + '.svg';
      fs.writeFileSync(out, svg);
      console.log(`rendered ${out}`);
    });

  program
    .command('apply')
    .description('apply a batch of operations from a JSON file (or stdin with "-")')
    .argument('<file>')
    .argument('<ops>', 'JSON file with {"ops": [...]}, or "-" for stdin')
    .option('--process <id>', 'process id (if the file has several)')
    .option('--no-layout', 'skip DI regeneration')
    .action(async (file, opsFile, opts) => {
      const raw = opsFile === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(opsFile, 'utf8');
      const parsed = JSON.parse(raw);
      const ops = Array.isArray(parsed) ? parsed : parsed.ops;
      if (!Array.isArray(ops)) {
        throw new Error('expected a JSON array or an object with an "ops" array');
      }
      const { moddle, definitions } = await loadModel(file);
      const process = getProcess(definitions, opts.process);
      const log = [];
      for (const op of ops) {
        switch (op.op) {
          case 'add': {
            const { node, flows } = addNode(moddle, process, op);
            for (const [k, v] of Object.entries(op.meta || {})) {
              setDroolsMeta(moddle, node, k, v);
            }
            log.push(`add ${op.type} <${node.id}>${flows.length ? ` (${flows.length} flows)` : ''}`);
            break;
          }
          case 'connect': {
            const flow = connect(moddle, process, op.source, op.target, op);
            log.push(`connect ${op.source} -> ${op.target} <${flow.id}>`);
            break;
          }
          case 'rm': {
            const { removed } = removeElement(moddle, process, op.id, op);
            log.push(`rm ${removed.map((e) => `<${e.id}>`).join(', ')}`);
            break;
          }
          case 'set': {
            const element = process.id === op.id ? process : findElement(process, op.id);
            if (op.name !== undefined) {
              element.name = op.name;
              if (element !== process) setDroolsMeta(moddle, element, 'elementname', op.name);
            }
            setAttrs(element, op.attrs || {});
            for (const [k, v] of Object.entries(op.meta || {})) {
              setDroolsMeta(moddle, element, k, v);
            }
            log.push(`set <${op.id}>`);
            break;
          }
          default:
            throw new Error(`unknown op <${op.op}>; supported: add, connect, rm, set`);
        }
      }
      await writeBack(file, moddle, definitions, { layout: opts.layout });
      for (const line of log) console.log(line);
      console.log(`applied ${ops.length} op(s) to ${file}`);
    });

  return program;
}

export async function run(argv) {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    console.error(`error: ${err.message}`);
    globalThis.process.exitCode = 1;
  }
}
