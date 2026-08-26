import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "..", "bin", "scesimctl.js");
const loanDmn = path.join(here, "fixtures", "loan.dmn");

function run(args: string[], opts: { cwd: string; expectFailure?: boolean }): string {
  try {
    return execFileSync("node", [bin, ...args], { cwd: opts.cwd, encoding: "utf8" });
  } catch (err) {
    if (opts.expectFailure && err instanceof Error && "stderr" in err && "stdout" in err) {
      return String((err as unknown as { stdout: string }).stdout) + String((err as unknown as { stderr: string }).stderr);
    }
    throw err;
  }
}

function tmpdir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scesimctl-"));
  fs.copyFileSync(loanDmn, path.join(dir, "loan.dmn"));
  return dir;
}

interface Description {
  type?: string;
  dmnName?: string;
  columns: { name: string; kind: string; type: string }[];
  rows: { index: number; description?: string; values: Record<string, string | null> }[];
}

function describe(cwd: string, file: string): Description {
  return JSON.parse(run(["describe", file, "--json"], { cwd })) as Description;
}

test("new --dmn derives GIVEN/EXPECT columns from the DMN model", () => {
  const cwd = tmpdir();
  run(["new", "loan.scesim", "--dmn", "loan.dmn"], { cwd });
  const d = describe(cwd, "loan.scesim");
  assert.equal(d.type, "DMN");
  assert.equal(d.dmnName, "Loan Approval");
  const names = d.columns.map((c) => `${c.kind}:${c.name}`);
  assert.deepEqual(names, [
    "GIVEN:Applicant.Age",
    "GIVEN:Applicant.Monthly Income",
    "GIVEN:Credit Score",
    "EXPECT:Approval",
  ]);
});

test("add-row / set-cell / rm-row round-trip", () => {
  const cwd = tmpdir();
  run(["new", "loan.scesim", "--dmn", "loan.dmn"], { cwd });
  run(
    ["add-row", "loan.scesim", "--values", JSON.stringify({ "Credit Score": "720", Approval: "true" }), "--description", "good"],
    { cwd }
  );
  run(["add-row", "loan.scesim", "--values", JSON.stringify({ "Credit Score": "500", Approval: "false" })], { cwd });
  run(["set-cell", "loan.scesim", "--row", "2", "--column", "Applicant.Age", "--value", "41"], { cwd });
  let d = describe(cwd, "loan.scesim");
  assert.equal(d.rows.length, 2);
  assert.equal(d.rows[0]?.description, "good");
  assert.equal(d.rows[0]?.values["Credit Score"], "720");
  assert.equal(d.rows[1]?.values["Applicant.Age"], "41");
  run(["rm-row", "loan.scesim", "1"], { cwd });
  d = describe(cwd, "loan.scesim");
  assert.equal(d.rows.length, 1);
  assert.equal(d.rows[0]?.values["Credit Score"], "500");
});

test("add-column and rm-column keep rows aligned", () => {
  const cwd = tmpdir();
  run(["new", "loan.scesim", "--dmn", "loan.dmn"], { cwd });
  run(["add-row", "loan.scesim", "--values", "{}"], { cwd });
  run(["add-column", "loan.scesim", "--given", "Requested Amount", "--type", "number"], { cwd });
  run(["set-cell", "loan.scesim", "--row", "1", "--column", "Requested Amount", "--value", "10000"], { cwd });
  let d = describe(cwd, "loan.scesim");
  assert.equal(d.rows[0]?.values["Requested Amount"], "10000");
  run(["rm-column", "loan.scesim", "Requested Amount"], { cwd });
  d = describe(cwd, "loan.scesim");
  assert.ok(!d.columns.some((c) => c.name === "Requested Amount"));
  assert.ok(!("Requested Amount" in (d.rows[0]?.values ?? {})));
});

test("add-row rejects unknown columns with a helpful error", () => {
  const cwd = tmpdir();
  run(["new", "loan.scesim", "--dmn", "loan.dmn"], { cwd });
  const out = run(["add-row", "loan.scesim", "--values", JSON.stringify({ Nope: "1" })], { cwd, expectFailure: true });
  assert.match(out, /unknown column "Nope"/);
  assert.match(out, /Known columns:.*Credit Score/);
});

test("validate cross-checks columns against the DMN model", () => {
  const cwd = tmpdir();
  run(["new", "loan.scesim", "--dmn", "loan.dmn"], { cwd });
  run(["add-column", "loan.scesim", "--given", "Ghost Input", "--type", "number"], { cwd });
  const out = run(["validate", "loan.scesim", "--json"], { cwd, expectFailure: true });
  const parsed = JSON.parse(out.slice(out.indexOf("{"))) as { ok: boolean; findings: { rule: string }[] };
  assert.equal(parsed.ok, false);
  assert.ok(parsed.findings.some((f) => f.rule === "unknown-dmn-node"));
});

test("sync-dmn adds only missing columns", () => {
  const cwd = tmpdir();
  run(["new", "loan.scesim", "--dmn", "loan.dmn"], { cwd });
  run(["rm-column", "loan.scesim", "Credit Score"], { cwd });
  const out = run(["sync-dmn", "loan.scesim"], { cwd });
  assert.match(out, /added GIVEN column Credit Score/);
  assert.match(out, /added 1 columns/);
  const again = run(["sync-dmn", "loan.scesim"], { cwd });
  assert.match(again, /already in sync/);
});

test("rule-based scaffold validates with warnings only", () => {
  const cwd = tmpdir();
  run(["new", "r.scesim", "--rule", "--session", "default"], { cwd });
  const out = run(["validate", "r.scesim", "--json"], { cwd });
  const parsed = JSON.parse(out) as { ok: boolean; findings: { severity: string }[] };
  assert.equal(parsed.ok, true);
  assert.ok(parsed.findings.every((f) => f.severity === "warning"));
});

test("output round-trips through the scesim marshaller unchanged", () => {
  const cwd = tmpdir();
  run(["new", "loan.scesim", "--dmn", "loan.dmn"], { cwd });
  run(["add-row", "loan.scesim", "--values", JSON.stringify({ "Credit Score": "700" })], { cwd });
  const before = describe(cwd, "loan.scesim");
  // no-op edit forces a parse + rebuild cycle
  run(["set-cell", "loan.scesim", "--row", "1", "--column", "Credit Score", "--value", "700"], { cwd });
  const after = describe(cwd, "loan.scesim");
  assert.deepEqual(after, before);
  const xml = fs.readFileSync(path.join(cwd, "loan.scesim"), "utf8");
  assert.match(xml, /xmlns="https:\/\/kie\.org\/scesim\/1\.8"/);
  assert.match(xml, /<dmnName>Loan Approval<\/dmnName>/);
});
