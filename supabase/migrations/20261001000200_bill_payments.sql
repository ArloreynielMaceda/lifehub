-- Bills ⇄ expenses.
--
-- Money model:
--   * transactions are the single source of truth for ACTUAL money (income, expenses).
--   * Marking a bill paid records the occurrence (bill_occurrences) AND exactly one linked
--     expense transaction (transactions.bill_occurrence_id, unique). Totals come only from
--     transactions, so a paid bill is counted once.
--   * Unpaid bills are never stored as spending; they are planned commitments computed from
--     the bill schedule.
--   * An occurrence can be skipped (outcome = 'skipped'): the schedule moves on, no money is
--     recorded, and history keeps the skip.
--
-- Additive and non-destructive. Existing occurrences become outcome = 'done'. Past payments
-- recorded before this migration are NOT back-filled as expenses (they may already have been
-- logged by hand), so historical totals do not change.

create type public.bill_outcome as enum ('done', 'skipped');

alter table public.bill_occurrences
  add column outcome public.bill_outcome not null default 'done',
  add constraint bill_occurrences_id_user_unique unique (id, user_id);

comment on column public.bill_occurrences.outcome is 'done = paid (bills) / done (reminders); skipped = skipped or cancelled.';

alter table public.transactions
  add column bill_occurrence_id uuid,
  add constraint transactions_bill_occurrence_unique unique (bill_occurrence_id),
  -- Same owner as the occurrence. If the bill (and so its occurrences) is deleted, the
  -- expense stays — it was real money — and simply loses the link.
  add constraint transactions_bill_occurrence_fk
    foreign key (bill_occurrence_id, user_id)
    references public.bill_occurrences (id, user_id)
    on delete set null (bill_occurrence_id);

comment on column public.transactions.bill_occurrence_id is 'Set when this expense is the payment of a bill occurrence.';

create index transactions_user_bill_idx on public.transactions (user_id, occurred_on) where bill_occurrence_id is not null;

grant insert (outcome) on public.bill_occurrences to authenticated;
grant insert (bill_occurrence_id) on public.transactions to authenticated;

-- A bill payment is always an expense, and its amount/type can only change by undoing and
-- re-marking the bill (keeps the occurrence and the expense consistent).
create or replace function private.guard_bill_payment_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bill_occurrence_id is not null and new.type <> 'expense' then
    raise exception 'Bill payments must be expenses' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE'
     and old.bill_occurrence_id is not null
     and new.bill_occurrence_id is not distinct from old.bill_occurrence_id
     and (new.amount_minor <> old.amount_minor or new.type <> old.type) then
    raise exception 'Change a bill payment from the bill (undo, then mark paid again)' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger transactions_guard_bill_payment
  before insert or update on public.transactions
  for each row execute function private.guard_bill_payment_transaction();

-- ---------------------------------------------------------------------------
-- mark_bill_occurrence v2: paid or skipped, optionally recording the expense.
-- Replaces v1 (same first three parameters, new ones have defaults, so existing callers keep
-- working). Still idempotent and race-safe: compare-and-swap on next_due_date, unique
-- (bill_id, due_date) on occurrences and unique bill_occurrence_id on transactions.
-- ---------------------------------------------------------------------------
drop function if exists public.mark_bill_occurrence(uuid, date, date);

create or replace function public.mark_bill_occurrence(
  p_bill_id uuid,
  p_due_date date,
  p_next_due_date date default null,
  p_outcome public.bill_outcome default 'done',
  p_amount_minor bigint default null,
  p_paid_on date default null,
  p_payment_method public.payment_method default null,
  p_record_expense boolean default true
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bill public.bills%rowtype;
  v_amount bigint;
  v_occurrence_id uuid;
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

  if p_outcome = 'done' then
    v_amount := coalesce(p_amount_minor, v_bill.amount_minor);
  end if;

  insert into public.bill_occurrences (bill_id, due_date, amount_minor, currency, outcome)
  values (v_bill.id, p_due_date, v_amount, v_bill.currency, p_outcome)
  on conflict (bill_id, due_date) do nothing
  returning id into v_occurrence_id;

  -- Actual spending: one expense per paid bill occurrence, never more.
  if v_occurrence_id is not null
     and p_outcome = 'done'
     and v_bill.kind = 'bill'
     and v_amount is not null
     and p_record_expense then
    insert into public.transactions
      (type, amount_minor, currency, description, category, payment_method, occurred_on, bill_occurrence_id)
    values (
      'expense',
      v_amount,
      v_bill.currency,
      left(v_bill.title, 200),
      coalesce(nullif(btrim(v_bill.category), ''), 'Bills'),
      coalesce(p_payment_method, 'other'),
      coalesce(p_paid_on, current_date),
      v_occurrence_id
    )
    on conflict (bill_occurrence_id) do nothing;
  end if;

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

-- Undo also removes the expense that the payment recorded.
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

  delete from public.transactions t
  using public.bill_occurrences o
  where o.bill_id = v_bill.id
    and o.due_date = p_due_date
    and t.bill_occurrence_id = o.id;

  delete from public.bill_occurrences where bill_id = v_bill.id and due_date = p_due_date;

  update public.bills
  set status = 'active', next_due_date = p_due_date
  where id = v_bill.id;
  return 'reverted';
end;
$$;

-- ---------------------------------------------------------------------------
-- money_summary: actual income and spending for a period, with bill payments separated
-- from other expenses. Security invoker → RLS scopes it to the caller.
-- ---------------------------------------------------------------------------
create or replace function public.money_summary(p_from date, p_to date)
returns table (
  currency text,
  income_minor bigint,
  bill_expense_minor bigint,
  other_expense_minor bigint,
  tx_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.currency,
    coalesce(sum(t.amount_minor) filter (where t.type = 'income'), 0)::bigint,
    coalesce(sum(t.amount_minor) filter (where t.type = 'expense' and t.bill_occurrence_id is not null), 0)::bigint,
    coalesce(sum(t.amount_minor) filter (where t.type = 'expense' and t.bill_occurrence_id is null), 0)::bigint,
    count(*)
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.occurred_on between p_from and p_to
  group by t.currency;
$$;

revoke all on function public.mark_bill_occurrence(uuid, date, date, public.bill_outcome, bigint, date, public.payment_method, boolean) from public, anon;
revoke all on function public.undo_bill_occurrence(uuid, date, date) from public, anon;
revoke all on function public.money_summary(date, date) from public, anon;

grant execute on function public.mark_bill_occurrence(uuid, date, date, public.bill_outcome, bigint, date, public.payment_method, boolean) to authenticated;
grant execute on function public.undo_bill_occurrence(uuid, date, date) to authenticated;
grant execute on function public.money_summary(date, date) to authenticated;
