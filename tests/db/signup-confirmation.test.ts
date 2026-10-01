import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asUser, confirmUser, createTestDatabase, createUser } from "../support/pglite-supabase";

const PENDING = "33333333-3333-4333-8333-333333333333";
const CONFIRMED = "44444444-4444-4444-8444-444444444444";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db?.close();
});

async function profileOf(id: string) {
  const { rows } = await db.query<{ full_name: string; timezone: string }>(
    "select full_name, timezone from public.profiles where id = $1",
    [id],
  );
  return rows[0] ?? null;
}

describe("LifeHub data is created only once the email is confirmed", () => {
  it("a pending sign-up has no profile", async () => {
    await createUser(db, PENDING, { full_name: "Maria Clara", timezone: "Asia/Tokyo" }, { confirmed: false });
    expect(await profileOf(PENDING)).toBeNull();
  });

  it("opening the confirmation link creates the profile from the sign-up details", async () => {
    await confirmUser(db, PENDING);
    expect(await profileOf(PENDING)).toEqual({ full_name: "Maria Clara", timezone: "Asia/Tokyo" });
  });

  it("later updates never duplicate or overwrite the profile", async () => {
    await db.query("update public.profiles set full_name = 'Maria' where id = $1", [PENDING]);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [PENDING]);
    await db.query("update auth.users set email = 'new@example.test' where id = $1", [PENDING]);
    const { rows } = await db.query("select 1 from public.profiles where id = $1", [PENDING]);
    expect(rows).toHaveLength(1);
    expect((await profileOf(PENDING))?.full_name).toBe("Maria");
  });

  it("users confirmed at creation (admin-created, or confirmation off) get a profile straight away", async () => {
    await createUser(db, CONFIRMED, { full_name: "Jose", timezone: "Not/A_Zone" });
    expect(await profileOf(CONFIRMED)).toEqual({ full_name: "Jose", timezone: "Asia/Manila" });
  });

  it("confirming one account creates nothing for anyone else", async () => {
    const other = "55555555-5555-4555-8555-555555555555";
    await createUser(db, other, {}, { confirmed: false });
    await confirmUser(db, PENDING);
    expect(await profileOf(other)).toBeNull();
    const visible = await asUser(db, CONFIRMED, (tx) => tx.query("select id from public.profiles"));
    expect(visible.rows).toEqual([{ id: CONFIRMED }]);
  });
});
