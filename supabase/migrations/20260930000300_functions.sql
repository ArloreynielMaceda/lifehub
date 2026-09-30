-- Database functions exposed as RPCs.
-- Aggregations are SECURITY INVOKER, so Row Level Security still applies and every total is
-- computed only over the caller's rows. Functions that must bypass RLS are SECURITY DEFINER,
-- pin search_path, and derive the user from auth.uid() instead of trusting parameters.

-- ---------------------------------------------------------------------------
-- Expense tracker aggregations (server-side totals; no need to fetch every row)
-- ---------------------------------------------------------------------------
create or replace function public.transaction_totals(p_from date, p_to date)
returns table (currency text, type public.transaction_type, total_minor bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.currency, t.type, coalesce(sum(t.amount_minor), 0)::bigint, count(*)
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.occurred_on between p_from and p_to
  group by t.currency, t.type;
$$;

create or replace function public.transaction_category_totals(
  p_from date,
  p_to date,
  p_type public.transaction_type,
  p_currency text
)
returns table (category text, total_minor bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.category, coalesce(sum(t.amount_minor), 0)::bigint, count(*)
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.type = p_type
    and t.currency = p_currency
    and t.occurred_on between p_from and p_to
  group by t.category
  order by 2 desc;
$$;

create or replace function public.transaction_monthly_trend(p_from date, p_to date, p_currency text)
returns table (month date, income_minor bigint, expense_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('month', t.occurred_on)::date,
    coalesce(sum(t.amount_minor) filter (where t.type = 'income'), 0)::bigint,
    coalesce(sum(t.amount_minor) filter (where t.type = 'expense'), 0)::bigint
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.currency = p_currency
    and t.occurred_on between p_from and p_to
  group by 1
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- Bills summary for the bills page and dashboard
-- ---------------------------------------------------------------------------
create or replace function public.bill_summary(p_today date, p_until date)
returns table (
  currency text,
  overdue_count bigint,
  overdue_total_minor bigint,
  upcoming_count bigint,
  upcoming_total_minor bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    b.currency,
    count(*) filter (where b.next_due_date < p_today),
    coalesce(sum(b.amount_minor) filter (where b.next_due_date < p_today), 0)::bigint,
    count(*) filter (where b.next_due_date between p_today and p_until),
    coalesce(sum(b.amount_minor) filter (where b.next_due_date between p_today and p_until), 0)::bigint
  from public.bills b
  where b.user_id = (select auth.uid())
    and b.status = 'active'
    and b.kind = 'bill'
    and b.next_due_date <= p_until
  group by b.currency;
$$;

-- ---------------------------------------------------------------------------
-- Mark the current occurrence of a bill/reminder as paid/done.
--
-- Idempotent and race-safe:
--   * the bill row is locked, and the call only proceeds when p_due_date is still the
--     bill's open occurrence (compare-and-swap), so a retried or duplicated request is a
--     no-op that returns 'unchanged';
--   * bill_occurrences has unique (bill_id, due_date) as a second guard.
-- The next due date is computed by the application's tested recurrence engine and
-- validated here (must be later than the paid occurrence).
-- ---------------------------------------------------------------------------
create or replace function public.mark_bill_occurrence(
  p_bill_id uuid,
  p_due_date date,
  p_next_due_date date default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill
  from public.bills
  where id = p_bill_id
  for update;

  if not found then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;

  if v_bill.status <> 'active' or v_bill.next_due_date <> p_due_date then
    return 'unchanged';
  end if;

  insert into public.bill_occurrences (bill_id, due_date, amount_minor, currency)
  values (v_bill.id, p_due_date, v_bill.amount_minor, v_bill.currency)
  on conflict (bill_id, due_date) do nothing;

  if v_bill.recurrence = 'none' then
    update public.bills set status = 'completed' where id = v_bill.id;
    return 'completed';
  end if;

  if p_next_due_date is null or p_next_due_date <= p_due_date then
    raise exception 'Next due date must be after the paid occurrence' using errcode = '22023';
  end if;

  update public.bills set next_due_date = p_next_due_date where id = v_bill.id;
  return 'advanced';
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo the most recent "mark paid/done". Only succeeds while the bill is still in the
-- state that call produced (compare-and-swap on p_expected_next_due_date), so it can never
-- rewind past later payments and is safe to retry.
-- ---------------------------------------------------------------------------
create or replace function public.undo_bill_occurrence(
  p_bill_id uuid,
  p_due_date date,
  p_expected_next_due_date date default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill
  from public.bills
  where id = p_bill_id
  for update;

  if not found then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;

  if v_bill.recurrence = 'none' then
    if v_bill.status <> 'completed' or v_bill.next_due_date <> p_due_date then
      return 'unchanged';
    end if;
  elsif v_bill.status <> 'active' or v_bill.next_due_date is distinct from p_expected_next_due_date then
    return 'unchanged';
  end if;

  delete from public.bill_occurrences where bill_id = v_bill.id and due_date = p_due_date;
  update public.bills
  set status = 'active', next_due_date = p_due_date
  where id = v_bill.id;
  return 'reverted';
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification generation (idempotent: unique (user_id, dedupe_key))
-- "Today" is computed per user from profiles.timezone.
-- ---------------------------------------------------------------------------
create or replace function private.generate_notifications(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  with users as (
    select p.id as user_id, (now() at time zone p.timezone)::date as today
    from public.profiles p
    where p_user_id is null or p.id = p_user_id
  ),
  bill_events as (
    select
      b.user_id,
      b.id as source_id,
      b.kind as bill_kind,
      b.title,
      b.next_due_date as due_date,
      (b.next_due_date - u.today) as days_until,
      case
        when b.next_due_date < u.today then 'overdue'
        when b.next_due_date = u.today then 'due_today'
        else 'due_soon'
      end::public.notification_kind as kind
    from public.bills b
    join users u on u.user_id = b.user_id
    where b.status = 'active'
      and b.next_due_date between u.today - 60 and u.today + 3
  ),
  task_events as (
    select
      t.user_id,
      t.id as source_id,
      t.title,
      t.due_date,
      case when t.due_date < u.today then 'overdue' else 'due_today' end::public.notification_kind as kind
    from public.tasks t
    join users u on u.user_id = t.user_id
    where t.status <> 'completed'
      and t.due_date between u.today - 30 and u.today
  ),
  events as (
    select
      user_id,
      kind,
      left(
        case kind
          when 'overdue' then title || ' is overdue'
          when 'due_today' then title || ' is due today'
          else title || case when days_until = 1 then ' is due tomorrow'
                             else ' is due in ' || days_until || ' days' end
        end,
        250
      ) as title,
      case bill_kind when 'bill' then 'Bill' else 'Reminder' end
        || ' · due ' || to_char(due_date, 'FMMon FMDD, YYYY') as body,
      '/bills' as link,
      'bill' as source_type,
      source_id,
      due_date,
      'bill:' || source_id::text || ':' || to_char(due_date, 'YYYY-MM-DD') || ':' || kind::text as dedupe_key
    from bill_events
    union all
    select
      user_id,
      kind,
      left(case kind when 'overdue' then title || ' is overdue' else title || ' is due today' end, 250),
      'Task · due ' || to_char(due_date, 'FMMon FMDD, YYYY'),
      '/tasks',
      'task',
      source_id,
      due_date,
      'task:' || source_id::text || ':' || to_char(due_date, 'YYYY-MM-DD') || ':' || kind::text
    from task_events
  )
  insert into public.notifications
    (user_id, kind, title, body, link, source_type, source_id, due_date, dedupe_key)
  select user_id, kind, title, body, link, source_type, source_id, due_date, dedupe_key
  from events
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;

  -- Housekeeping: drop read notifications older than 90 days.
  delete from public.notifications n
  where (p_user_id is null or n.user_id = p_user_id)
    and n.read_at is not null
    and n.created_at < now() - interval '90 days';

  return v_inserted;
end;
$$;

revoke all on function private.generate_notifications(uuid) from public, anon, authenticated;

-- Called by the signed-in user (from the app layout). Only ever affects the caller.
create or replace function public.sync_my_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  return private.generate_notifications(v_uid);
end;
$$;

-- Called only by the scheduled job with the secret (service role) key.
create or replace function public.generate_all_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.generate_notifications(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion: removes the caller's auth user; all rows cascade.
-- Storage objects are removed by the application (Storage API) before this runs.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges (Supabase grants EXECUTE to anon/authenticated by default)
-- ---------------------------------------------------------------------------
revoke all on function public.transaction_totals(date, date) from public, anon;
revoke all on function public.transaction_category_totals(date, date, public.transaction_type, text) from public, anon;
revoke all on function public.transaction_monthly_trend(date, date, text) from public, anon;
revoke all on function public.bill_summary(date, date) from public, anon;
revoke all on function public.mark_bill_occurrence(uuid, date, date) from public, anon;
revoke all on function public.undo_bill_occurrence(uuid, date, date) from public, anon;
revoke all on function public.sync_my_notifications() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.generate_all_notifications() from public, anon, authenticated;

grant execute on function public.transaction_totals(date, date) to authenticated;
grant execute on function public.transaction_category_totals(date, date, public.transaction_type, text) to authenticated;
grant execute on function public.transaction_monthly_trend(date, date, text) to authenticated;
grant execute on function public.bill_summary(date, date) to authenticated;
grant execute on function public.mark_bill_occurrence(uuid, date, date) to authenticated;
grant execute on function public.undo_bill_occurrence(uuid, date, date) to authenticated;
grant execute on function public.sync_my_notifications() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.generate_all_notifications() to service_role;
