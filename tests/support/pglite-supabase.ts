import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

/**
 * Boots an in-process Postgres (PGlite, WebAssembly — no Docker) that mimics the parts of
 * Supabase the migrations rely on: the anon/authenticated/service_role roles, auth.users and
 * auth.uid(), the storage schema with storage.foldername(), and Supabase's default grants on
 * the public schema (so the migrations' revokes are genuinely exercised).
 *
 * This validates SQL, constraints, triggers, RLS policies and grants. It is not a substitute
 * for running the live suite against a real Supabase project (tests/integration).
 */

const BOOTSTRAP_SQL = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create role supabase_auth_admin nologin noinherit;

  create schema extensions;
  grant usage on schema extensions to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    email_confirmed_at timestamptz,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    created_at timestamptz not null default now()
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end
  $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;

  -- Supabase's default privileges on the public schema.
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export async function createTestDatabase(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(BOOTSTRAP_SQL);
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/**
 * Inserts a user the way Supabase Auth does. `confirmed: false` leaves it as a pending sign-up
 * (email_confirmed_at null) until `confirmUser` is called, like opening the confirmation link.
 */
export async function createUser(
  db: PGlite,
  id: string,
  metadata: Record<string, unknown> = {},
  { confirmed = true }: { confirmed?: boolean } = {},
): Promise<void> {
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, $4)",
    [id, `${id.slice(0, 8)}@example.test`, JSON.stringify(metadata), confirmed ? new Date().toISOString() : null],
  );
}

export async function confirmUser(db: PGlite, id: string): Promise<void> {
  await db.query("update auth.users set email_confirmed_at = now() where id = $1", [id]);
}

type Role = "authenticated" | "anon" | "service_role";

/**
 * Runs `fn` inside a transaction as the given database role, with auth.uid() returning
 * `userId`. The transaction is committed unless `fn` throws.
 */
export async function asRole<T>(
  db: PGlite,
  role: Role,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

export function asUser<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>) {
  return asRole(db, "authenticated", userId, fn);
}
