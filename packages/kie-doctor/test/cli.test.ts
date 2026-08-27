import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import url from "node:url";

const execFileAsync = promisify(execFile);
const here = path.dirname(url.fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "bin", "kie-doctor.js");
const goodDir = path.join(here, "fixtures", "good");
const brokenDir = path.join(here, "fixtures", "broken");

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(...args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cli, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

interface JsonReport {
  scanned: { bpmn: string[]; dmn: string[]; drl: string[]; scesim: string[] };
  findings: { severity: string; rule: string; file: string; message: string }[];
  ok: boolean;
}

test("clean project passes with no errors", async () => {
  const res = await run(goodDir, "--json");
  assert.equal(res.code, 0);
  const report = JSON.parse(res.stdout) as JsonReport;
  assert.equal(report.ok, true);
  assert.deepEqual(report.scanned.bpmn, ["approval.bpmn", "sub.bpmn"]);
  assert.deepEqual(report.scanned.dmn, ["loan.dmn"]);
  assert.deepEqual(report.scanned.drl, ["rules.drl"]);
  assert.deepEqual(report.scanned.scesim, ["loan.scesim"]);
  assert.equal(report.findings.filter((f) => f.severity === "error").length, 0);
});

test("broken project reports each cross-reference failure", async () => {
  const res = await run(brokenDir, "--json");
  assert.equal(res.code, 1);
  const report = JSON.parse(res.stdout) as JsonReport;
  assert.equal(report.ok, false);
  const rules = report.findings.map((f) => f.rule);
  assert.ok(rules.includes("call-activity-unknown-process"));
  assert.ok(rules.includes("rule-task-unknown-ruleflow-group"));
  assert.ok(rules.includes("rule-task-dmn-file-missing"));
  assert.ok(rules.includes("rule-task-dmn-namespace-unknown"));
  assert.ok(rules.includes("dmn-import-unknown-namespace"));
  assert.ok(rules.includes("scesim-dmn-file-missing"));
  assert.ok(rules.includes("drl-orphan-ruleflow-group"));
});

test("orphan ruleflow-group is a warning, not an error", async () => {
  const res = await run(brokenDir, "--json");
  const report = JSON.parse(res.stdout) as JsonReport;
  const orphan = report.findings.find((f) => f.rule === "drl-orphan-ruleflow-group");
  assert.ok(orphan);
  assert.equal(orphan.severity, "warning");
  assert.match(orphan.message, /unused-group/);
});

test("text output summarizes counts and exits 1 on errors", async () => {
  const res = await run(brokenDir);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /scanned 1 bpmn, 1 dmn, 1 drl, 1 scesim/);
  assert.match(res.stdout, /error\(s\)/);
  assert.match(res.stdout, /call-activity-unknown-process/);
});

test("clean project text output reports zero errors", async () => {
  const res = await run(goodDir);
  assert.equal(res.code, 0);
  assert.match(res.stdout, /0 error\(s\)/);
});

test("non-existent directory exits 2", async () => {
  const res = await run(path.join(here, "does-not-exist"));
  assert.equal(res.code, 2);
  assert.match(res.stderr, /not a directory/);
});
