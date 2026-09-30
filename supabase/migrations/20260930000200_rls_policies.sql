-- Row Level Security: every private table is readable and writable only by its owner.
-- Policies use (select auth.uid()) so Postgres evaluates it once per statement.
-- Grants are explicit so access never depends on project-level default privileges.

-- ---------------------------------------------------------------------------
-- Baseline: anonymous users get nothing.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.tasks, public.bills, public.bill_occurrences,
  public.transactions, public.notes, public.notifications, public.documents
  from anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, full_name, currency, timezone, email_reminders) on public.profiles to authenticated;
grant update (full_name, currency, timezone, email_reminders) on public.profiles to authenticated;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;

revoke all on public.tasks from authenticated;
grant select, delete on public.tasks to authenticated;
grant insert (title, description, due_date, priority, status, category) on public.tasks to authenticated;
grant update (title, description, due_date, priority, status, category) on public.tasks to authenticated;

create policy "tasks_select_own" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- bills
-- ---------------------------------------------------------------------------
alter table public.bills enable row level security;

revoke all on public.bills from authenticated;
grant select, delete on public.bills to authenticated;
grant insert (kind, title, description, category, amount_minor, currency, recurrence, anchor_date, next_due_date, status)
  on public.bills to authenticated;
grant update (kind, title, description, category, amount_minor, recurrence, anchor_date, next_due_date, status)
  on public.bills to authenticated;

create policy "bills_select_own" on public.bills
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bills_insert_own" on public.bills
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bills_update_own" on public.bills
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "bills_delete_own" on public.bills
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- bill_occurrences (history is append-only for clients; rows go away with the bill)
-- ---------------------------------------------------------------------------
alter table public.bill_occurrences enable row level security;

revoke all on public.bill_occurrences from authenticated;
grant select, delete on public.bill_occurrences to authenticated;
-- user_id is filled by its default (auth.uid()); the composite FK ties it to the bill owner.
grant insert (bill_id, due_date, amount_minor, currency) on public.bill_occurrences to authenticated;

create policy "bill_occurrences_select_own" on public.bill_occurrences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bill_occurrences_insert_own" on public.bill_occurrences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bill_occurrences_delete_own" on public.bill_occurrences
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
alter table public.transactions enable row level security;

revoke all on public.transactions from authenticated;
grant select, delete on public.transactions to authenticated;
grant insert (type, amount_minor, currency, description, category, payment_method, occurred_on)
  on public.transactions to authenticated;
-- currency is intentionally not updatable: historical amounts keep their original currency.
grant update (type, amount_minor, description, category, payment_method, occurred_on)
  on public.transactions to authenticated;

create policy "transactions_select_own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
alter table public.notes enable row level security;

revoke all on public.notes from authenticated;
grant select, delete on public.notes to authenticated;
grant insert (title, content, pinned) on public.notes to authenticated;
grant update (title, content, pinned) on public.notes to authenticated;

create policy "notes_select_own" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notes_insert_own" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notes_update_own" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "notes_delete_own" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- notifications (created only by the generation functions; users may mark read / delete)
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

revoke all on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "notifications_select_own" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;

revoke all on public.documents from authenticated;
grant select, delete on public.documents to authenticated;
grant insert (name, storage_path, mime_type, size_bytes) on public.documents to authenticated;
grant update (name, status, size_bytes) on public.documents to authenticated;

create policy "documents_select_own" on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "documents_insert_own" on public.documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "documents_update_own" on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "documents_delete_own" on public.documents
  for delete to authenticated using ((select auth.uid()) = user_id);

-- The service role (used only by the scheduled reminder job) bypasses RLS but still needs
-- table privileges.
grant all on public.profiles, public.tasks, public.bills, public.bill_occurrences,
  public.transactions, public.notes, public.notifications, public.documents
  to service_role;
