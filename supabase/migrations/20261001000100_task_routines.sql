-- Recurring routines.
--
-- A routine is a row in public.tasks with kind = 'routine' plus a weekly schedule
-- (repeat_days, starts_on, optional ends_on, optional reminder_time, paused_on).
-- Nothing is generated ahead of time: occurrences are computed from the schedule, and only
-- completed dates are stored, one row per date, in public.task_completions.
--
-- Additive and non-destructive: existing rows become kind = 'task' with the new columns
-- null, which is exactly how one-time tasks behave today.

create type public.task_kind as enum ('task', 'routine');

alter table public.tasks
  add column kind public.task_kind not null default 'task',
  add column repeat_days smallint[],
  add column starts_on date,
  add column ends_on date,
  add column reminder_time time,
  add column paused_on date;

comment on column public.tasks.kind is 'task = one-time task; routine = repeats on repeat_days.';
comment on column public.tasks.repeat_days is 'Routine weekdays, ISO numbering: 1 = Monday … 7 = Sunday.';
comment on column public.tasks.paused_on is 'Local date the routine was paused; null while active.';

-- Keep weekday arrays sorted and unique so the check below and comparisons stay simple.
create or replace function private.normalize_task_routine()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.repeat_days is not null then
    new.repeat_days := (select array_agg(distinct d order by d) from unnest(new.repeat_days) as d);
  end if;
  return new;
end;
$$;

create trigger tasks_normalize_routine
  before insert or update of repeat_days on public.tasks
  for each row execute function private.normalize_task_routine();

alter table public.tasks
  add constraint tasks_kind_fields check (
    (
      kind = 'task'
      and repeat_days is null and starts_on is null and ends_on is null
      and reminder_time is null and paused_on is null
    )
    or
    (
      kind = 'routine'
      and repeat_days is not null
      and cardinality(repeat_days) between 1 and 7
      and repeat_days <@ '{1,2,3,4,5,6,7}'::smallint[]
      and starts_on is not null
      and (ends_on is null or ends_on >= starts_on)
      and due_date is null
      and status <> 'completed'
    )
  ),
  -- Lets task_completions reference (id, user_id) so a completion always belongs to the
  -- routine's owner.
  add constraint tasks_id_user_unique unique (id, user_id);

create index tasks_user_kind_idx on public.tasks (user_id, kind);

-- Clients may set the schedule; kind is fixed at creation (no update grant).
grant insert (kind, repeat_days, starts_on, ends_on, reminder_time) on public.tasks to authenticated;
grant update (repeat_days, starts_on, ends_on, reminder_time, paused_on) on public.tasks to authenticated;

-- ---------------------------------------------------------------------------
-- task_completions: one row per routine per completed date.
-- unique (task_id, occurred_on) makes "mark done" idempotent; deleting the row marks that
-- single date not done, leaving every other date untouched.
-- ---------------------------------------------------------------------------
create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  task_id uuid not null,
  occurred_on date not null,
  completed_at timestamptz not null default now(),
  constraint task_completions_task_fk
    foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  constraint task_completions_user_fk
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint task_completions_unique_date unique (task_id, occurred_on)
);

create index task_completions_user_date_idx on public.task_completions (user_id, occurred_on);

comment on table public.task_completions is 'Completed dates of recurring routines (history).';

-- A completion must be for a routine, on a scheduled date, and not in the future
-- (in the user's own time zone). Runs as the inserting user, so RLS applies to the lookups.
create or replace function private.validate_task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_today date;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if not found or v_task.kind <> 'routine' then
    raise exception 'Only routines can be completed per date' using errcode = '22023';
  end if;

  if new.occurred_on < v_task.starts_on
     or (v_task.ends_on is not null and new.occurred_on > v_task.ends_on)
     or (v_task.paused_on is not null and new.occurred_on >= v_task.paused_on)
     or not (extract(isodow from new.occurred_on)::smallint = any (v_task.repeat_days)) then
    raise exception 'This routine is not scheduled on %', new.occurred_on using errcode = '22023';
  end if;

  select (now() at time zone p.timezone)::date into v_today
  from public.profiles p
  where p.id = new.user_id;

  if new.occurred_on > coalesce(v_today, current_date) then
    raise exception 'Future days cannot be completed yet' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger task_completions_validate
  before insert on public.task_completions
  for each row execute function private.validate_task_completion();

alter table public.task_completions enable row level security;

revoke all on public.task_completions from anon, authenticated;
grant select, delete on public.task_completions to authenticated;
-- user_id comes from its default (auth.uid()); the composite FK ties it to the routine owner.
grant insert (task_id, occurred_on) on public.task_completions to authenticated;
grant all on public.task_completions to service_role;

create policy "task_completions_select_own" on public.task_completions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "task_completions_insert_own" on public.task_completions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "task_completions_delete_own" on public.task_completions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Notifications: add routine reminders (same idempotent generator as before).
-- A routine with a reminder time produces one "due today" notification per scheduled day,
-- once the user's local time has passed the reminder time, unless already completed.
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
    select
      p.id as user_id,
      (now() at time zone p.timezone)::date as today,
      (now() at time zone p.timezone)::time as local_time
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
    where t.kind = 'task'
      and t.status <> 'completed'
      and t.due_date between u.today - 30 and u.today
  ),
  routine_events as (
    select t.user_id, t.id as source_id, t.title, u.today as due_date, t.reminder_time
    from public.tasks t
    join users u on u.user_id = t.user_id
    where t.kind = 'routine'
      and t.reminder_time is not null
      and t.paused_on is null
      and t.starts_on <= u.today
      and (t.ends_on is null or t.ends_on >= u.today)
      and extract(isodow from u.today)::smallint = any (t.repeat_days)
      and u.local_time >= t.reminder_time
      and not exists (
        select 1 from public.task_completions c
        where c.task_id = t.id and c.occurred_on = u.today
      )
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
    union all
    select
      user_id,
      'due_today'::public.notification_kind,
      left('Time for: ' || title, 250),
      'Routine · ' || to_char(date '2000-01-01' + reminder_time, 'FMHH12:MI AM'),
      '/tasks?scope=routines',
      'task',
      source_id,
      due_date,
      'routine:' || source_id::text || ':' || to_char(due_date, 'YYYY-MM-DD') || ':reminder'
    from routine_events
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
