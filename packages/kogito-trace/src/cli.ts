import { Command } from "commander";
import { DataIndexClient, resolveUrl } from "./dataindex.js";
import { formatInstanceList, formatTrace, traceSteps } from "./format.js";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

export function buildProgram(): Command {
  const program = new Command()
    .name("kogito-trace")
    .description("Trace Kogito process instance execution via the Data Index GraphQL API");

  program
    .command("instances")
    .description("list process instances (most recent first)")
    .option("--url <url>", "Data Index GraphQL endpoint (default: $DATA_INDEX_URL or http://localhost:8180/graphql)")
    .option("--process <processId>", "filter by process id")
    .option("--state <state>", "filter by state (ACTIVE, COMPLETED, ERROR, ABORTED, SUSPENDED, PENDING)")
    .option("--limit <n>", "max results", "20")
    .option("--json", "machine-readable output")
    .action(async (opts: { url?: string; process?: string; state?: string; limit: string; json?: boolean }) => {
      const client = new DataIndexClient(resolveUrl(opts.url));
      const instances = await client.listInstances({
        ...(opts.process !== undefined ? { processId: opts.process } : {}),
        ...(opts.state !== undefined ? { state: opts.state.toUpperCase() } : {}),
        limit: Number(opts.limit),
      });
      console.log(opts.json ? JSON.stringify(instances, null, 2) : formatInstanceList(instances));
    });

  program
    .command("trace")
    .description("full execution trace of one process instance: timeline, error, user tasks, variables")
    .argument("<instanceId>")
    .option("--url <url>", "Data Index GraphQL endpoint (default: $DATA_INDEX_URL or http://localhost:8180/graphql)")
    .option("--json", "machine-readable output")
    .action(async (instanceId: string, opts: { url?: string; json?: boolean }) => {
      const client = new DataIndexClient(resolveUrl(opts.url));
      const instance = await client.getInstance(instanceId);
      let tasks: Awaited<ReturnType<DataIndexClient["userTasks"]>> = [];
      try {
        tasks = await client.userTasks(instanceId);
      } catch {
        // Data Index deployments without user-task indexing simply omit this section
      }
      if (opts.json) {
        console.log(JSON.stringify({ instance, steps: traceSteps(instance), userTasks: tasks }, null, 2));
      } else {
        console.log(formatTrace(instance, tasks));
      }
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
