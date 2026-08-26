import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { loadModel, saveModel, type LoadedModel, columnName } from "./model.js";
import { newModel } from "./scaffold.js";
import { addColumn, removeColumn, addRow, setCell, removeRow } from "./ops.js";
import { describeModel, describeText } from "./describe.js";
import { structuralChecks, type Finding } from "./validate.js";
import { readDmnModel } from "./dmnsync.js";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseJsonArg(value: string): Record<string, string> {
  const text = value.startsWith("@") ? fs.readFileSync(value.slice(1), "utf8") : value;
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("values must be a JSON object mapping column names to cell values");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function resolveDmnFile(file: string, model: LoadedModel, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const declared = model.model.settings.dmnFilePath?.__$$text;
  if (!declared) return undefined;
  for (const candidate of [declared, path.join(path.dirname(file), declared)]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function printFindings(findings: Finding[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ findings, ok: !findings.some((f) => f.severity === "error") }, null, 2));
  } else if (findings.length === 0) {
    console.log("ok: no findings");
  } else {
    for (const f of findings) console.log(`${f.severity}  ${f.rule}  ${f.message}`);
  }
  if (findings.some((f) => f.severity === "error")) process.exit(1);
}

export function buildProgram(): Command {
  const program = new Command()
    .name("scesimctl")
    .description("Semantic editing for KIE .scesim test scenario files (agent-friendly)");

  program
    .command("new")
    .description("create a new .scesim file (DMN or RULE based)")
    .argument("<file>", ".scesim file to create")
    .option("--dmn <dmnFile>", "DMN model to test; columns are derived from its inputs/decisions")
    .option("--dmn-path <path>", "dmnFilePath to record in the file (default: relative path to --dmn)")
    .option("--rule", "create a RULE (DRL) based scenario instead of DMN")
    .option("--session <name>", "kie-session name (RULE only)")
    .option("--rule-flow-group <name>", "rule flow group (RULE only)")
    .action((file: string, opts: { dmn?: string; dmnPath?: string; rule?: boolean; session?: string; ruleFlowGroup?: string }) => {
      if (fs.existsSync(file)) fail(`${file} already exists`);
      let model: LoadedModel;
      if (opts.rule) {
        model = newModel({
          kind: "RULE",
          ...(opts.session !== undefined ? { dmoSession: opts.session } : {}),
          ...(opts.ruleFlowGroup !== undefined ? { ruleFlowGroup: opts.ruleFlowGroup } : {}),
        });
      } else if (opts.dmn) {
        const dmn = readDmnModel(opts.dmn);
        const dmnFilePath = opts.dmnPath ?? path.relative(path.dirname(file), opts.dmn);
        model = newModel({ kind: "DMN", dmnFilePath, dmnNamespace: dmn.namespace, dmnName: dmn.name });
        for (const col of dmn.columns) addColumn(model.model, col);
        console.log(`created ${file} with ${dmn.columns.length} columns from ${opts.dmn}`);
      } else {
        fail("pass --dmn <model.dmn> or --rule");
      }
      saveModel(file, model);
      if (opts.rule) console.log(`created ${file}`);
    });

  program
    .command("describe")
    .description("summarize settings, columns, and scenario rows")
    .argument("<file>")
    .option("--json", "machine-readable output")
    .action((file: string, opts: { json?: boolean }) => {
      const d = describeModel(loadModel(file).model);
      console.log(opts.json ? JSON.stringify(d, null, 2) : describeText(d));
    });

  program
    .command("add-column")
    .description("add a GIVEN or EXPECT column")
    .argument("<file>")
    .option("--given <path>", 'input column, e.g. "Credit Score" or "Applicant.Age"')
    .option("--expect <path>", "expected-result column (decision name for DMN)")
    .option("--type <type>", "cell value type (FEEL type for DMN, Java class for RULE)", "Any")
    .option("--fact-type <type>", "type of the fact itself (defaults sensibly)")
    .action((file: string, opts: { given?: string; expect?: string; type: string; factType?: string }) => {
      if ((opts.given === undefined) === (opts.expect === undefined)) fail("pass exactly one of --given or --expect");
      const model = loadModel(file);
      const fm = addColumn(model.model, {
        kind: opts.given !== undefined ? "GIVEN" : "EXPECT",
        path: (opts.given ?? opts.expect) as string,
        type: opts.type,
        ...(opts.factType !== undefined ? { factType: opts.factType } : {}),
      });
      saveModel(file, model);
      console.log(`added ${opts.given !== undefined ? "GIVEN" : "EXPECT"} column ${columnName(fm)}`);
    });

  program
    .command("rm-column")
    .description("remove a column and its cells")
    .argument("<file>")
    .argument("<name>", "column name as shown by describe")
    .action((file: string, name: string) => {
      const model = loadModel(file);
      removeColumn(model.model, name);
      saveModel(file, model);
      console.log(`removed column ${name}`);
    });

  program
    .command("add-row")
    .description("append a scenario row")
    .argument("<file>")
    .requiredOption("--values <json>", 'JSON object of column -> value, or @file.json')
    .option("--description <text>", "scenario description")
    .action((file: string, opts: { values: string; description?: string }) => {
      const model = loadModel(file);
      const index = addRow(model.model, parseJsonArg(opts.values), opts.description);
      saveModel(file, model);
      console.log(`added row ${index}`);
    });

  program
    .command("set-cell")
    .description("set one cell of an existing row")
    .argument("<file>")
    .requiredOption("--row <n>", "1-based row index")
    .requiredOption("--column <name>", "column name as shown by describe")
    .requiredOption("--value <value>")
    .action((file: string, opts: { row: string; column: string; value: string }) => {
      const model = loadModel(file);
      setCell(model.model, Number(opts.row), opts.column, opts.value);
      saveModel(file, model);
      console.log(`set row ${opts.row} ${opts.column} = ${opts.value}`);
    });

  program
    .command("rm-row")
    .description("remove a scenario row")
    .argument("<file>")
    .argument("<n>", "1-based row index")
    .action((file: string, n: string) => {
      const model = loadModel(file);
      removeRow(model.model, Number(n));
      saveModel(file, model);
      console.log(`removed row ${n}`);
    });

  program
    .command("sync-dmn")
    .description("add columns for DMN inputs/decisions that have no column yet")
    .argument("<file>")
    .option("--dmn <dmnFile>", "DMN model (default: settings.dmnFilePath)")
    .action((file: string, opts: { dmn?: string }) => {
      const model = loadModel(file);
      const dmnFile = resolveDmnFile(file, model, opts.dmn);
      if (!dmnFile) fail("cannot locate the DMN model; pass --dmn <file>");
      const existing = new Set(describeModel(model.model).columns.map((c) => c.name));
      let added = 0;
      for (const col of readDmnModel(dmnFile).columns) {
        if (existing.has(col.path)) continue;
        addColumn(model.model, col);
        added += 1;
        console.log(`added ${col.kind} column ${col.path}`);
      }
      saveModel(file, model);
      console.log(added === 0 ? "already in sync" : `added ${added} columns`);
    });

  program
    .command("validate")
    .description("structural checks; cross-checks against the DMN model when available")
    .argument("<file>")
    .option("--dmn <dmnFile>", "DMN model (default: settings.dmnFilePath if resolvable)")
    .option("--json", "machine-readable output")
    .action((file: string, opts: { dmn?: string; json?: boolean }) => {
      const model = loadModel(file);
      const dmnFile = resolveDmnFile(file, model, opts.dmn);
      printFindings(structuralChecks(model.model, dmnFile !== undefined ? { dmnFile } : {}), opts.json === true);
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

void run(process.argv);
