export interface NodeInstance {
  id: string;
  nodeId?: string | null;
  definitionId?: string | null;
  name?: string | null;
  type?: string | null;
  enter?: string | null;
  exit?: string | null;
}

export interface ProcessError {
  nodeDefinitionId?: string | null;
  message?: string | null;
}

export interface Milestone {
  id: string;
  name?: string | null;
  status?: string | null;
}

export interface ProcessInstance {
  id: string;
  processId?: string | null;
  processName?: string | null;
  businessKey?: string | null;
  state?: string | null;
  start?: string | null;
  end?: string | null;
  endpoint?: string | null;
  rootProcessInstanceId?: string | null;
  parentProcessInstanceId?: string | null;
  error?: ProcessError | null;
  nodes?: NodeInstance[] | null;
  milestones?: Milestone[] | null;
  variables?: unknown;
}

export interface UserTaskInstance {
  id: string;
  name?: string | null;
  state?: string | null;
  actualOwner?: string | null;
  potentialGroups?: string[] | null;
  started?: string | null;
  completed?: string | null;
}

const INSTANCE_FIELDS = `
  id processId processName businessKey state start end endpoint
  rootProcessInstanceId parentProcessInstanceId
  error { nodeDefinitionId message }
  milestones { id name status }
  nodes { id nodeId definitionId name type enter exit }
  variables
`;

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: { message: string }[];
}

export class DataIndexClient {
  constructor(private readonly url: string) {}

  private async query<T>(query: string, variables: Record<string, unknown>, field: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new Error(
        `cannot reach the Data Index GraphQL endpoint at ${this.url} (${err instanceof Error ? err.message : err}). ` +
          `Is the Kogito Data Index (or a Quarkus dev-mode app with data-index-addon) running? ` +
          `Pass --url <endpoint> or set DATA_INDEX_URL.`
      );
    }
    if (!res.ok) {
      throw new Error(`Data Index returned HTTP ${res.status} for ${this.url}`);
    }
    const body = (await res.json()) as GraphQLResponse;
    if (body.errors && body.errors.length > 0) {
      throw new Error(`GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);
    }
    const value = body.data?.[field];
    if (value === undefined) {
      throw new Error(`GraphQL response has no "${field}" field`);
    }
    return value as T;
  }

  async listInstances(opts: {
    processId?: string;
    state?: string;
    limit?: number;
  }): Promise<ProcessInstance[]> {
    const where: Record<string, unknown> = {};
    if (opts.processId !== undefined) where["processId"] = { equal: opts.processId };
    if (opts.state !== undefined) where["state"] = { equal: opts.state };
    const query = `query Instances($where: ProcessInstanceArgument, $pagination: Pagination) {
      ProcessInstances(where: $where, orderBy: { start: DESC }, pagination: $pagination) {
        id processId processName businessKey state start end
        error { nodeDefinitionId message }
      }
    }`;
    return this.query<ProcessInstance[]>(
      query,
      { where, pagination: { limit: opts.limit ?? 20, offset: 0 } },
      "ProcessInstances"
    );
  }

  async getInstance(id: string): Promise<ProcessInstance> {
    const query = `query Instance($where: ProcessInstanceArgument) {
      ProcessInstances(where: $where) { ${INSTANCE_FIELDS} }
    }`;
    const list = await this.query<ProcessInstance[]>(query, { where: { id: { equal: id } } }, "ProcessInstances");
    const instance = list[0];
    if (!instance) throw new Error(`no process instance with id "${id}"`);
    return instance;
  }

  async userTasks(processInstanceId: string): Promise<UserTaskInstance[]> {
    const query = `query Tasks($where: UserTaskInstanceArgument) {
      UserTaskInstances(where: $where) {
        id name state actualOwner potentialGroups started completed
      }
    }`;
    return this.query<UserTaskInstance[]>(
      query,
      { where: { processInstanceId: { equal: processInstanceId } } },
      "UserTaskInstances"
    );
  }
}

export function resolveUrl(explicit?: string): string {
  return explicit ?? process.env["DATA_INDEX_URL"] ?? "http://localhost:8180/graphql";
}
