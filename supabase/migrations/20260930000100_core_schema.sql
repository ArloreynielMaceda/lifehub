-- LifeHub core schema: types, tables, constraints, indexes and triggers.
-- Row Level Security is enabled in the next migration.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Private schema for internal helpers. It is not exposed through the Data API.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.task_priority as enum ('low', 'medium', 'high');
create type public.task_status as enum ('pending', 'in_progress', 'completed');
create type public.bill_kind as enum ('bill', 'reminder');
create type public.recurrence_rule as enum ('none', 'daily', 'weekly', 'monthly', 'yearly');
create type public.bill_status as enum ('active', 'completed');
create type public.transaction_type as enum ('income', 'expense');
create type public.payment_method as enum (
  'cash', 'debit_card', 'credit_card', 'bank_transfer', 'e_wallet', 'other'
);
create type public.document_status as enum ('pending', 'ready');
create type public.notification_kind as enum ('due_soon', 'due_today', 'overdue');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone);
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Manila' check (char_length(timezone) between 1 and 64),
  email_reminders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profile and preferences (currency, time zone).';

-- Runs as the updating user, so it must not call other functions in the private schema
-- (authenticated users have no usage privilege on it).
create or replace function private.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_validate
  before insert or update of timezone on public.profiles
  for each row execute function private.validate_profile();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create a profile whenever a user signs up. Name and time zone come from sign-up metadata
-- and are validated; anything unexpected falls back to defaults.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := new.raw_user_meta_data ->> 'timezone';
begin
  if v_timezone is null or not private.is_valid_timezone(v_timezone) then
    v_timezone := 'Asia/Manila';
  end if;

  insert into public.profiles (id, full_name, timezone)
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100),
    v_timezone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  due_date date,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'pending',
  category text not null default '' check (char_length(category) <= 50),
  completed_at timestamptz,
  search_text text generated always as (title || ' ' || description || ' ' || category) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_completed_at_matches_status
    check ((status = 'completed') = (completed_at is not null))
);

create index tasks_user_due_idx on public.tasks (user_id, due_date);
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_created_idx on public.tasks (user_id, created_at desc);
create index tasks_search_idx on public.tasks using gin (search_text extensions.gin_trgm_ops);

-- Keep completed_at in sync with status so clients cannot get it wrong.
create or replace function private.tasks_sync_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'UPDATE' and old.status = 'completed' then
      new.completed_at := coalesce(old.completed_at, now()); -- keep the original completion time
    else
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_sync_completed_at
  before insert or update on public.tasks
  for each row execute function private.tasks_sync_completed_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- bills: bills and reminders, optionally recurring
-- ---------------------------------------------------------------------------
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.bill_kind not null default 'bill',
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (char_length(category) <= 50),
  amount_minor bigint check (amount_minor is null or (amount_minor > 0 and amount_minor <= 999999999999)),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  recurrence public.recurrence_rule not null default 'none',
  anchor_date date not null,
  next_due_date date not null,
  status public.bill_status not null default 'active',
  search_text text generated always as (title || ' ' || description || ' ' || category) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bills_next_on_or_after_anchor check (next_due_date >= anchor_date),
  constraint bills_one_time_next_is_anchor check (recurrence <> 'none' or next_due_date = anchor_date),
  -- Lets bill_occurrences reference (id, user_id) so an occurrence can never belong to
  -- a different user than its bill.
  constraint bills_id_user_unique unique (id, user_id)
);

create index bills_user_status_due_idx on public.bills (user_id, status, next_due_date);
create index bills_user_kind_idx on public.bills (user_id, kind, next_due_date);
create index bills_search_idx on public.bills using gin (search_text extensions.gin_trgm_ops);

create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- bill_occurrences: paid / done history. unique (bill_id, due_date) makes
-- "mark as paid" idempotent under retries.
-- ---------------------------------------------------------------------------
create table public.bill_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  bill_id uuid not null,
  due_date date not null,
  amount_minor bigint check (amount_minor is null or (amount_minor > 0 and amount_minor <= 999999999999)),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint bill_occurrences_bill_fk
    foreign key (bill_id, user_id) references public.bills (id, user_id) on delete cascade,
  constraint bill_occurrences_user_fk
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint bill_occurrences_unique_due unique (bill_id, due_date)
);

create index bill_occurrences_user_completed_idx on public.bill_occurrences (user_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- transactions: manual income / expense log
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type public.transaction_type not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 999999999999),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  category text not null check (char_length(btrim(category)) between 1 and 50),
  payment_method public.payment_method not null default 'cash',
  occurred_on date not null,
  search_text text generated always as (description || ' ' || category) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc, created_at desc);
create index transactions_user_type_date_idx on public.transactions (user_id, type, occurred_on);
create index transactions_search_idx on public.transactions using gin (search_text extensions.gin_trgm_ops);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  content text not null default '' check (char_length(content) <= 50000),
  pinned boolean not null default false,
  search_text text generated always as (title || ' ' || content) stored,
  -- Short preview for list views, so lists never download full note bodies.
  excerpt text generated always as (left(content, 280)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_pinned_updated_idx on public.notes (user_id, pinned desc, updated_at desc);
create index notes_search_idx on public.notes using gin (search_text extensions.gin_trgm_ops);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications: in-app notification center. unique (user_id, dedupe_key)
-- guarantees each due/overdue event is recorded once, even if generation is retried.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null check (char_length(title) between 1 and 250),
  body text not null default '' check (char_length(body) <= 500),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&-]*$'),
  source_type text not null check (source_type in ('task', 'bill')),
  source_id uuid not null,
  due_date date not null,
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_dedupe unique (user_id, dedupe_key)
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_source_idx on public.notifications (source_id);
create index notifications_unemailed_idx on public.notifications (created_at) where emailed_at is null;

-- ---------------------------------------------------------------------------
-- documents: metadata for files in the private "documents" storage bucket
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$'),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  status public.document_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The object must live in the owner's folder.
  constraint documents_path_in_owner_folder check (split_part(storage_path, '/', 1) = user_id::text)
);

create index documents_user_created_idx on public.documents (user_id, status, created_at desc);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function private.set_updated_at();

create or replace function private.enforce_document_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.documents d where d.user_id = new.user_id) >= 200 then
    raise exception 'Document limit reached' using errcode = 'P0001', hint = 'document_quota';
  end if;
  return new;
end;
$$;

create trigger documents_enforce_quota
  before insert on public.documents
  for each row execute function private.enforce_document_quota();
