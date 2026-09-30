import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asRole, asUser, createTestDatabase, createUser } from "../support/pglite-supabase";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await createUser(db, ALICE, { full_name: "Alice Santos", timezone: "Asia/Manila" });
  await createUser(db, BOB, { full_name: "Bob Reyes", timezone: "Not/A_Zone" });
});

afterAll(async () => {
  await db?.close();
});

async function rowCount(tx: { query: PGlite["query"] }, sql: string, params: unknown[] = []) {
  const result = await tx.query<{ count: number }>(`select count(*)::int as count from (${sql}) q`, params);
  return result.rows[0]!.count;
}

describe("profiles", () => {
  it("creates a profile on sign-up with validated metadata", async () => {
    const { rows } = await db.query<{ id: string; full_name: string; timezone: string; currency: string }>(
      "select id, full_name, timezone, currency from public.profiles order by full_name",
    );
    expect(rows).toEqual([
      { id: ALICE, full_name: "Alice Santos", timezone: "Asia/Manila", currency: "PHP" },
      // An invalid time zone in sign-up metadata falls back to the default.
      { id: BOB, full_name: "Bob Reyes", timezone: "Asia/Manila", currency: "PHP" },
    ]);
  });

  it("only exposes and updates the caller's own profile", async () => {
    await asUser(db, ALICE, async (tx) => {
      expect(await rowCount(tx, "select * from public.profiles")).toBe(1);
      const updated = await tx.query("update public.profiles set full_name = 'Hacked' where id = $1", [BOB]);
      expect(updated.affectedRows).toBe(0);
      await tx.query("update public.profiles set currency = 'USD', timezone = 'Europe/Berlin' where id = $1", [ALICE]);
    });
    const { rows } = await db.query<{ full_name: string }>("select full_name from public.profiles where id = $1", [BOB]);
    expect(rows[0]!.full_name).toBe("Bob Reyes");
    await db.query("update public.profiles set currency = 'PHP', timezone = 'Asia/Manila' where id = $1", [ALICE]);
  });

  it("rejects invalid time zones", async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query("update public.profiles set timezone = 'Mars/Olympus' where id = $1", [ALICE])),
    ).rejects.toThrow(/Invalid time zone/);
  });
});

describe("anonymous access", () => {
  it("denies anon any access to private tables", async () => {
    for (const table of ["profiles", "tasks", "bills", "transactions", "notes", "notifications", "documents"]) {
      await expect(
        asRole(db, "anon", null, (tx) => tx.query(`select * from public.${table}`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("denies anon the RPC functions", async () => {
    await expect(
      asRole(db, "anon", null, (tx) => tx.query("select public.sync_my_notifications()")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("tasks ownership", () => {
  let aliceTaskId: string;

  beforeAll(async () => {
    aliceTaskId = await asUser(db, ALICE, async (tx) => {
      const { rows } = await tx.query<{ id: string; user_id: string }>(
        "insert into public.tasks (title, due_date, priority) values ('Pay rent', '2026-10-01', 'high') returning id, user_id",
      );
      expect(rows[0]!.user_id).toBe(ALICE); // filled by default auth.uid()
      return rows[0]!.id;
    });
  });

  it("hides other users' tasks", async () => {
    await asUser(db, BOB, async (tx) => {
      expect(await rowCount(tx, "select * from public.tasks")).toBe(0);
      expect(await rowCount(tx, "select * from public.tasks where id = $1", [aliceTaskId])).toBe(0);
    });
  });

  it("blocks updating or deleting other users' tasks (IDOR)", async () => {
    await asUser(db, BOB, async (tx) => {
      const updated = await tx.query("update public.tasks set title = 'pwned' where id = $1", [aliceTaskId]);
      expect(updated.affectedRows).toBe(0);
      const deleted = await tx.query("delete from public.tasks where id = $1", [aliceTaskId]);
      expect(deleted.affectedRows).toBe(0);
    });
    const { rows } = await db.query<{ title: string }>("select title from public.tasks where id = $1", [aliceTaskId]);
    expect(rows[0]!.title).toBe("Pay rent");
  });

  it("never accepts a client-supplied user_id", async () => {
    await expect(
      asUser(db, BOB, (tx) =>
        tx.query("insert into public.tasks (user_id, title) values ($1, 'Injected')", [ALICE]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("maintains completed_at from status", async () => {
    await asUser(db, ALICE, async (tx) => {
      await tx.query("update public.tasks set status = 'completed' where id = $1", [aliceTaskId]);
      const done = await tx.query<{ completed_at: Date | null }>("select completed_at from public.tasks where id = $1", [aliceTaskId]);
      expect(done.rows[0]!.completed_at).not.toBeNull();
      await tx.query("update public.tasks set status = 'pending' where id = $1", [aliceTaskId]);
      const reopened = await tx.query<{ completed_at: Date | null }>("select completed_at from public.tasks where id = $1", [aliceTaskId]);
      expect(reopened.rows[0]!.completed_at).toBeNull();
    });
  });

  it("enforces title constraints", async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query("insert into public.tasks (title) values ('   ')")),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("bills and idempotent occurrences", () => {
  let monthlyId: string;
  let oneTimeId: string;

  beforeAll(async () => {
    await asUser(db, ALICE, async (tx) => {
      const monthly = await tx.query<{ id: string }>(
        `insert into public.bills (title, amount_minor, currency, recurrence, anchor_date, next_due_date)
         values ('Electricity', 250000, 'PHP', 'monthly', '2026-01-31', '2026-01-31') returning id`,
      );
      monthlyId = monthly.rows[0]!.id;
      const once = await tx.query<{ id: string }>(
        `insert into public.bills (kind, title, recurrence, anchor_date, next_due_date)
         values ('reminder', 'Renew passport', 'none', '2026-11-15', '2026-11-15') returning id`,
      );
      oneTimeId = once.rows[0]!.id;
    });
  });

  it("advances a recurring bill exactly once when the request is retried", async () => {
    await asUser(db, ALICE, async (tx) => {
      const first = await tx.query<{ result: string }>(
        "select public.mark_bill_occurrence($1, '2026-01-31', '2026-02-28', p_paid_on => '2026-01-31') as result",
        [monthlyId],
      );
      const retry = await tx.query<{ result: string }>(
        "select public.mark_bill_occurrence($1, '2026-01-31', '2026-02-28', p_paid_on => '2026-01-31') as result",
        [monthlyId],
      );
      expect(first.rows[0]!.result).toBe("advanced");
      expect(retry.rows[0]!.result).toBe("unchanged");
      expect(await rowCount(tx, "select * from public.bill_occurrences where bill_id = $1", [monthlyId])).toBe(1);
      const bill = await tx.query<{ next_due_date: Date }>("select next_due_date::text as next_due_date from public.bills where id = $1", [monthlyId]);
      expect(String(bill.rows[0]!.next_due_date)).toBe("2026-02-28");
    });
  });

  it("rejects a next due date that does not move forward", async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query("select public.mark_bill_occurrence($1, '2026-02-28', '2026-02-01')", [monthlyId]),
      ),
    ).rejects.toThrow(/Next due date/);
  });

  it("completes a one-time reminder", async () => {
    await asUser(db, ALICE, async (tx) => {
      const result = await tx.query<{ result: string }>(
        "select public.mark_bill_occurrence($1, '2026-11-15') as result",
        [oneTimeId],
      );
      expect(result.rows[0]!.result).toBe("completed");
      const again = await tx.query<{ result: string }>(
        "select public.mark_bill_occurrence($1, '2026-11-15') as result",
        [oneTimeId],
      );
      expect(again.rows[0]!.result).toBe("unchanged");
    });
  });

  it("does not let another user mark or read someone else's bill", async () => {
    await expect(
      asUser(db, BOB, (tx) =>
        tx.query("select public.mark_bill_occurrence($1, '2026-02-28', '2026-03-31')", [monthlyId]),
      ),
    ).rejects.toThrow(/Bill not found/);
    await asUser(db, BOB, async (tx) => {
      expect(await rowCount(tx, "select * from public.bill_occurrences")).toBe(0);
    });
  });

  it("prevents attaching an occurrence to another user's bill", async () => {
    await expect(
      asUser(db, BOB, (tx) =>
        tx.query(
          "insert into public.bill_occurrences (bill_id, due_date, currency) values ($1, '2026-03-31', 'PHP')",
          [monthlyId],
        ),
      ),
    ).rejects.toThrow(/foreign key|violates/);
  });

  it("enforces one-time bills keep next_due_date equal to the anchor", async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.bills (title, recurrence, anchor_date, next_due_date)
           values ('Bad', 'none', '2026-01-01', '2026-02-01')`,
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("undoes the latest payment only while the state still matches", async () => {
    await asUser(db, ALICE, async (tx) => {
      const undo = (due: string, expectedNext: string | null) =>
        tx
          .query<{ result: string }>("select public.undo_bill_occurrence($1, $2, $3) as result", [monthlyId, due, expectedNext])
          .then((r) => r.rows[0]!.result);
      expect(await undo("2026-01-31", "2026-03-31")).toBe("unchanged"); // stale expectation
      expect(await undo("2026-01-31", "2026-02-28")).toBe("reverted");
      expect(await undo("2026-01-31", "2026-02-28")).toBe("unchanged"); // retry is a no-op
      expect(await rowCount(tx, "select * from public.bill_occurrences where bill_id = $1", [monthlyId])).toBe(0);
      const bill = await tx.query<{ next_due_date: string }>("select next_due_date::text as next_due_date from public.bills where id = $1", [monthlyId]);
      expect(bill.rows[0]!.next_due_date).toBe("2026-01-31");
      // Restore the paid state for the following tests.
      await tx.query("select public.mark_bill_occurrence($1, '2026-01-31', '2026-02-28', p_paid_on => '2026-01-31')", [monthlyId]);

      const once = await tx.query<{ result: string }>(
        "select public.undo_bill_occurrence($1, '2026-11-15') as result",
        [oneTimeId],
      );
      expect(once.rows[0]!.result).toBe("reverted");
      const reminder = await tx.query<{ status: string }>("select status::text from public.bills where id = $1", [oneTimeId]);
      expect(reminder.rows[0]!.status).toBe("active");
    });
  });

  it("summarises upcoming and overdue bills per currency", async () => {
    await asUser(db, ALICE, async (tx) => {
      const { rows } = await tx.query<{ currency: string; overdue_count: number; upcoming_count: number; upcoming_total_minor: number }>(
        "select currency, overdue_count::int, upcoming_count::int, upcoming_total_minor::int from public.bill_summary('2026-02-01', '2026-03-31')",
      );
      expect(rows).toEqual([{ currency: "PHP", overdue_count: 0, upcoming_count: 1, upcoming_total_minor: 250000 }]);
    });
  });
});

describe("transactions aggregates", () => {
  beforeAll(async () => {
    await asUser(db, ALICE, async (tx) => {
      await tx.query(
        `insert into public.transactions (type, amount_minor, currency, description, category, occurred_on) values
         ('income', 5000000, 'PHP', 'Salary', 'Salary', '2026-09-01'),
         ('expense', 123456, 'PHP', 'Groceries', 'Food', '2026-09-03'),
         ('expense', 10001, 'PHP', 'Coffee', 'Food', '2026-09-04'),
         ('expense', 99999, 'PHP', 'Jeepney card', 'Transport', '2026-08-20'),
         ('expense', 500, 'USD', 'App subscription', 'Subscriptions', '2026-09-05')`,
      );
    });
    await asUser(db, BOB, async (tx) => {
      await tx.query(
        `insert into public.transactions (type, amount_minor, currency, description, category, occurred_on)
         values ('expense', 777777, 'PHP', 'Bob private', 'Food', '2026-09-10')`,
      );
    });
  });

  it("totals only the caller's rows, grouped by currency and type", async () => {
    await asUser(db, ALICE, async (tx) => {
      const { rows } = await tx.query<{ currency: string; type: string; total_minor: number; tx_count: number }>(
        "select currency, type::text, total_minor::int, tx_count::int from public.transaction_totals('2026-09-01', '2026-09-30') order by currency, type",
      );
      expect(rows).toEqual([
        { currency: "PHP", type: "income", total_minor: 5000000, tx_count: 1 },
        { currency: "PHP", type: "expense", total_minor: 133457, tx_count: 2 },
        { currency: "USD", type: "expense", total_minor: 500, tx_count: 1 },
      ].sort((a, b) => a.currency.localeCompare(b.currency) || a.type.localeCompare(b.type)));
    });
  });

  it("returns category and monthly trend breakdowns", async () => {
    await asUser(db, ALICE, async (tx) => {
      const categories = await tx.query<{ category: string; total_minor: number }>(
        "select category, total_minor::int from public.transaction_category_totals('2026-08-01', '2026-09-30', 'expense', 'PHP')",
      );
      expect(categories.rows).toEqual([
        { category: "Food", total_minor: 133457 },
        { category: "Transport", total_minor: 99999 },
      ]);
      const trend = await tx.query<{ month: string; income_minor: number; expense_minor: number }>(
        "select month::text, income_minor::int, expense_minor::int from public.transaction_monthly_trend('2026-08-01', '2026-09-30', 'PHP')",
      );
      expect(trend.rows).toEqual([
        { month: "2026-08-01", income_minor: 0, expense_minor: 99999 },
        { month: "2026-09-01", income_minor: 5000000, expense_minor: 133457 },
      ]);
    });
  });

  it("does not allow changing a transaction's currency", async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query("update public.transactions set currency = 'USD'")),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects non-positive amounts", async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.transactions (type, amount_minor, description, category, occurred_on)
           values ('expense', 0, 'Zero', 'Food', '2026-09-01')`,
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("notifications", () => {
  beforeAll(async () => {
    const today = await db.query<{ today: string }>(
      "select (now() at time zone 'Asia/Manila')::date::text as today",
    );
    const t = today.rows[0]!.today;
    await asUser(db, ALICE, async (tx) => {
      await tx.query("insert into public.tasks (title, due_date) values ('Due today task', $1::date)", [t]);
      await tx.query("insert into public.tasks (title, due_date) values ('Late task', $1::date - 2)", [t]);
      await tx.query(
        `insert into public.bills (title, recurrence, anchor_date, next_due_date)
         values ('Internet', 'monthly', $1::date + 1, $1::date + 1)`,
        [t],
      );
    });
  });

  it("generates each notification once, even when sync runs repeatedly", async () => {
    await asUser(db, ALICE, async (tx) => {
      const first = await tx.query<{ n: number }>("select public.sync_my_notifications() as n");
      const second = await tx.query<{ n: number }>("select public.sync_my_notifications() as n");
      expect(first.rows[0]!.n).toBeGreaterThanOrEqual(3);
      expect(second.rows[0]!.n).toBe(0);
      const kinds = await tx.query<{ title: string; kind: string }>(
        "select title, kind::text from public.notifications where title in ('Due today task is due today', 'Late task is overdue', 'Internet is due tomorrow') order by title",
      );
      expect(kinds.rows.map((r) => r.kind).sort()).toEqual(["due_soon", "due_today", "overdue"]);
    });
  });

  it("keeps notifications private and read-only except read_at", async () => {
    await asUser(db, BOB, async (tx) => {
      await tx.query("select public.sync_my_notifications()");
      expect(await rowCount(tx, "select * from public.notifications")).toBe(0);
    });
    await expect(
      asUser(db, ALICE, (tx) => tx.query("update public.notifications set title = 'x'")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.notifications (kind, title, source_type, source_id, due_date, dedupe_key)
           values ('overdue', 'fake', 'task', gen_random_uuid(), current_date, 'fake')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await asUser(db, ALICE, async (tx) => {
      const marked = await tx.query("update public.notifications set read_at = now() where read_at is null");
      expect(marked.affectedRows).toBeGreaterThan(0);
    });
  });

  it("restricts the all-users generator to the service role", async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query("select public.generate_all_notifications()")),
    ).rejects.toThrow(/permission denied/);
    const result = await asRole(db, "service_role", null, (tx) =>
      tx.query<{ n: number }>("select public.generate_all_notifications() as n"),
    );
    expect(result.rows[0]!.n).toBe(0); // already generated, nothing duplicated
  });
});

describe("documents and storage", () => {
  it("requires the object path to be inside the owner's folder", async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.documents (name, storage_path, mime_type, size_bytes)
           values ('x.pdf', $1, 'application/pdf', 100)`,
          [`${BOB}/0f0e0d0c-0b0a-4908-8706-050403020100.pdf`],
        ),
      ),
    ).rejects.toThrow(/check constraint/);

    await asUser(db, ALICE, (tx) =>
      tx.query(
        `insert into public.documents (name, storage_path, mime_type, size_bytes)
         values ('Passport.pdf', $1, 'application/pdf', 2048)`,
        [`${ALICE}/0f0e0d0c-0b0a-4908-8706-050403020100.pdf`],
      ),
    );
    await asUser(db, BOB, async (tx) => {
      expect(await rowCount(tx, "select * from public.documents")).toBe(0);
    });
  });

  it("rejects disallowed MIME types and oversize files", async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.documents (name, storage_path, mime_type, size_bytes)
           values ('x.svg', $1, 'image/svg+xml', 100)`,
          [`${ALICE}/1f0e0d0c-0b0a-4908-8706-050403020100.png`],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.documents (name, storage_path, mime_type, size_bytes)
           values ('big.pdf', $1, 'application/pdf', 10485761)`,
          [`${ALICE}/2f0e0d0c-0b0a-4908-8706-050403020100.pdf`],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("confines storage objects to the user's folder", async () => {
    await asUser(db, ALICE, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
        `${ALICE}/0f0e0d0c-0b0a-4908-8706-050403020100.pdf`,
      ]),
    );
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
          `${BOB}/evil.pdf`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    await asUser(db, BOB, async (tx) => {
      expect(await rowCount(tx, "select * from storage.objects")).toBe(0);
      const deleted = await tx.query("delete from storage.objects");
      expect(deleted.affectedRows).toBe(0);
    });
  });

  it("configures a private bucket with size and type limits", async () => {
    const { rows } = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      "select public, file_size_limit::int, allowed_mime_types from storage.buckets where id = 'documents'",
    );
    expect(rows[0]).toEqual({
      public: false,
      file_size_limit: 10485760,
      allowed_mime_types: ["application/pdf", "image/jpeg", "image/png"],
    });
  });
});

describe("account deletion", () => {
  it("deletes only the caller and cascades their data", async () => {
    const CAROL = "33333333-3333-4333-8333-333333333333";
    await createUser(db, CAROL, { full_name: "Carol" });
    await asUser(db, CAROL, (tx) => tx.query("insert into public.notes (title, content) values ('Secret', 'x')"));
    await asUser(db, CAROL, (tx) => tx.query("select public.delete_my_account()"));
    const users = await db.query<{ id: string }>("select id from auth.users order by id");
    expect(users.rows.map((r) => r.id)).toEqual([ALICE, BOB]);
    const notes = await db.query("select * from public.notes where user_id = $1", [CAROL]);
    expect(notes.rows).toHaveLength(0);
  });
});
