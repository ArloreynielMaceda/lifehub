import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseMock, type QueryState } from "../support/supabase-mock";

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createBill, markBillPaid, updateBill } from "@/features/bills/actions";
import { createTransaction, updateTransaction } from "@/features/transactions/actions";
import { todayInTimeZone } from "@/lib/dates";

const ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

function profileWithCurrency(currency: string) {
  return (q: QueryState) => {
    if (q.table === "profiles") return { data: { currency } };
    if (q.action === "insert") return { data: { id: ID } };
    return undefined;
  };
}

describe("transactions", () => {
  const input = {
    type: "expense",
    amount: "1,234.56",
    description: "Groceries",
    category: "Food",
    paymentMethod: "cash",
    occurredOn: "2026-09-30",
  };

  it("stores exact minor units in the profile currency, ignoring client currency", async () => {
    const mock = createSupabaseMock({ handler: profileWithCurrency("PHP") });
    mocks.client = mock.client;
    const result = await createTransaction({ ...input, currency: "USD", amount_minor: 1 });
    expect(result.ok).toBe(true);
    const insert = mock.queries.find((q) => q.action === "insert")!;
    expect(insert.payload).toEqual({
      type: "expense",
      amount_minor: 123456,
      currency: "PHP",
      description: "Groceries",
      category: "Food",
      payment_method: "cash",
      occurred_on: "2026-09-30",
    });
  });

  it("validates amounts against the currency's decimal places", async () => {
    const mock = createSupabaseMock({ handler: profileWithCurrency("JPY") });
    mocks.client = mock.client;
    const result = await createTransaction({ ...input, amount: "1500.50" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.amount?.[0]).toMatch(/decimals/);
    expect(mock.queries.some((q) => q.action === "insert")).toBe(false);
  });

  it("rejects negative, zero and malformed amounts", async () => {
    for (const amount of ["-5", "0", "1e5", "abc"]) {
      const mock = createSupabaseMock({ handler: profileWithCurrency("PHP") });
      mocks.client = mock.client;
      expect((await createTransaction({ ...input, amount })).ok, amount).toBe(false);
    }
  });

  it("keeps a transaction's original currency when editing", async () => {
    const mock = createSupabaseMock({
      handler: (q) => {
        if (q.action === "select") return { data: { id: ID, currency: "USD" } };
        if (q.action === "update") return { data: { id: ID } };
        return undefined;
      },
    });
    mocks.client = mock.client;
    const result = await updateTransaction(ID, { ...input, amount: "10.5" });
    expect(result.ok).toBe(true);
    const update = mock.queries.find((q) => q.action === "update")!;
    expect(update.payload).toMatchObject({ amount_minor: 1050 });
    expect(update.payload).not.toHaveProperty("currency");
  });
});

describe("bills", () => {
  const bill = {
    kind: "bill",
    title: "Rent",
    description: "",
    category: "Housing",
    amount: "15000",
    dueDate: "2026-01-31",
    recurrence: "monthly",
  };

  it("anchors a new recurring bill on its first due date", async () => {
    const mock = createSupabaseMock({ handler: profileWithCurrency("PHP") });
    mocks.client = mock.client;
    expect((await createBill(bill)).ok).toBe(true);
    const insert = mock.queries.find((q) => q.action === "insert")!;
    expect(insert.payload).toMatchObject({
      amount_minor: 1500000,
      currency: "PHP",
      anchor_date: "2026-01-31",
      next_due_date: "2026-01-31",
      recurrence: "monthly",
    });
  });

  it("allows bills without an amount", async () => {
    const mock = createSupabaseMock({ handler: profileWithCurrency("PHP") });
    mocks.client = mock.client;
    expect((await createBill({ ...bill, amount: "" })).ok).toBe(true);
    expect(mock.queries.find((q) => q.action === "insert")!.payload).toMatchObject({ amount_minor: null });
  });

  it("re-anchors the schedule only when the date or rule changes", async () => {
    const existing = { id: ID, currency: "PHP", recurrence: "monthly", anchor_date: "2026-01-31", next_due_date: "2026-03-31" };
    const run = async (changes: Record<string, string>) => {
      const mock = createSupabaseMock({
        handler: (q) => (q.action === "select" ? { data: existing } : { data: { id: ID } }),
      });
      mocks.client = mock.client;
      await updateBill(ID, { ...bill, dueDate: "2026-03-31", ...changes });
      return mock.queries.find((q) => q.action === "update")!.payload as Record<string, unknown>;
    };
    expect(await run({})).not.toHaveProperty("anchor_date");
    expect(await run({ dueDate: "2026-04-15" })).toMatchObject({ anchor_date: "2026-04-15", next_due_date: "2026-04-15" });
    expect(await run({ recurrence: "weekly" })).toMatchObject({ anchor_date: "2026-03-31" });
  });

  it("marks paid with the next month-end-safe occurrence", async () => {
    const mock = createSupabaseMock({
      handler: (q) =>
        q.table === "profiles"
          ? { data: { timezone: "Asia/Manila" } }
          : {
              data: {
                id: ID,
                kind: "bill",
                recurrence: "monthly",
                anchor_date: "2026-01-31",
                next_due_date: "2026-02-28",
                status: "active",
                amount_minor: 800000,
                currency: "PHP",
              },
            },
      rpc: () => ({ data: "advanced" }),
    });
    mocks.client = mock.client;
    const result = await markBillPaid(ID, "2026-02-28");
    expect(result).toMatchObject({ ok: true, data: { outcome: "advanced", nextDueDate: "2026-03-31", expenseMinor: 800000 } });
    expect(mock.rpcCalls).toEqual([
      {
        fn: "mark_bill_occurrence",
        args: {
          p_bill_id: ID,
          p_due_date: "2026-02-28",
          p_next_due_date: "2026-03-31",
          p_outcome: "done",
          p_amount_minor: null, // → the bill's own amount, decided in the database
          p_paid_on: todayInTimeZone("Asia/Manila"),
          p_payment_method: "other",
          p_record_expense: true,
        },
      },
    ]);
  });

  it("passes no next date for one-time items and reports retried requests", async () => {
    const mock = createSupabaseMock({
      handler: () => ({
        data: { id: ID, recurrence: "none", anchor_date: "2026-05-01", next_due_date: "2026-05-01", status: "completed" },
      }),
      rpc: () => ({ data: "unchanged" }),
    });
    mocks.client = mock.client;
    const result = await markBillPaid(ID, "2026-05-01");
    expect(result).toMatchObject({ ok: true, data: { outcome: "unchanged" } });
    expect((mock.rpcCalls[0]!.args as { p_next_due_date: unknown }).p_next_due_date).toBeNull();
  });

  it("rejects invalid occurrence dates", async () => {
    const mock = createSupabaseMock();
    mocks.client = mock.client;
    expect((await markBillPaid(ID, "2026-02-30")).ok).toBe(false);
    expect(mock.rpcCalls).toHaveLength(0);
  });
});
