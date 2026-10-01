-- LifeHub data is created when someone confirms their email, not when they sign up.
--
-- Supabase stores every sign-up straight away as a pending auth user ("Waiting for
-- verification" in the dashboard): it holds the password and the confirmation link's token,
-- and it cannot sign in until the link is opened. Until now LifeHub also created a profile for
-- that pending user. From here on the profile is created the moment the email address is
-- confirmed, or at sign-up when the user is already confirmed (created by an admin, or with
-- email confirmation turned off).
--
-- Non-destructive: existing profiles are left untouched and nothing is dropped.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := new.raw_user_meta_data ->> 'timezone';
begin
  -- Pending sign-ups get no LifeHub data until their email is confirmed.
  if new.email_confirmed_at is null then
    return new;
  end if;

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

-- on_auth_user_created (after insert) keeps calling the function above; this trigger covers
-- the moment a pending sign-up opens its confirmation link.
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_new_user();
