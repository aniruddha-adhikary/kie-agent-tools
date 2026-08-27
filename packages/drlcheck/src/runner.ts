import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUNNER_VERSION = "0.1.0";

export interface Diagnostic {
  severity: string;
  line: number;
  column: number;
  message: string;
}

export interface RuleInfo {
  name: string;
  package: string;
  metadata: Record<string, string>;
}

export interface DeclaredType {
  name: string;
  fields: { name: string; type: string }[];
}

export interface FiredRule {
  rule: string;
  package: string;
}

export interface FactAfter {
  type: string;
  data: Record<string, unknown> | string;
}

export interface RunnerResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  rules?: RuleInfo[];
  declaredTypes?: DeclaredType[];
  fired?: FiredRule[];
  firedCount?: number;
  factsAfter?: FactAfter[];
  error?: string;
}

function packageRunnerDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "runner");
}

export function cacheDir(): string {
  return (
    process.env["DRLCHECK_CACHE"] ?? path.join(os.homedir(), ".cache", "drlcheck", `runner-${RUNNER_VERSION}`)
  );
}

export function jarPath(): string {
  const explicit = process.env["DRLCHECK_JAR"];
  if (explicit !== undefined) return explicit;
  return path.join(cacheDir(), "target", "drlcheck-runner.jar");
}

function checkTool(command: string, name: string, hint: string): void {
  const probe = spawnSync(command, ["-version"], { encoding: "utf8" });
  if (probe.error) {
    throw new Error(`${name} is required but not found on PATH. ${hint}`);
  }
}

export function ensureRunner(opts: { force?: boolean } = {}): string {
  const jar = jarPath();
  if (!opts.force && fs.existsSync(jar)) return jar;

  checkTool("java", "Java (17+)", "Install a JDK, e.g. `apt-get install openjdk-17-jre-headless`.");
  checkTool("mvn", "Maven", "Install Maven, e.g. `apt-get install maven`.");

  const dir = cacheDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(packageRunnerDir(), "pom.xml"), path.join(dir, "pom.xml"));
  fs.cpSync(path.join(packageRunnerDir(), "src"), path.join(dir, "src"), { recursive: true });

  console.error(`drlcheck: building the Drools runner (one-time, cached in ${dir})...`);
  const build = spawnSync("mvn", ["-q", "package"], { cwd: dir, encoding: "utf8" });
  if (build.status !== 0) {
    throw new Error(
      `failed to build the Drools runner with Maven (exit ${build.status}).\n${build.stdout}\n${build.stderr}\n` +
        `Retry with \`drlcheck setup\`; Maven needs network access to download Drools.`
    );
  }
  if (!fs.existsSync(jar)) {
    throw new Error(`runner build succeeded but ${jar} is missing`);
  }
  return jar;
}

export function invokeRunner(args: string[]): RunnerResult {
  const jar = ensureRunner();
  let stdout: string;
  try {
    stdout = execFileSync("java", ["-jar", jar, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const failure = err as { status?: number; stdout?: string; stderr?: string };
    if (failure.status === 1 && typeof failure.stdout === "string" && failure.stdout.trim().startsWith("{")) {
      stdout = failure.stdout;
    } else {
      throw new Error(
        `Drools runner failed (exit ${failure.status ?? "?"}):\n${failure.stderr ?? ""}${failure.stdout ?? ""}`
      );
    }
  }
  const line = stdout.trim().split("\n").pop() ?? "";
  return JSON.parse(line) as RunnerResult;
}
