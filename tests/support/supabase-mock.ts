/**
 * A small, chainable stand-in for the Supabase client used by server-action tests. It records
 * every query (table, operation, payload, filters) and answers through a handler, so tests
 * can assert exactly what an action sent to the database without a network or real project.
 */

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

export interface QueryState {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  payload?: unknown;
  options?: unknown;
  filters: [string, string, unknown][];
  single?: boolean;
  maybeSingle?: boolean;
  head?: boolean;
}

export interface MockResult {
  data?: unknown;
  error?: { code?: string; message?: string; hint?: string } | null;
  count?: number | null;
}

type Handler = (query: QueryState) => MockResult | undefined;
type RpcHandler = (fn: string, args: unknown) => MockResult | undefined;
type StorageHandler = (op: string, args: unknown[]) => MockResult | undefined;

export function createSupabaseMock({
  userId = TEST_USER_ID,
  handler = () => undefined,
  rpc = () => undefined,
  storage = () => undefined,
}: {
  userId?: string | null;
  handler?: Handler;
  rpc?: RpcHandler;
  storage?: StorageHandler;
} = {}) {
  const queries: QueryState[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const storageCalls: { op: string; args: unknown[] }[] = [];

  const resolve = (result: MockResult | undefined) => ({
    data: result?.data ?? null,
    error: result?.error ?? null,
    count: result?.count ?? null,
  });

  function from(table: string) {
    const state: QueryState = { table, action: "select", filters: [] };
    const filter =
      (op: string) =>
      (column: string, value?: unknown) => {
        state.filters.push([op, column, value]);
        return builder;
      };
    const builder: Record<string, unknown> & PromiseLike<ReturnType<typeof resolve>> = {
      select(columns?: string, options?: { head?: boolean }) {
        if (state.action === "select") state.columns = columns;
        if (options?.head) state.head = true;
        return builder;
      },
      insert(payload: unknown) {
        state.action = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: unknown) {
        state.action = "update";
        state.payload = payload;
        return builder;
      },
      upsert(payload: unknown, options?: unknown) {
        state.action = "upsert";
        state.payload = payload;
        state.options = options;
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        state.filters.push([`not.${operator}`, column, value]);
        return builder;
      },
      delete() {
        state.action = "delete";
        return builder;
      },
      eq: filter("eq"),
      neq: filter("neq"),
      is: filter("is"),
      in: filter("in"),
      lt: filter("lt"),
      lte: filter("lte"),
      gt: filter("gt"),
      gte: filter("gte"),
      ilike: filter("ilike"),
      order: () => builder,
      range: () => builder,
      limit: () => builder,
      single() {
        state.single = true;
        return builder;
      },
      maybeSingle() {
        state.maybeSingle = true;
        return builder;
      },
      then(onFulfilled, onRejected) {
        queries.push(state);
        return Promise.resolve(resolve(handler(state))).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  const bucket = {
    createSignedUploadUrl: async (...args: unknown[]) => {
      storageCalls.push({ op: "createSignedUploadUrl", args });
      return resolve(storage("createSignedUploadUrl", args));
    },
    createSignedUrl: async (...args: unknown[]) => {
      storageCalls.push({ op: "createSignedUrl", args });
      return resolve(storage("createSignedUrl", args));
    },
    info: async (...args: unknown[]) => {
      storageCalls.push({ op: "info", args });
      return resolve(storage("info", args));
    },
    remove: async (...args: unknown[]) => {
      storageCalls.push({ op: "remove", args });
      return resolve(storage("remove", args));
    },
    list: async (...args: unknown[]) => {
      storageCalls.push({ op: "list", args });
      return resolve(storage("list", args));
    },
  };

  const client = {
    from,
    rpc: async (fn: string, args?: unknown) => {
      rpcCalls.push({ fn, args });
      return resolve(rpc(fn, args));
    },
    auth: {
      getClaims: async () =>
        userId
          ? { data: { claims: { sub: userId, email: "user@example.test" } }, error: null }
          : { data: null, error: null },
      signOut: async () => ({ error: null }),
    },
    storage: { from: () => bucket },
  };

  return { client, queries, rpcCalls, storageCalls };
}

/** Error thrown by the mocked `redirect()` so tests can assert the destination. */
export class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
