import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { ensureRunner, invokeRunner, type RunnerResult } from "./runner.js";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printDiagnostics(result: RunnerResult): void {
  for (const d of result.diagnostics) {
    const location = d.line > 0 ? ` line ${d.line}${d.column > 0 ? `:${d.column}` : ""}` : "";
    console.log(`${d.severity}${location}  ${d.message}`);
  }
  console.log(result.ok ? "ok" : `${result.diagnostics.filter((d) => d.severity === "error").length} error(s)`);
}

function readFactsArg(arg: string): string {
  const json = arg.startsWith("@") ? fs.readFileSync(arg.slice(1), "utf8") : arg;
  JSON.parse(json);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drlcheck-")), "facts.json");
  fs.writeFileSync(tmp, json);
  return tmp;
}

export function buildProgram(): Command {
  const program = new Command()
    .name("drlcheck")
    .description("Fast DRL compile-checks and rule-firing dry runs (Apache KIE / Drools)");

  program
    .command("compile")
    .description("compile-check DRL files and report diagnostics")
    .argument("<files...>", ".drl files")
    .option("--json", "machine-readable output")
    .action((files: string[], opts: { json?: boolean }) => {
      const result = invokeRunner(["compile", ...files]);
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else printDiagnostics(result);
      if (!result.ok) process.exit(1);
    });

  program
    .command("describe")
    .description("list rules and declared fact types in DRL files")
    .argument("<files...>", ".drl files")
    .option("--json", "machine-readable output")
    .action((files: string[], opts: { json?: boolean }) => {
      const result = invokeRunner(["describe", ...files]);
      if (!result.ok) {
        printDiagnostics(result);
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("rules:");
      for (const rule of result.rules ?? []) console.log(`  - ${rule.name}  (${rule.package})`);
      console.log("declared types:");
      for (const type of result.declaredTypes ?? []) {
        console.log(`  - ${type.name}`);
        for (const field of type.fields) console.log(`      ${field.name}: ${field.type}`);
      }
    });

  program
    .command("run")
    .description("dry-run: insert facts, fire all rules, report what fired and the resulting facts")
    .argument("<files...>", ".drl files")
    .requiredOption("--facts <json-or-@file>", 'facts as JSON array [{"type":"Applicant","data":{...}}] or @facts.json')
    .option("--json", "machine-readable output")
    .action((files: string[], opts: { facts: string; json?: boolean }) => {
      const factsFile = readFactsArg(opts.facts);
      const result = invokeRunner(["run", ...files, "--facts", factsFile]);
      if (!result.ok) {
        printDiagnostics(result);
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`fired ${result.firedCount ?? 0} rule(s):`);
      for (const fired of result.fired ?? []) console.log(`  - ${fired.rule}  (${fired.package})`);
      console.log("facts after firing:");
      for (const fact of result.factsAfter ?? []) {
        console.log(`  - ${fact.type}: ${typeof fact.data === "string" ? fact.data : JSON.stringify(fact.data)}`);
      }
    });

  program
    .command("setup")
    .description("pre-build the cached Drools runner (downloads Drools via Maven; run once)")
    .option("--force", "rebuild even if cached")
    .action((opts: { force?: boolean }) => {
      const jar = ensureRunner({ force: opts.force ?? false });
      console.log(`runner ready: ${jar}`);
    });

  return program;
}

export function run(argv: string[]): void {
  try {
    buildProgram().parse(argv);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

run(process.argv);
