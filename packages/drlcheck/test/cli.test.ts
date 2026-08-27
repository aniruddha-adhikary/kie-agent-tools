import assert from "node:assert/strict";
import { test, before } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "..", "bin", "drlcheck.js");
const fixtures = path.join(here, "fixtures");

const localJar = path.join(here, "..", "runner", "target", "drlcheck-runner.jar");
const env: NodeJS.ProcessEnv = { ...process.env };
if (fs.existsSync(localJar)) env["DRLCHECK_JAR"] = localJar;

const javaAvailable = !spawnSync("java", ["-version"], { encoding: "utf8" }).error;

function run(args: string[], opts: { expectFailure?: boolean } = {}): string {
  try {
    return execFileSync("node", [bin, ...args], { encoding: "utf8", env });
  } catch (err) {
    if (opts.expectFailure && err instanceof Error && "stderr" in err) {
      return String((err as unknown as { stdout: string }).stdout) + String((err as unknown as { stderr: string }).stderr);
    }
    throw err;
  }
}

before(() => {
  if (!javaAvailable) return;
  if (!fs.existsSync(localJar)) run(["setup"]);
});

test("compile reports ok for a valid DRL file", { skip: !javaAvailable }, () => {
  const out = run(["compile", path.join(fixtures, "discount.drl")]);
  assert.match(out, /^ok$/m);
});

test("compile reports line-level errors for broken DRL", { skip: !javaAvailable }, () => {
  const out = run(["compile", path.join(fixtures, "broken.drl"), "--json"], { expectFailure: true });
  const parsed = JSON.parse(out) as { ok: boolean; diagnostics: { severity: string; line: number; message: string }[] };
  assert.equal(parsed.ok, false);
  const error = parsed.diagnostics.find((d) => d.severity === "error" && d.line === 6);
  assert.ok(error, "expected an error diagnostic on line 6");
  assert.match(error.message, /mismatched input/);
});

test("describe lists rules and declared types with fields", { skip: !javaAvailable }, () => {
  const out = run(["describe", path.join(fixtures, "discount.drl"), "--json"]);
  const parsed = JSON.parse(out) as {
    rules: { name: string }[];
    declaredTypes: { name: string; fields: { name: string; type: string }[] }[];
  };
  assert.deepEqual(
    parsed.rules.map((r) => r.name).sort(),
    ["Adults are approved", "High income gets discount"]
  );
  const applicant = parsed.declaredTypes.find((t) => t.name === "rules.discount.Applicant");
  assert.ok(applicant);
  assert.ok(applicant.fields.some((f) => f.name === "income" && f.type === "int"));
});

test("run fires rules in order and reports mutated facts", { skip: !javaAvailable }, () => {
  const facts = JSON.stringify([{ type: "Applicant", data: { name: "Ada", age: 30, income: 9000 } }]);
  const out = run(["run", path.join(fixtures, "discount.drl"), "--facts", facts, "--json"]);
  const parsed = JSON.parse(out) as {
    firedCount: number;
    fired: { rule: string }[];
    factsAfter: { type: string; data: Record<string, unknown> }[];
  };
  assert.equal(parsed.firedCount, 2);
  assert.deepEqual(
    parsed.fired.map((f) => f.rule),
    ["Adults are approved", "High income gets discount"]
  );
  const applicant = parsed.factsAfter[0];
  assert.ok(applicant);
  assert.equal(applicant.data["approved"], true);
  assert.equal(applicant.data["discount"], 20);
});

test("run rejects unknown fact types with the list of declared types", { skip: !javaAvailable }, () => {
  const facts = JSON.stringify([{ type: "Nope", data: {} }]);
  const out = run(["run", path.join(fixtures, "discount.drl"), "--facts", facts], { expectFailure: true });
  assert.match(out, /unknown fact type "Nope"/);
  assert.match(out, /rules\.discount\.Applicant/);
});

test("facts that fire nothing report firedCount 0", { skip: !javaAvailable }, () => {
  const facts = JSON.stringify([{ type: "Applicant", data: { name: "Kid", age: 12, income: 0 } }]);
  const out = run(["run", path.join(fixtures, "discount.drl"), "--facts", facts, "--json"]);
  const parsed = JSON.parse(out) as { firedCount: number };
  assert.equal(parsed.firedCount, 0);
});
