import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asRole, asUser, createTestDatabase, createUser } from "../support/pglite-supabase";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await createUser(db, ALICE, { full_name: "Alice", timezone: "Asia/Manila" });
  await createUser(db, BOB, { full_name: "Bob", timezone: "Asia/Manila" });
});

afterAll(async () => {
  await db?.close();
});

type Tx = Parameters<Parameters<typeof asUser>[2]>[0];

async function scalar<T>(tx: Tx | PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ v: T }>(sql, params);
  return rows[0]!.v;
}

async function localToday(tz: string): Promise<string> {
  return scalar<string>(db, "select ((now() at time zone $1)::date)::text as v", [tz]);
}

async function createRoutine(userId: string, fields: Record<string, unknown>): Promise<string> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.tasks (kind, title, repeat_days, starts_on, ends_on, reminder_time)
       values ('routine', $1, $2::smallint[], $3::date, $4::date, $5::time) returning id`,
      [fields.title ?? "Routine", fields.days ?? "{1,2,3,4,5,6,7}", fields.starts, fields.ends ?? null, fields.reminder ?? null],
    );
    return rows[0]!.id;
  });
}

describe("routines: schema", () => {
  it("stores a routine with normalized weekdays and leaves one-time tasks unchanged", async () => {
    const id = await createRoutine(ALICE, { title: "Take vitamins", days: "{5,1,3,1}", starts: "2026-01-01" });
    const routine = await asUser(db, ALICE, (tx) =>
      tx.query<{ kind: string; repeat_days: number[]; status: string; due_date: string | null }>(
        "select kind::text, repeat_days, status::text, due_date from public.tasks where id = $1",
        [id],
      ),
    );
    expect(routine.rows[0]).toEqual({ kind: "routine", repeat_days: [1, 3, 5], status: "pending", due_date: null });

    const task = await asUser(db, ALICE, (tx) =>
      tx.query<{ kind: string }>("insert into public.tasks (title, due_date) values ('Pay rent', '2026-10-01') returning kind::text"),
    );
    expect(task.rows[0]!.kind).toBe("task");
  });

  it("rejects malformed routines and routine fields on one-time tasks", async () => {
    const bad = [
      "insert into public.tasks (kind, title, repeat_days) values ('routine', 'No start', '{1}')",
      "insert into public.tasks (kind, title, repeat_days, starts_on) values ('routine', 'Empty', '{}', '2026-01-01')",
      "insert into public.tasks (kind, title, repeat_days, starts_on) values ('routine', 'Day 8', '{8}', '2026-01-01')",
      "insert into public.tasks (kind, title, repeat_days, starts_on, ends_on) values ('routine', 'Backwards', '{1}', '2026-02-01', '2026-01-01')",
      "insert into public.tasks (kind, title, repeat_days, starts_on, due_date) values ('routine', 'Due', '{1}', '2026-01-01', '2026-01-05')",
      "insert into public.tasks (kind, title, repeat_days, starts_on, status) values ('routine', 'Done', '{1}', '2026-01-01', 'completed')",
      "insert into public.tasks (title, repeat_days) values ('Task with days', '{1}')",
      "insert into public.tasks (title, starts_on) values ('Task with start', '2026-01-01')",
    ];
    for (const sql of bad) {
      await expect(asUser(db, ALICE, (tx) => tx.query(sql)), sql).rejects.toThrow(/check constraint|violates/);
    }
  });

  it("does not allow converting a task into a routine (kind is fixed)", async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query("update public.tasks set kind = 'routine' where title = 'Pay rent'")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("routines: completions", () => {
  let dailyId: string;
  let mwfId: string;

  beforeAll(async () => {
    dailyId = await createRoutine(ALICE, { title: "Drink water", starts: "2026-01-01" });
    // Mon/Wed/Fri, Jan–Feb 2026 only (2026-01-05 is a Monday)
    mwfId = await createRoutine(ALICE, { title: "Exercise", days: "{1,3,5}", starts: "2026-01-05", ends: "2026-02-27" });
  });

  it("records one completion per date and keeps dates independent", async () => {
    await asUser(db, ALICE, async (tx) => {
      await tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-05'), ($1, '2026-01-06')", [dailyId]);
      // Retrying the same date is a no-op with ON CONFLICT DO NOTHING (what the app sends).
      const retry = await tx.query(
        "insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-05') on conflict (task_id, occurred_on) do nothing",
        [dailyId],
      );
      expect(retry.affectedRows).toBe(0);
      // Marking one date not-done leaves the other untouched.
      await tx.query("delete from public.task_completions where task_id = $1 and occurred_on = '2026-01-05'", [dailyId]);
      const { rows } = await tx.query<{ occurred_on: string }>(
        "select occurred_on::text from public.task_completions where task_id = $1 order by occurred_on",
        [dailyId],
      );
      expect(rows.map((r) => r.occurred_on)).toEqual(["2026-01-06"]);
    });
  });

  it("rejects a second row for the same date", async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-06')", [dailyId])),
    ).rejects.toThrow(/unique|duplicate/);
  });

  it("only accepts scheduled weekdays within the start/end window", async () => {
    const complete = (date: string) =>
      asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, $2)", [mwfId, date]));
    await complete("2026-01-07"); // Wednesday
    await expect(complete("2026-01-06")).rejects.toThrow(/not scheduled/); // Tuesday
    await expect(complete("2026-01-02")).rejects.toThrow(/not scheduled/); // before start (Friday)
    await expect(complete("2026-03-02")).rejects.toThrow(/not scheduled/); // after end (Monday)
  });

  it("rejects completing a one-time task per date and completing the future", async () => {
    const taskId = await asUser(db, ALICE, (tx) =>
      tx.query<{ id: string }>("insert into public.tasks (title) values ('One-off') returning id").then((r) => r.rows[0]!.id),
    );
    await expect(
      asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-06')", [taskId])),
    ).rejects.toThrow(/Only routines/);

    const future = await scalar<string>(db, "select ((now() at time zone 'Asia/Manila')::date + 2)::text as v");
    await expect(
      asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, $2)", [dailyId, future])),
    ).rejects.toThrow(/Future/);
  });

  it("uses each user's own time zone for 'today'", async () => {
    // Kiritimati is UTC+14 and Pago Pago UTC-11: their calendar dates differ by one day
    // (sometimes two) at every instant.
    await db.query("update public.profiles set timezone = 'Pacific/Kiritimati' where id = $1", [ALICE]);
    await db.query("update public.profiles set timezone = 'Pacific/Pago_Pago' where id = $1", [BOB]);
    const aliceToday = await localToday("Pacific/Kiritimati");
    const bobToday = await localToday("Pacific/Pago_Pago");
    expect(aliceToday > bobToday).toBe(true);

    const bobDaily = await createRoutine(BOB, { title: "Bob daily", starts: "2026-01-01" });
    // Alice's "today" is fine for her...
    await asUser(db, ALICE, (tx) =>
      tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, $2)", [dailyId, aliceToday]),
    );
    // ...but the same date is still in the future for Bob.
    await expect(
      asUser(db, BOB, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, $2)", [bobDaily, aliceToday])),
    ).rejects.toThrow(/Future/);
    await asUser(db, BOB, (tx) =>
      tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, $2)", [bobDaily, bobToday]),
    );

    await db.query("update public.profiles set timezone = 'Asia/Manila' where id in ($1, $2)", [ALICE, BOB]);
  });

  it("pausing stops new completions; resuming allows them again; history is kept", async () => {
    await asUser(db, ALICE, (tx) => tx.query("update public.tasks set paused_on = '2026-01-10' where id = $1", [dailyId]));
    await expect(
      asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-12')", [dailyId])),
    ).rejects.toThrow(/not scheduled/);
    // Dates before the pause still accept completions and existing history is intact.
    await asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-09')", [dailyId]));
    await asUser(db, ALICE, (tx) => tx.query("update public.tasks set paused_on = null where id = $1", [dailyId]));
    await asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-12')", [dailyId]));
    const count = await asUser(db, ALICE, (tx) =>
      scalar<number>(tx, "select count(*)::int as v from public.task_completions where task_id = $1 and occurred_on < '2026-02-01'", [dailyId]),
    );
    expect(count).toBe(3); // Jan 6, Jan 9, Jan 12
  });

  it("editing the schedule keeps history; deleting the routine removes it", async () => {
    await asUser(db, ALICE, (tx) => tx.query("update public.tasks set repeat_days = '{6,7}', title = 'Weekend water' where id = $1", [dailyId]));
    const kept = await asUser(db, ALICE, (tx) =>
      scalar<number>(tx, "select count(*)::int as v from public.task_completions where task_id = $1", [dailyId]),
    );
    expect(kept).toBeGreaterThanOrEqual(3);
    await asUser(db, ALICE, (tx) => tx.query("delete from public.tasks where id = $1", [mwfId]));
    const gone = await asUser(db, ALICE, (tx) =>
      scalar<number>(tx, "select count(*)::int as v from public.task_completions where task_id = $1", [mwfId]),
    );
    expect(gone).toBe(0);
  });
});

describe("routines: isolation", () => {
  it("keeps routines and completion history private", async () => {
    const aliceRoutine = await createRoutine(ALICE, { title: "Alice private routine", starts: "2026-01-01" });
    await asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-06')", [aliceRoutine]));

    await asUser(db, BOB, async (tx) => {
      const tasks = await tx.query("select id from public.tasks where id = $1", [aliceRoutine]);
      expect(tasks.rows).toHaveLength(0);
      const history = await tx.query("select id from public.task_completions where task_id = $1", [aliceRoutine]);
      expect(history.rows).toHaveLength(0);
      const deleted = await tx.query("delete from public.task_completions where task_id = $1", [aliceRoutine]);
      expect(deleted.affectedRows).toBe(0);
      const paused = await tx.query("update public.tasks set paused_on = '2026-01-01' where id = $1", [aliceRoutine]);
      expect(paused.affectedRows).toBe(0);
    });

    // Bob cannot complete Alice's routine (lookup is hidden by RLS; the FK also forbids it).
    await expect(
      asUser(db, BOB, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, '2026-01-07')", [aliceRoutine])),
    ).rejects.toThrow(/Only routines|foreign key|violates/);
    await expect(
      asUser(db, BOB, (tx) =>
        tx.query("insert into public.task_completions (user_id, task_id, occurred_on) values ($1, $2, '2026-01-07')", [ALICE, aliceRoutine]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("denies anonymous access to completion history", async () => {
    await expect(asRole(db, "anon", null, (tx) => tx.query("select * from public.task_completions"))).rejects.toThrow(/permission denied/);
  });
});

describe("routines: reminders", () => {
  it("creates one reminder after the reminder time, and none once completed", async () => {
    const today = await localToday("Asia/Manila");
    const due = await createRoutine(ALICE, { title: "Take meds", starts: "2026-01-01", reminder: "00:00" });
    const done = await createRoutine(ALICE, { title: "Already done", starts: "2026-01-01", reminder: "00:00" });
    const later = await createRoutine(ALICE, { title: "Late reminder", starts: "2026-01-01", reminder: "23:59:59" });
    await asUser(db, ALICE, (tx) => tx.query("insert into public.task_completions (task_id, occurred_on) values ($1, $2)", [done, today]));

    await asUser(db, ALICE, async (tx) => {
      await tx.query("select public.sync_my_notifications()");
      await tx.query("select public.sync_my_notifications()");
      const { rows } = await tx.query<{ source_id: string; title: string; body: string; link: string }>(
        "select source_id, title, body, link from public.notifications where dedupe_key like 'routine:%'",
      );
      expect(rows.filter((r) => r.source_id === due)).toEqual([
        { source_id: due, title: "Time for: Take meds", body: "Routine · 12:00 AM", link: "/tasks?scope=routines" },
      ]);
      expect(rows.some((r) => r.source_id === done)).toBe(false);
      // 23:59:59 has (almost certainly) not passed yet in Manila.
      const localTime = await scalar<string>(tx, "select to_char(now() at time zone 'Asia/Manila', 'HH24:MI:SS') as v");
      if (localTime < "23:59:59") expect(rows.some((r) => r.source_id === later)).toBe(false);
    });
  });
});

describe("bills: payments and expenses", () => {
  let electricity: string;

  beforeAll(async () => {
    electricity = await asUser(db, ALICE, (tx) =>
      tx
        .query<{ id: string }>(
          `insert into public.bills (title, category, amount_minor, currency, recurrence, anchor_date, next_due_date)
           values ('Electricity', 'Utilities', 230000, 'PHP', 'monthly', '2026-01-31', '2026-01-31') returning id`,
        )
        .then((r) => r.rows[0]!.id),
    );
  });

  const payments = (tx: Tx) =>
    tx.query<{ amount_minor: number; category: string; occurred_on: string; payment_method: string; linked: boolean }>(
      `select t.amount_minor::int, t.category, t.occurred_on::text, t.payment_method::text, t.bill_occurrence_id is not null as linked
       from public.transactions t join public.bill_occurrences o on o.id = t.bill_occurrence_id
       where o.bill_id = $1 order by t.occurred_on`,
      [electricity],
    );

  it("records exactly one linked expense when paid, even if the request is retried", async () => {
    await asUser(db, ALICE, async (tx) => {
      const call = () =>
        tx
          .query<{ r: string }>(
            `select public.mark_bill_occurrence(p_bill_id => $1, p_due_date => '2026-01-31', p_next_due_date => '2026-02-28',
               p_paid_on => '2026-01-30', p_payment_method => 'e_wallet') as r`,
            [electricity],
          )
          .then((res) => res.rows[0]!.r);
      expect(await call()).toBe("advanced");
      expect(await call()).toBe("unchanged");
      expect((await payments(tx)).rows).toEqual([
        { amount_minor: 230000, category: "Utilities", occurred_on: "2026-01-30", payment_method: "e_wallet", linked: true },
      ]);
      // End-of-month schedule preserved: Jan 31 → Feb 28.
      expect(await scalar<string>(tx, "select next_due_date::text as v from public.bills where id = $1", [electricity])).toBe("2026-02-28");
    });
  });

  it("uses the amount actually paid when it differs from the bill", async () => {
    await asUser(db, ALICE, async (tx) => {
      await tx.query(
        `select public.mark_bill_occurrence(p_bill_id => $1, p_due_date => '2026-02-28', p_next_due_date => '2026-03-31',
           p_amount_minor => 245075, p_paid_on => '2026-02-27')`,
        [electricity],
      );
      const rows = (await payments(tx)).rows;
      expect(rows.at(-1)).toMatchObject({ amount_minor: 245075, occurred_on: "2026-02-27", payment_method: "other" });
      const occurrence = await scalar<number>(
        tx,
        "select amount_minor::int as v from public.bill_occurrences where bill_id = $1 and due_date = '2026-02-28'",
        [electricity],
      );
      expect(occurrence).toBe(245075);
    });
  });

  it("can record a payment without adding an expense (already logged by hand)", async () => {
    await asUser(db, ALICE, async (tx) => {
      await tx.query(
        `select public.mark_bill_occurrence(p_bill_id => $1, p_due_date => '2026-03-31', p_next_due_date => '2026-04-30',
           p_record_expense => false)`,
        [electricity],
      );
      expect((await payments(tx)).rows).toHaveLength(2);
      const occurrences = await scalar<number>(tx, "select count(*)::int as v from public.bill_occurrences where bill_id = $1", [electricity]);
      expect(occurrences).toBe(3);
    });
  });

  it("skipping records history without money and moves the schedule on; undo restores it", async () => {
    await asUser(db, ALICE, async (tx) => {
      const skipped = await scalar<string>(
        tx,
        `select public.mark_bill_occurrence(p_bill_id => $1, p_due_date => '2026-04-30', p_next_due_date => '2026-05-31',
           p_outcome => 'skipped') as v`,
        [electricity],
      );
      expect(skipped).toBe("advanced");
      const outcome = await scalar<string>(
        tx,
        "select outcome::text as v from public.bill_occurrences where bill_id = $1 and due_date = '2026-04-30'",
        [electricity],
      );
      expect(outcome).toBe("skipped");
      expect((await payments(tx)).rows).toHaveLength(2); // no expense for a skip

      const undone = await scalar<string>(tx, "select public.undo_bill_occurrence($1, '2026-04-30', '2026-05-31') as v", [electricity]);
      expect(undone).toBe("reverted");
      expect(await scalar<string>(tx, "select next_due_date::text as v from public.bills where id = $1", [electricity])).toBe("2026-04-30");
    });
  });

  it("undoing a payment removes its expense", async () => {
    await asUser(db, ALICE, async (tx) => {
      await tx.query(
        `select public.mark_bill_occurrence(p_bill_id => $1, p_due_date => '2026-04-30', p_next_due_date => '2026-05-31', p_paid_on => '2026-04-29')`,
        [electricity],
      );
      expect((await payments(tx)).rows).toHaveLength(3);
      await tx.query("select public.undo_bill_occurrence($1, '2026-04-30', '2026-05-31')", [electricity]);
      expect((await payments(tx)).rows).toHaveLength(2);
      const orphans = await scalar<number>(
        tx,
        "select count(*)::int as v from public.transactions where description = 'Electricity' and occurred_on = '2026-04-29'",
      );
      expect(orphans).toBe(0);
    });
  });

  it("never records money for reminders or bills without an amount", async () => {
    await asUser(db, ALICE, async (tx) => {
      const ids = await tx.query<{ id: string }>(
        `insert into public.bills (kind, title, recurrence, anchor_date, next_due_date) values
           ('reminder', 'Renew passport', 'none', '2026-05-01', '2026-05-01'),
           ('bill', 'Water (varies)', 'none', '2026-05-02', '2026-05-02')
         returning id`,
      );
      for (const { id } of ids.rows) {
        await tx.query("select public.mark_bill_occurrence($1, (select next_due_date from public.bills where id = $1))", [id]);
      }
      const linked = await scalar<number>(
        tx,
        "select count(*)::int as v from public.transactions t join public.bill_occurrences o on o.id = t.bill_occurrence_id where o.bill_id = any ($1::uuid[])",
        [ids.rows.map((r) => r.id)],
      );
      expect(linked).toBe(0);
    });
  });

  it("separates bill payments from other spending in the money summary (no double counting)", async () => {
    await asUser(db, ALICE, async (tx) => {
      await tx.query(
        `insert into public.transactions (type, amount_minor, currency, description, category, occurred_on) values
           ('income', 3000000, 'PHP', 'Salary', 'Salary', '2026-01-15'),
           ('expense', 400000, 'PHP', 'Groceries', 'Food', '2026-01-20')`,
      );
      const { rows } = await tx.query<{ income_minor: number; bill_expense_minor: number; other_expense_minor: number }>(
        "select income_minor::int, bill_expense_minor::int, other_expense_minor::int from public.money_summary('2026-01-01', '2026-01-31') where currency = 'PHP'",
      );
      // Jan: salary 30,000; electricity paid 2,300 (linked); groceries 4,000.
      expect(rows[0]).toEqual({ income_minor: 3000000, bill_expense_minor: 230000, other_expense_minor: 400000 });
      const totals = await tx.query<{ total_minor: number }>(
        "select total_minor::int from public.transaction_totals('2026-01-01', '2026-01-31') where currency = 'PHP' and type = 'expense'",
      );
      expect(totals.rows[0]!.total_minor).toBe(630000); // each payment counted once
    });
  });

  it("protects bill payments from edits that would desync them", async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query("update public.transactions set amount_minor = 1 where bill_occurrence_id is not null and occurred_on = '2026-01-30'"),
      ),
    ).rejects.toThrow(/Change a bill payment from the bill/);
    // Description/category edits are fine.
    await asUser(db, ALICE, (tx) =>
      tx.query("update public.transactions set description = 'Electricity (Meralco)' where bill_occurrence_id is not null and occurred_on = '2026-01-30'"),
    );
    const occurrenceId = await asUser(db, ALICE, (tx) =>
      scalar<string>(tx, "select id::text as v from public.bill_occurrences where bill_id = $1 and due_date = '2026-03-31'", [electricity]),
    );
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.transactions (type, amount_minor, description, category, occurred_on, bill_occurrence_id)
           values ('income', 100, 'x', 'x', '2026-03-31', $1)`,
          [occurrenceId],
        ),
      ),
    ).rejects.toThrow(/must be expenses/);
  });

  it("keeps recorded spending when a bill is deleted", async () => {
    await asUser(db, ALICE, async (tx) => {
      const before = await scalar<number>(tx, "select count(*)::int as v from public.transactions where category = 'Utilities'");
      await tx.query("delete from public.bills where id = $1", [electricity]);
      const after = await tx.query<{ n: number; linked: number }>(
        "select count(*)::int as n, count(bill_occurrence_id)::int as linked from public.transactions where category = 'Utilities'",
      );
      expect(after.rows[0]).toEqual({ n: before, linked: 0 });
    });
  });
});

describe("bills: isolation", () => {
  it("prevents linking or reading another user's bill payments", async () => {
    const { billId, occurrenceId } = await asUser(db, ALICE, async (tx) => {
      const bill = await scalar<string>(
        tx,
        `insert into public.bills (title, amount_minor, recurrence, anchor_date, next_due_date)
         values ('Internet', 150000, 'monthly', '2026-06-15', '2026-06-15') returning id as v`,
      );
      await tx.query("select public.mark_bill_occurrence($1, '2026-06-15', '2026-07-15', p_paid_on => '2026-06-15')", [bill]);
      const occ = await scalar<string>(tx, "select id::text as v from public.bill_occurrences where bill_id = $1", [bill]);
      return { billId: bill, occurrenceId: occ };
    });

    await expect(
      asUser(db, BOB, (tx) =>
        tx.query(
          `insert into public.transactions (type, amount_minor, description, category, occurred_on, bill_occurrence_id)
           values ('expense', 100, 'steal', 'x', '2026-06-15', $1)`,
          [occurrenceId],
        ),
      ),
    ).rejects.toThrow(/foreign key|violates/);

    await asUser(db, BOB, async (tx) => {
      const summary = await tx.query("select * from public.money_summary('2026-06-01', '2026-06-30')");
      expect(summary.rows).toHaveLength(0);
      const undo = tx.query("select public.undo_bill_occurrence($1, '2026-06-15', '2026-07-15')", [billId]);
      await expect(undo).rejects.toThrow(/Bill not found/);
    });
  });

  it("denies anon the new functions", async () => {
    await expect(
      asRole(db, "anon", null, (tx) => tx.query("select * from public.money_summary('2026-01-01', '2026-01-31')")),
    ).rejects.toThrow(/permission denied/);
  });
});
