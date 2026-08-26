import fs from "node:fs";

const DEFAULT_JIT_URL = process.env["JITEXECUTOR_URL"] ?? "http://localhost:8080";

async function post(url: string, body: string, contentType: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": contentType, accept: "application/json" },
      body,
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `cannot reach jitexecutor at ${url} (${cause}). ` +
        `Start one (e.g. the KIE jitexecutor / Extended Services runner) and pass --jit <url> or set JITEXECUTOR_URL.`
    );
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`jitexecutor returned HTTP ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function jitValidate(file: string, opts: { jitUrl?: string } = {}): Promise<unknown> {
  const jitUrl = opts.jitUrl ?? DEFAULT_JIT_URL;
  const xml = fs.readFileSync(file, "utf8");
  return post(`${jitUrl.replace(/\/$/, "")}/jitdmn/validate`, xml, "application/xml");
}

export async function jitEvaluate(
  file: string,
  context: Record<string, unknown>,
  opts: { jitUrl?: string } = {}
): Promise<unknown> {
  const jitUrl = opts.jitUrl ?? DEFAULT_JIT_URL;
  const xml = fs.readFileSync(file, "utf8");
  const body = JSON.stringify({ model: xml, context });
  return post(`${jitUrl.replace(/\/$/, "")}/jitdmn`, body, "application/json");
}
