import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import { buildIndex } from "./parse.js";
import { runChecks } from "./checks.js";
import type { Finding } from "./types.js";

function printText(findings: Finding[], counts: { errors: number; warnings: number }): void {
  for (const f of findings) {
    console.log(`${f.severity === "error" ? "error  " : "warning"}  ${f.file}  ${f.message}  (${f.rule})`);
  }
  if (findings.length > 0) console.log("");
  console.log(`${counts.errors} error(s), ${counts.warnings} warning(s)`);
}

const program = new Command();
program
  .name("kie-doctor")
  .description("Cross-asset broken-reference lint for KIE/Kogito projects (BPMN, DMN, DRL, scesim)")
  .argument("[dir]", "project directory to scan (e.g. src/main/resources)", ".")
  .option("--json", "machine-readable output")
  .action((dir: string, opts: { json?: boolean }) => {
    const root = path.resolve(dir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      console.error(`error: "${dir}" is not a directory`);
      process.exit(2);
    }
    const index = buildIndex(root);
    const findings = runChecks(index);
    const counts = {
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
    };
    if (opts.json === true) {
      console.log(
        JSON.stringify(
          {
            root,
            scanned: {
              bpmn: index.bpmn.map((a) => path.relative(root, a.file)),
              dmn: index.dmn.map((a) => path.relative(root, a.file)),
              drl: index.drl.map((a) => path.relative(root, a.file)),
              scesim: index.scesim.map((a) => path.relative(root, a.file)),
            },
            findings,
            ok: counts.errors === 0,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `scanned ${index.bpmn.length} bpmn, ${index.dmn.length} dmn, ${index.drl.length} drl, ${index.scesim.length} scesim`,
      );
      printText(findings, counts);
    }
    process.exit(counts.errors > 0 ? 1 : 0);
  });

program.parse();
