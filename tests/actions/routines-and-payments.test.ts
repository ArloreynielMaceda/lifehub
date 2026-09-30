import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseMock, TEST_USER_ID, type QueryState } from "../support/supabase-mock";

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { markBillPaid, skipBill, undoBillOccurrence } from "@/features/bills/actions";
import {
  createRoutine,
  deleteTask,
  setRoutineCompletion,
  setRoutinePaused,
  setTaskStatus,
  updateRoutine,
  updateTask,
} from "@/features/tasks/actions";
import { deleteTransaction, updateTransaction } from "@/features/transactions/actions";
import { addDays, todayInTimeZone } from "@/lib/dates";
import { isoWeekday } from "@/lib/routines";

const ID = "66666666-6666-4666-8666-666666666666";
const today = () => todayInTimeZone("Asia/Manila");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const routineInput = {
  title: "Take vitamins",
  description: "",
  priority: "medium",
  category: "Health",
  repeatDays: [5, 1, 3, 1],
  startsOn: "2026-01-05",
  endsOn: "",
  reminderTime: "07:30",
};

function routineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    kind: "routine",
    repeat_days: [1, 2, 3, 4, 5, 6, 7],
    starts_on: "2026-01-01",
    ends_on: null,
    paused_on: null,
    ...overrides,
  };
}

/** Profiles answer with a time zone; the routine lookup answers with `routine`. */
function routineHandler(routine: Record<string, unknown> | null) {
  return (q: QueryState) => {
    if (q.table === "profiles") return { data: { timezone: "Asia/Manila" } };
    if (q.table === "tasks" && q.action === "select") return { data: routine };
    if (q.table === "tasks") return { data: { id: ID, kind: "routine" } };
    return undefined;
  };
}

describe("routines: create and edit", () => {
  it("requires a session", async () => {
    const mock = createSupabaseMock({ userId: null });
    mocks.client = mock.client;
    expect((await createRoutine(routineInput)).ok).toBe(false);
    expect(mock.queries).toHaveLength(0);
  });

  it("validates days, dates and reminder time on the server", async () => {
    const mock = createSupabaseMock();
    mocks.client = mock.client;
    const result = await createRoutine({
      ...routineInput,
      repeatDays: [],
      endsOn: "2026-01-01",
      reminderTime: "25:99",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.repeatDays?.[0]).toMatch(/at least one day/);
      expect(result.fieldErrors?.reminderTime).toBeDefined();
    }
    const backwards = await createRoutine({ ...routineInput, endsOn: "2026-01-01" });
    expect(backwards.ok).toBe(false);
    if (!backwards.ok) expect(backwards.fieldErrors?.endsOn?.[0]).toMatch(/before the start/);
    expect(mock.queries).toHaveLength(0);
  });

  it("creates a routine with normalized days and no client-supplied owner or kind", async () => {
    const mock = createSupabaseMock({ handler: () => ({ data: { id: ID } }) });
    mocks.client = mock.client;
    const result = await createRoutine({ ...routineInput, user_id: "x", kind: "task", due_date: "2026-01-01" });
    expect(result).toMatchObject({ ok: true, data: { id: ID } });
    expect(mock.queries[0]!.payload).toEqual({
      kind: "routine",
      status: "pending",
      title: "Take vitamins",
      description: "",
      priority: "medium",
      category: "Health",
      repeat_days: [1, 3, 5],
      starts_on: "2026-01-05",
      ends_on: null,
      reminder_time: "07:30",
    });
  });

  it("edits only routines and never changes the kind", async () => {
    const mock = createSupabaseMock({ handler: () => ({ data: { id: ID } }) });
    mocks.client = mock.client;
    expect((await updateRoutine(ID, { ...routineInput, repeatDays: [6, 7] })).ok).toBe(true);
    const update = mock.queries[0]!;
    expect(update.filters).toContainEqual(["eq", "kind", "routine"]);
    expect(update.payload).not.toHaveProperty("kind");
    expect(update.payload).toMatchObject({ repeat_days: [6, 7] });
  });

  it("keeps the one-time task actions away from routines", async () => {
    const mock = createSupabaseMock({ handler: () => ({ data: null }) });
    mocks.client = mock.client;
    await updateTask(ID, { title: "x", description: "", dueDate: "", priority: "low", status: "pending", category: "" });
    await setTaskStatus(ID, "completed");
    for (const query of mock.queries) expect(query.filters).toContainEqual(["eq", "kind", "task"]);
  });

  it("deleting a routine reports it as a routine", async () => {
    const mock = createSupabaseMock({ handler: () => ({ data: { id: ID, kind: "routine" } }) });
    mocks.client = mock.client;
    expect(await deleteTask(ID)).toMatchObject({ ok: true, message: "Routine deleted" });
  });
});

describe("routines: completion per date", () => {
  it("marks today done idempotently (upsert that ignores duplicates)", async () => {
    const mock = createSupabaseMock({ handler: routineHandler(routineRow()) });
    mocks.client = mock.client;
    const result = await setRoutineCompletion(ID, today(), true);
    expect(result).toMatchObject({ ok: true, data: { date: today(), done: true } });
    const upsert = mock.queries.find((q) => q.action === "upsert")!;
    expect(upsert.table).toBe("task_completions");
    expect(upsert.payload).toEqual({ task_id: ID, occurred_on: today() });
    expect(upsert.options).toEqual({ onConflict: "task_id,occurred_on", ignoreDuplicates: true });
    expect(JSON.stringify(upsert.payload)).not.toContain(TEST_USER_ID);
  });

  it("marks a single earlier date not done without touching other dates", async () => {
    const mock = createSupabaseMock({ handler: routineHandler(routineRow()) });
    mocks.client = mock.client;
    const yesterday = addDays(today(), -1);
    expect((await setRoutineCompletion(ID, yesterday, false)).ok).toBe(true);
    const removal = mock.queries.find((q) => q.action === "delete")!;
    expect(removal.table).toBe("task_completions");
    expect(removal.filters).toEqual([
      ["eq", "task_id", ID],
      ["eq", "occurred_on", yesterday],
    ]);
  });

  it("refuses future dates, unscheduled days and paused routines", async () => {
    const tomorrow = addDays(today(), 1);
    const notToday = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== isoWeekday(today()));
    const cases: [Record<string, unknown>, string, RegExp][] = [
      [routineRow(), tomorrow, /today or earlier/],
      [routineRow({ repeat_days: notToday }), today(), /isn't scheduled/],
      [routineRow({ paused_on: addDays(today(), -3) }), today(), /isn't scheduled/],
      [routineRow({ starts_on: addDays(today(), 5) }), today(), /isn't scheduled/],
    ];
    for (const [row, date, message] of cases) {
      const mock = createSupabaseMock({ handler: routineHandler(row) });
      mocks.client = mock.client;
      const result = await setRoutineCompletion(ID, date, true);
      expect(result.ok, JSON.stringify(row)).toBe(false);
      if (!result.ok) expect(result.error).toMatch(message);
      expect(mock.queries.some((q) => q.action === "upsert")).toBe(false);
    }
  });

  it("does not complete one-time tasks or other users' routines", async () => {
    const mock = createSupabaseMock({ handler: routineHandler(null) }); // RLS/kind filter → nothing
    mocks.client = mock.client;
    expect(await setRoutineCompletion(ID, today(), true)).toEqual({ ok: false, error: "That routine could not be found." });
    const lookup = mock.queries.find((q) => q.table === "tasks")!;
    expect(lookup.filters).toContainEqual(["eq", "kind", "routine"]);
  });

  it("rejects malformed input", async () => {
    const mock = createSupabaseMock();
    mocks.client = mock.client;
    expect((await setRoutineCompletion(ID, "2026-02-30", true)).ok).toBe(false);
    expect((await setRoutineCompletion(ID, today(), "yes")).ok).toBe(false);
    expect((await setRoutineCompletion("nope", today(), true)).ok).toBe(false);
    expect(mock.queries).toHaveLength(0);
  });
});

describe("routines: pause and resume", () => {
  it("pauses from today and resumes by clearing the date", async () => {
    let mock = createSupabaseMock({ handler: routineHandler(routineRow()) });
    mocks.client = mock.client;
    expect(await setRoutinePaused(ID, true)).toMatchObject({ ok: true, message: "Routine paused" });
    let update = mock.queries.find((q) => q.table === "tasks" && q.action === "update")!;
    expect(update.payload).toEqual({ paused_on: today() });
    expect(update.filters).toContainEqual(["eq", "kind", "routine"]);

    mock = createSupabaseMock({ handler: routineHandler(routineRow()) });
    mocks.client = mock.client;
    expect(await setRoutinePaused(ID, false)).toMatchObject({ ok: true, message: "Routine resumed" });
    update = mock.queries.find((q) => q.table === "tasks" && q.action === "update")!;
    expect(update.payload).toEqual({ paused_on: null });
  });
});

describe("bill payments", () => {
  const bill = (overrides: Record<string, unknown> = {}) => ({
    id: ID,
    kind: "bill",
    recurrence: "monthly",
    anchor_date: "2026-01-31",
    next_due_date: "2026-01-31",
    status: "active",
    amount_minor: 230000,
    currency: "PHP",
    ...overrides,
  });
  const billHandler = (row: Record<string, unknown>) => (q: QueryState) =>
    q.table === "profiles" ? { data: { timezone: "Asia/Manila" } } : { data: row };

  it("passes the amount actually paid, date and method, and can skip adding an expense", async () => {
    const mock = createSupabaseMock({ handler: billHandler(bill()), rpc: () => ({ data: "advanced" }) });
    mocks.client = mock.client;
    const result = await markBillPaid(ID, "2026-01-31", {
      amount: "2,450.75",
      paidOn: "2026-01-30",
      paymentMethod: "e_wallet",
      recordExpense: false,
    });
    expect(result).toMatchObject({ ok: true, data: { outcome: "advanced", nextDueDate: "2026-02-28", expenseMinor: null } });
    expect(mock.rpcCalls[0]!.args).toMatchObject({
      p_outcome: "done",
      p_amount_minor: 245075,
      p_paid_on: "2026-01-30",
      p_payment_method: "e_wallet",
      p_record_expense: false,
    });
  });

  it("reports the expense that was recorded", async () => {
    const mock = createSupabaseMock({ handler: billHandler(bill()), rpc: () => ({ data: "advanced" }) });
    mocks.client = mock.client;
    const result = await markBillPaid(ID, "2026-01-31", { amount: "2,500" });
    expect(result).toMatchObject({ ok: true, data: { expenseMinor: 250000 } });
  });

  it("rejects invalid amounts and future payment dates before touching the database", async () => {
    for (const options of [{ amount: "12.345" }, { amount: "-1" }, { paidOn: addDays(today(), 2) }]) {
      const mock = createSupabaseMock({ handler: billHandler(bill()) });
      mocks.client = mock.client;
      expect((await markBillPaid(ID, "2026-01-31", options)).ok, JSON.stringify(options)).toBe(false);
      expect(mock.rpcCalls).toHaveLength(0);
    }
  });

  it("never records spending for reminders", async () => {
    const mock = createSupabaseMock({ handler: billHandler(bill({ kind: "reminder" })), rpc: () => ({ data: "advanced" }) });
    mocks.client = mock.client;
    await markBillPaid(ID, "2026-01-31");
    expect(mock.rpcCalls[0]!.args).toMatchObject({ p_record_expense: false });
  });

  it("skips without money and keeps the month-end schedule", async () => {
    const mock = createSupabaseMock({ handler: billHandler(bill()), rpc: () => ({ data: "advanced" }) });
    mocks.client = mock.client;
    const result = await skipBill(ID, "2026-01-31");
    expect(result).toMatchObject({ ok: true, data: { nextDueDate: "2026-02-28", expenseMinor: null } });
    expect(mock.rpcCalls[0]!.args).toMatchObject({ p_outcome: "skipped", p_amount_minor: null, p_record_expense: false });
  });

  it("reports a retried request as already recorded (no second expense)", async () => {
    const mock = createSupabaseMock({ handler: billHandler(bill()), rpc: () => ({ data: "unchanged" }) });
    mocks.client = mock.client;
    const result = await markBillPaid(ID, "2026-01-31");
    expect(result).toMatchObject({ ok: true, data: { outcome: "unchanged", expenseMinor: null } });
  });

  it("undo from history uses the month-end-safe next date as its guard", async () => {
    const mock = createSupabaseMock({
      handler: () => ({ data: { due_date: "2026-01-31", bills: { id: ID, recurrence: "monthly", anchor_date: "2026-01-31" } } }),
      rpc: () => ({ data: "reverted" }),
    });
    mocks.client = mock.client;
    expect((await undoBillOccurrence(ID)).ok).toBe(true);
    expect(mock.rpcCalls[0]).toEqual({
      fn: "undo_bill_occurrence",
      args: { p_bill_id: ID, p_due_date: "2026-01-31", p_expected_next_due_date: "2026-02-28" },
    });
  });
});

describe("bill payments in Expenses", () => {
  const linked = { id: ID, currency: "PHP", type: "expense", amount_minor: 230000, bill_occurrence_id: "77777777-7777-4777-8777-777777777777" };
  const input = {
    type: "expense",
    amount: "2300",
    description: "Electricity (Meralco)",
    category: "Utilities",
    paymentMethod: "e_wallet",
    occurredOn: "2026-01-30",
  };

  it("allows editing details but not the amount or type of a bill payment", async () => {
    let mock = createSupabaseMock({ handler: (q) => (q.action === "select" ? { data: linked } : { data: { id: ID } }) });
    mocks.client = mock.client;
    expect((await updateTransaction(ID, input)).ok).toBe(true);

    for (const change of [{ amount: "2400" }, { type: "income" }]) {
      mock = createSupabaseMock({ handler: (q) => (q.action === "select" ? { data: linked } : { data: { id: ID } }) });
      mocks.client = mock.client;
      const result = await updateTransaction(ID, { ...input, ...change });
      expect(result.ok, JSON.stringify(change)).toBe(false);
      expect(mock.queries.some((q) => q.action === "update")).toBe(false);
    }
  });

  it("refuses to delete a bill payment from Expenses", async () => {
    const mock = createSupabaseMock({ handler: () => ({ data: { bill_occurrence_id: linked.bill_occurrence_id } }) });
    mocks.client = mock.client;
    const result = await deleteTransaction(ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/undo the payment/);
    expect(mock.queries.some((q) => q.action === "delete")).toBe(false);
  });
});
