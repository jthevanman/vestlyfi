-- Budget: transfers that count as saving (to savings or investment accounts)
-- are shown under Spent as money saved. Credit card payments are dropped:
-- purchases are logged one by one, so logging the payment double-counts.

alter table public.budget_categories
  add column counts_as_saving boolean not null default false;

update public.budget_categories c
   set counts_as_saving = true
  from public.budget_groups g
 where g.id = c.group_id and g.kind = 'transfer'
   and lower(btrim(c.name)) = 'to savings or investing';

-- Remove the starter "Credit card payment" where nothing uses it.
delete from public.budget_categories c
 using public.budget_groups g
 where g.id = c.group_id and g.kind = 'transfer'
   and lower(btrim(c.name)) = 'credit card payment'
   and not exists (select 1 from public.budget_transactions t where t.category_id = c.id)
   and not exists (select 1 from public.budget_recurring r where r.category_id = c.id);

create or replace function public.seed_budget_defaults()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g   record;
  gid uuid;
  i   integer;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('budget_seed:' || uid::text, 0));

  if exists (select 1 from public.budget_groups where user_id = uid) then
    return false;
  end if;

  for g in
    select * from (values
      (1, 'Income',         'income',   array['Paycheck', 'Other income']),
      (2, 'Housing',        'expense',  array['Rent or mortgage', 'Utilities', 'Internet and phone', 'Home maintenance']),
      (3, 'Food',           'expense',  array['Groceries', 'Dining out']),
      (4, 'Transportation', 'expense',  array['Gas', 'Car payment', 'Car insurance', 'Parking and transit']),
      (5, 'Personal',       'expense',  array['Shopping', 'Subscriptions', 'Entertainment', 'Health', 'Gifts']),
      (6, 'Transfers',      'transfer', array['To savings or investing', 'Between my accounts'])
    ) as t (ord, name, kind, cats)
  loop
    insert into public.budget_groups (user_id, name, kind, sort_order)
    values (uid, g.name, g.kind, g.ord)
    returning id into gid;

    for i in 1 .. array_length(g.cats, 1) loop
      insert into public.budget_categories (user_id, group_id, name, sort_order, counts_as_saving)
      values (uid, gid, g.cats[i], i, g.cats[i] = 'To savings or investing');
    end loop;
  end loop;

  return true;
end;
$$;
