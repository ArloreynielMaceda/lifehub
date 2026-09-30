-- OPTIONAL development/demo data. Never run this in production.
--
-- Adds clearly labelled sample records to ONE existing account so you can see the UI with
-- data. Create the account through the app first, then set its email below and run this in
-- the SQL editor of a development project. Everything inserted is prefixed with "[Demo]".
--
-- It runs as the postgres role (bypassing RLS), so it sets user_id explicitly.

do $$
declare
  v_email text := 'demo@example.com';  -- <- change me
  v_uid uuid;
  v_today date;
begin
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    raise exception 'No user with email %. Sign up in the app first.', v_email;
  end if;

  select (now() at time zone timezone)::date into v_today from public.profiles where id = v_uid;

  insert into public.tasks (user_id, title, description, due_date, priority, status, category) values
    (v_uid, '[Demo] Pay tuition balance', 'Registrar closes at 5pm', v_today - 1, 'high', 'pending', 'School'),
    (v_uid, '[Demo] Call the landlord', '', v_today, 'medium', 'in_progress', 'Home'),
    (v_uid, '[Demo] Buy groceries', 'Rice, eggs, vegetables', v_today + 1, 'low', 'pending', 'Errands'),
    (v_uid, '[Demo] Renew gym membership', '', v_today + 6, 'low', 'pending', 'Health');

  insert into public.bills (user_id, kind, title, category, amount_minor, currency, recurrence, anchor_date, next_due_date) values
    (v_uid, 'bill', '[Demo] Electricity', 'Utilities', 285050, 'PHP', 'monthly', v_today + 2, v_today + 2),
    (v_uid, 'bill', '[Demo] Home internet', 'Internet', 169900, 'PHP', 'monthly', v_today + 5, v_today + 5),
    (v_uid, 'reminder', '[Demo] Renew passport', '', null, 'PHP', 'none', v_today + 9, v_today + 9);

  insert into public.transactions (user_id, type, amount_minor, currency, description, category, payment_method, occurred_on) values
    (v_uid, 'income', 4250000, 'PHP', '[Demo] Salary', 'Salary', 'bank_transfer', date_trunc('month', v_today)::date),
    (v_uid, 'expense', 312575, 'PHP', '[Demo] Weekly groceries', 'Groceries', 'cash', v_today - 2),
    (v_uid, 'expense', 4500, 'PHP', '[Demo] Jeepney fare', 'Transport', 'e_wallet', v_today - 1),
    (v_uid, 'expense', 1500000, 'PHP', '[Demo] Rent', 'Housing', 'bank_transfer', date_trunc('month', v_today)::date);

  insert into public.notes (user_id, title, content, pinned) values
    (v_uid, '[Demo] Packing list', E'Passport\nCharger\nUmbrella', true),
    (v_uid, '[Demo] Gift ideas', E'Books for Ana\nPlant for Mama', false);
end $$;
