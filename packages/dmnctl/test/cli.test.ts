import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "..", "bin", "dmnctl.js");
const fixture = path.join(here, "fixtures", "loan.dmn");

let dir: string;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dmnctl-test-"));
});

interface RunResult {
  stdout: string;
  status: number;
}

function run(...args: string[]): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [bin, ...args], { encoding: "utf8" });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: (e.stdout ?? "") + (e.stderr ?? ""), status: e.status ?? 1 };
  }
}

function tmp(name: string): string {
  return path.join(dir, name);
}

test("new creates a valid empty model", () => {
  const f = tmp("empty.dmn");
  assert.equal(run("new", f, "--name", "Empty").status, 0);
  const xml = fs.readFileSync(f, "utf8");
  assert.match(xml, /https:\/\/www\.omg\.org\/spec\/DMN\/20230324\/MODEL\//);
  assert.match(xml, /name="Empty"/);
  assert.equal(run("validate", f).status, 0);
});

test("add + connect + set-expression builds a working model", () => {
  const f = tmp("built.dmn");
  run("new", f, "--name", "Built");
  assert.equal(run("add", f, "--type", "input-data", "--name", "Credit Score", "--type-ref", "number").status, 0);
  assert.equal(run("add", f, "--type", "decision", "--name", "Preapproval", "--type-ref", "boolean").status, 0);
  assert.equal(run("connect", f, "Credit Score", "Preapproval").status, 0);
  assert.equal(
    run("set-expression", f, "Preapproval", "--feel", "Credit Score >= 700", "--type-ref", "boolean").status,
    0
  );
  assert.equal(run("validate", f).status, 0);

  const desc = JSON.parse(run("describe", f, "--json").stdout) as {
    nodes: Array<{ type: string; name: string; requires?: unknown[]; expression?: { kind: string; text?: string } }>;
  };
  const decision = desc.nodes.find((n) => n.type === "decision");
  assert.ok(decision);
  assert.equal(decision.expression?.text, "Credit Score >= 700");
});

test("layout writes DMNDI shapes and edges", () => {
  const f = tmp("layout.dmn");
  run("new", f, "--name", "L");
  run("add", f, "--type", "input-data", "--name", "In");
  run("add", f, "--type", "decision", "--name", "Out");
  run("connect", f, "In", "Out");
  const xml = fs.readFileSync(f, "utf8");
  assert.match(xml, /dmndi:DMNShape/);
  assert.match(xml, /dmndi:DMNEdge/);
  assert.match(xml, /di:waypoint/);
});

test("render produces an SVG", () => {
  const f = tmp("render.dmn");
  run("new", f, "--name", "R");
  run("add", f, "--type", "input-data", "--name", "In");
  run("add", f, "--type", "decision", "--name", "Out");
  run("connect", f, "In", "Out");
  const svg = tmp("render.svg");
  assert.equal(run("render", f, "-o", svg).status, 0);
  const content = fs.readFileSync(svg, "utf8");
  assert.match(content, /<svg/);
  assert.match(content, /In/);
  assert.match(content, /Out/);
});

test("set-expression --table builds a decision table", () => {
  const f = tmp("table.dmn");
  run("new", f, "--name", "T");
  run("add", f, "--type", "input-data", "--name", "Credit Score", "--type-ref", "number");
  run("add", f, "--type", "decision", "--name", "Approval", "--type-ref", "boolean");
  run("connect", f, "Credit Score", "Approval");
  const spec = tmp("table.json");
  fs.writeFileSync(
    spec,
    JSON.stringify({
      hitPolicy: "FIRST",
      inputs: [{ expression: "Credit Score", typeRef: "number" }],
      outputs: [{ name: "Approval", typeRef: "boolean" }],
      rules: [
        { when: [">= 700"], then: ["true"] },
        { when: ["-"], then: ["false"] },
      ],
    })
  );
  assert.equal(run("set-expression", f, "Approval", "--table", spec).status, 0);
  assert.equal(run("validate", f).status, 0);
  const desc = run("describe", f).stdout;
  assert.match(desc, /decision table \(FIRST\), 2 rules/);
});

test("rm removes the node and dangling requirements are reported", () => {
  const f = tmp("rm.dmn");
  run("new", f, "--name", "RM");
  run("add", f, "--type", "input-data", "--name", "Base Rate");
  run("add", f, "--type", "decision", "--name", "Out");
  run("connect", f, "Base Rate", "Out");
  run("set-expression", f, "Out", "--feel", "Base Rate + 1");
  assert.equal(run("rm", f, "Base Rate").status, 0);
  const result = run("validate", f);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /feel-syntax|dangling/);
});

test("set renames node and variable together", () => {
  const f = tmp("set.dmn");
  run("new", f, "--name", "S");
  run("add", f, "--type", "input-data", "--name", "Old Name", "--type-ref", "string");
  assert.equal(run("set", f, "Old Name", "--name", "New Name", "--type-ref", "number").status, 0);
  const xml = fs.readFileSync(f, "utf8");
  assert.match(xml, /name="New Name"/);
  assert.doesNotMatch(xml, /Old Name/);
  const desc = run("describe", f).stdout;
  assert.match(desc, /New Name.*: number/);
});

test("lint-feel catches syntax errors", () => {
  const f = tmp("lint.dmn");
  run("new", f, "--name", "Lint");
  run("add", f, "--type", "decision", "--name", "Bad");
  run("set-expression", f, "Bad", "--feel", "1 + + )");
  const result = run("lint-feel", f, "--json");
  assert.equal(result.status, 1);
  const issues = JSON.parse(result.stdout) as Array<{ where: string }>;
  assert.ok(issues.length > 0);
  assert.match(issues[0]!.where, /Bad/);
});

test("lint-feel accepts multi-word variable references", () => {
  const f = tmp("lint-ok.dmn");
  run("new", f, "--name", "LintOK");
  run("add", f, "--type", "input-data", "--name", "Credit Score", "--type-ref", "number");
  run("add", f, "--type", "decision", "--name", "OK");
  run("connect", f, "Credit Score", "OK");
  run("set-expression", f, "OK", "--feel", "Credit Score >= 700");
  assert.equal(run("lint-feel", f).status, 0);
});

test("validate flags duplicate names and decisions without logic", () => {
  const f = tmp("dup.dmn");
  run("new", f, "--name", "Dup");
  run("add", f, "--type", "decision", "--name", "Same");
  run("add", f, "--type", "input-data", "--name", "Same");
  const result = run("validate", f, "--json");
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout) as { issues: Array<{ rule: string }> };
  const rules = parsed.issues.map((i) => i.rule);
  assert.ok(rules.includes("duplicate-name"));
  assert.ok(rules.includes("decision-without-logic"));
});

test("kogito-style fixture round-trips through edits", () => {
  const f = tmp("loan.dmn");
  fs.copyFileSync(fixture, f);
  assert.equal(run("validate", f).status, 0);

  assert.equal(run("add", f, "--type", "decision", "--name", "Final Offer", "--type-ref", "string").status, 0);
  assert.equal(run("connect", f, "Approval", "Final Offer").status, 0);
  assert.equal(
    run("set-expression", f, "Final Offer", "--feel", 'if Approval then "approved" else "rejected"').status,
    0
  );
  assert.equal(run("validate", f).status, 0);

  const xml = fs.readFileSync(f, "utf8");
  assert.match(xml, /tApplicant/);
  assert.match(xml, /itemDefinition/);
  assert.match(xml, /Monthly Income/);

  const desc = JSON.parse(run("describe", f, "--json").stdout) as {
    nodes: Array<{ name: string }>;
    itemDefinitions: Array<{ name: string }>;
  };
  assert.ok(desc.nodes.some((n) => n.name === "Final Offer"));
  assert.ok(desc.itemDefinitions.some((d) => d.name === "tApplicant"));
});

test("annotations connect via association", () => {
  const f = tmp("anno.dmn");
  run("new", f, "--name", "A");
  run("add", f, "--type", "decision", "--name", "D");
  run("add", f, "--type", "text-annotation", "--name", "a note");
  const result = run("connect", f, "D", "a note");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /association/);
});

test("eval without a jitexecutor gives a clear error", () => {
  const f = tmp("eval.dmn");
  run("new", f, "--name", "E");
  const result = run("eval", f, "--context", "{}", "--jit", "http://127.0.0.1:59999");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /jitexecutor|fetch failed|ECONNREFUSED/i);
});
