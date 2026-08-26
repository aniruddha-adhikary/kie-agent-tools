import fs from "node:fs";
import { Command } from "commander";
import { loadModel, saveModel, type LoadedModel } from "./model.js";
import {
  addNode,
  connect,
  removeElement,
  setProps,
  setLiteralExpression,
  setDecisionTable,
  NODE_TYPES,
  type DecisionTableSpec,
} from "./ops.js";
import { describeModel, describeText } from "./describe.js";
import { layoutModel } from "./layout.js";
import { renderSvg } from "./render.js";
import { lintModelFeel } from "./feel.js";
import { structuralChecks } from "./validate.js";
import { jitValidate, jitEvaluate } from "./jit.js";
import { scaffoldXml } from "./scaffold.js";

async function writeBack(file: string, model: LoadedModel, opts: { layout?: boolean } = {}): Promise<void> {
  if (opts.layout !== false) {
    try {
      await layoutModel(model.definitions);
    } catch (err) {
      console.error(`warning: auto-layout failed (${err instanceof Error ? err.message : err}); saved without DI update`);
    }
  }
  saveModel(file, model);
}

function fail(err: unknown): never {
  console.error(`error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

export function buildProgram(): Command {
  const program = new Command();
  program.name("dmnctl").description("Semantic DMN editing, layout, validation and evaluation for agents");

  program
    .command("new")
    .description("create a new empty DMN model")
    .argument("<file>", "output .dmn file")
    .requiredOption("--name <name>", "model name")
    .action((file: string, opts: { name: string }) => {
      if (fs.existsSync(file)) fail(new Error(`${file} already exists`));
      fs.writeFileSync(file, scaffoldXml({ name: opts.name }));
      console.log(`created ${file}`);
    });

  program
    .command("describe")
    .description("summarize the model (nodes, requirements, expressions, types)")
    .argument("<file>")
    .option("--json", "output JSON")
    .action((file: string, opts: { json?: boolean }) => {
      try {
        const model = loadModel(file);
        const desc = describeModel(model.definitions);
        console.log(opts.json ? JSON.stringify(desc, null, 2) : describeText(desc));
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("add")
    .description("add a DRG node or annotation")
    .argument("<file>")
    .requiredOption("--type <type>", `one of: ${Object.keys(NODE_TYPES).join(", ")}`)
    .option("--name <name>", "node name")
    .option("--type-ref <typeRef>", "FEEL type of the node's variable")
    .option("--id <id>", "explicit id")
    .option("--no-layout", "skip diagram re-layout")
    .action(async (file: string, opts: { type: string; name?: string; typeRef?: string; id?: string; layout: boolean }) => {
      try {
        const model = loadModel(file);
        const node = addNode(model.definitions, opts);
        await writeBack(file, model, { layout: opts.layout });
        console.log(`added ${node.__$$element} ${node["@_id"]}`);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("connect")
    .description("connect two nodes with the appropriate DMN requirement")
    .argument("<file>")
    .argument("<source>", "source id or name")
    .argument("<target>", "target id or name")
    .option("--no-layout", "skip diagram re-layout")
    .action(async (file: string, source: string, target: string, opts: { layout: boolean }) => {
      try {
        const model = loadModel(file);
        const result = connect(model.definitions, source, target);
        await writeBack(file, model, { layout: opts.layout });
        console.log(`added ${result.kind} ${result.id}`);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("rm")
    .description("remove a node and all requirements referencing it")
    .argument("<file>")
    .argument("<id>", "id or name")
    .option("--no-layout", "skip diagram re-layout")
    .action(async (file: string, id: string, opts: { layout: boolean }) => {
      try {
        const model = loadModel(file);
        const el = removeElement(model.definitions, id);
        await writeBack(file, model, { layout: opts.layout });
        console.log(`removed ${el.__$$element} ${el["@_id"]}`);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("set")
    .description("set properties of a node")
    .argument("<file>")
    .argument("<id>", "id or name")
    .option("--name <name>", "rename (also renames the variable)")
    .option("--type-ref <typeRef>", "set the variable's FEEL type")
    .option("--no-layout", "skip diagram re-layout")
    .action(async (file: string, id: string, opts: { name?: string; typeRef?: string; layout: boolean }) => {
      try {
        const model = loadModel(file);
        const el = setProps(model.definitions, id, opts);
        await writeBack(file, model, { layout: opts.layout });
        console.log(`updated ${el.__$$element} ${el["@_id"]}`);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("set-expression")
    .description("set a decision's logic: FEEL literal or decision table")
    .argument("<file>")
    .argument("<decision>", "decision id or name")
    .option("--feel <expression>", "FEEL literal expression")
    .option("--table <file.json>", "decision table spec JSON ({hitPolicy, inputs, outputs, rules})")
    .option("--type-ref <typeRef>", "result type (literal expressions)")
    .action(async (file: string, decision: string, opts: { feel?: string; table?: string; typeRef?: string }) => {
      try {
        const model = loadModel(file);
        if (opts.feel !== undefined) {
          setLiteralExpression(model.definitions, decision, { feel: opts.feel, ...(opts.typeRef ? { typeRef: opts.typeRef } : {}) });
        } else if (opts.table !== undefined) {
          const spec = JSON.parse(fs.readFileSync(opts.table, "utf8")) as DecisionTableSpec;
          setDecisionTable(model.definitions, decision, spec);
        } else {
          throw new Error("pass --feel <expression> or --table <file.json>");
        }
        await writeBack(file, model, { layout: false });
        console.log(`set expression on ${decision}`);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("layout")
    .description("regenerate all DMNDI diagram coordinates")
    .argument("<file>")
    .action(async (file: string) => {
      try {
        const model = loadModel(file);
        await layoutModel(model.definitions);
        saveModel(file, model);
        console.log(`layouted ${file}`);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("render")
    .description("render the diagram to SVG for visual verification")
    .argument("<file>")
    .option("-o, --output <svg>", "output file (default: <file>.svg)")
    .action((file: string, opts: { output?: string }) => {
      try {
        const model = loadModel(file);
        const out = opts.output ?? file.replace(/\.dmn$/i, "") + ".svg";
        fs.writeFileSync(out, renderSvg(model.definitions));
        console.log(`rendered ${out}`);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("lint-feel")
    .description("offline FEEL syntax check of all expressions")
    .argument("<file>")
    .option("--json", "output JSON")
    .action((file: string, opts: { json?: boolean }) => {
      try {
        const model = loadModel(file);
        const issues = lintModelFeel(model.definitions);
        if (opts.json) {
          console.log(JSON.stringify(issues, null, 2));
        } else if (issues.length === 0) {
          console.log("FEEL OK");
        } else {
          for (const i of issues) console.log(`error  ${i.where}: ${i.message}`);
        }
        if (issues.length > 0) process.exit(1);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("validate")
    .description("structural + FEEL checks; add --jit <url> for full kie-dmn-validator")
    .argument("<file>")
    .option("--json", "output JSON")
    .option("--jit <url>", "also validate via a running jitexecutor")
    .action(async (file: string, opts: { json?: boolean; jit?: string }) => {
      try {
        const model = loadModel(file);
        const issues = structuralChecks(model.definitions);
        let jitMessages: unknown;
        if (opts.jit) jitMessages = await jitValidate(file, { jitUrl: opts.jit });
        if (opts.json) {
          console.log(JSON.stringify({ issues, ...(jitMessages !== undefined ? { jit: jitMessages } : {}) }, null, 2));
        } else {
          for (const i of issues) console.log(`${i.severity}  ${i.rule}  ${i.message}`);
          if (jitMessages !== undefined) console.log(`jit: ${JSON.stringify(jitMessages)}`);
          if (issues.length === 0) console.log("OK");
        }
        if (issues.some((i) => i.severity === "error")) process.exit(1);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("eval")
    .description("evaluate the model with a JSON context via jitexecutor")
    .argument("<file>")
    .requiredOption("--context <ctx>", "JSON object or path to a JSON file")
    .option("--jit <url>", "jitexecutor base URL (default: $JITEXECUTOR_URL or http://localhost:8080)")
    .action(async (file: string, opts: { context: string; jit?: string }) => {
      try {
        const raw = fs.existsSync(opts.context) ? fs.readFileSync(opts.context, "utf8") : opts.context;
        const context = JSON.parse(raw) as Record<string, unknown>;
        const result = await jitEvaluate(file, context, opts.jit ? { jitUrl: opts.jit } : {});
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        fail(err);
      }
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}

void run(process.argv);
