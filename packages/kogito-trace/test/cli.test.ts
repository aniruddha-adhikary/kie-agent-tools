import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "..", "bin", "kogito-trace.js");

const INSTANCE = {
  id: "pi-1",
  processId: "loanApproval",
  processName: "Loan Approval",
  businessKey: "APP-42",
  state: "ERROR",
  start: "2026-08-26T10:00:00.000Z",
  end: null,
  endpoint: "http://svc/loanApproval",
  rootProcessInstanceId: null,
  parentProcessInstanceId: null,
  error: { nodeDefinitionId: "_ScoreTask", message: "boom: NPE in scoring" },
  milestones: [],
  nodes: [
    { id: "n2", nodeId: "2", definitionId: "_ScoreTask", name: "Score Applicant", type: "WorkItemNode", enter: "2026-08-26T10:00:01.000Z", exit: null },
    { id: "n1", nodeId: "1", definitionId: "_Start", name: "Start", type: "StartNode", enter: "2026-08-26T10:00:00.000Z", exit: "2026-08-26T10:00:00.500Z" },
  ],
  variables: { applicant: { name: "Ada" } },
};

const TASKS = [
  { id: "t1", name: "Review", state: "Ready", actualOwner: null, potentialGroups: ["approvers"], started: "2026-08-26T10:00:02.000Z", completed: null },
];

let server: http.Server;
let url = "";

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      const { query } = JSON.parse(body) as { query: string };
      res.setHeader("content-type", "application/json");
      if (query.includes("UserTaskInstances")) {
        res.end(JSON.stringify({ data: { UserTaskInstances: TASKS } }));
      } else {
        res.end(JSON.stringify({ data: { ProcessInstances: [INSTANCE] } }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no port");
  url = `http://127.0.0.1:${addr.port}/graphql`;
});

after(() => server.close());

const execFileAsync = promisify(execFile);

async function run(args: string[], opts: { expectFailure?: boolean } = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync("node", [bin, ...args], { encoding: "utf8" });
    return stdout;
  } catch (err) {
    if (opts.expectFailure && err instanceof Error && "stderr" in err) {
      return String((err as unknown as { stdout: string }).stdout) + String((err as unknown as { stderr: string }).stderr);
    }
    throw err;
  }
}

test("instances lists processes with state and error", async () => {
  const out = await run(["instances", "--url", url]);
  assert.match(out, /pi-1\s+loanApproval\s+ERROR/);
  assert.match(out, /error: boom: NPE in scoring/);
});

test("instances --json returns the raw list", async () => {
  const parsed = JSON.parse(await run(["instances", "--url", url, "--json"])) as { id: string }[];
  assert.equal(parsed[0]?.id, "pi-1");
});

test("trace prints an ordered timeline with error and active markers", async () => {
  const out = await run(["trace", "pi-1", "--url", url]);
  const startIdx = out.indexOf("[StartNode] Start");
  const scoreIdx = out.indexOf("[WorkItemNode] Score Applicant");
  assert.ok(startIdx >= 0 && scoreIdx > startIdx, "nodes ordered by enter time");
  assert.match(out, /✓ .*Start.*\(500ms\)/);
  assert.match(out, /✗ .*Score Applicant.*\(still active\)/);
  assert.match(out, /error: {4}boom: NPE in scoring \(at node definition _ScoreTask\)/);
  assert.match(out, /- Review: Ready groups=approvers/);
  assert.match(out, /"name": "Ada"/);
});

test("trace --json includes computed steps", async () => {
  const parsed = JSON.parse(await run(["trace", "pi-1", "--url", url, "--json"])) as {
    steps: { name: string; errored: boolean; active: boolean; durationMs?: number }[];
    userTasks: unknown[];
  };
  assert.equal(parsed.steps[0]?.name, "Start");
  assert.equal(parsed.steps[0]?.durationMs, 500);
  assert.equal(parsed.steps[1]?.errored, true);
  assert.equal(parsed.steps[1]?.active, true);
  assert.equal(parsed.userTasks.length, 1);
});

test("unreachable endpoint gives an actionable error", async () => {
  const out = await run(["instances", "--url", "http://127.0.0.1:59998/graphql"], { expectFailure: true });
  assert.match(out, /cannot reach the Data Index GraphQL endpoint/);
  assert.match(out, /DATA_INDEX_URL/);
});

test("unknown instance id gives a clear error", async () => {
  const empty = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: { ProcessInstances: [] } }));
  });
  await new Promise<void>((resolve) => empty.listen(0, "127.0.0.1", resolve));
  try {
    const addr = empty.address();
    if (addr === null || typeof addr === "string") throw new Error("no port");
    const out = await run(["trace", "nope", "--url", `http://127.0.0.1:${addr.port}/graphql`], { expectFailure: true });
    assert.match(out, /no process instance with id "nope"/);
  } finally {
    empty.close();
  }
});
