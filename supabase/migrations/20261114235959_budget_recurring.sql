-- Budget: recurring transactions.
-- A rule posts a transaction on each due date. Fixed amounts post as-is;
-- amounts that change (amount_varies) post as pending, so the existing
-- "N pending to confirm" reminder asks the user for the real amount.

create table public.budget_recurring (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  account_id     uuid,
  category_id    uuid,
  amount         numeric(12, 2) not null check (amount <> 0),
  description    text not null default '' check (length(description) <= 200),
  frequency      text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'yearly')),
  next_date      date not null,
  anchor_day     smallint not null check (anchor_day between 1 and 31),  -- monthly: day of month to aim for
  amount_varies  boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, account_id)
    references public.budget_accounts (user_id, id) on delete set null (account_id),
  foreign key (user_id, category_id)
    references public.budget_categories (user_id, id) on delete set null (category_id)
);
create index budget_recurring_user_due_idx on public.budget_recurring (user_id, next_date) where active;

create trigger budget_recurring_updated_at
  before update on public.budget_recurring
  for each row execute function public.budget_set_updated_at();

alter table public.budget_recurring enable row level security;
create policy "Users manage own budget recurring" on public.budget_recurring
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Which rule a transaction came from (null for one-off entries).
alter table public.budget_transactions add column recurring_id uuid;
alter table public.budget_transactions
  add constraint budget_transactions_recurring_fkey
  foreign key (user_id, recurring_id)
  references public.budget_recurring (user_id, id) on delete set null (recurring_id);

-- Next due date after d for a rule.
create or replace function public.budget_next_date(d date, frequency text, anchor_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case frequency
    when 'weekly'   then d + 7
    when 'biweekly' then d + 14
    when 'yearly'   then (d + interval '1 year')::date
    else (
      -- monthly: the anchor day of next month, or its last day if shorter
      (date_trunc('month', d) + interval '1 month')::date
      + (least(anchor_day,
               extract(day from (date_trunc('month', d) + interval '2 month' - interval '1 day'))::int) - 1)
    )
  end;
$$;

-- Posts every due occurrence for the signed-in user and moves each rule
-- forward. Rows are locked, so two tabs opening at once cannot double-post.
create or replace function public.budget_post_due_recurring()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r   record;
  d   date;
  n   integer := 0;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;

  for r in
    select * from public.budget_recurring
    where user_id = uid and active and next_date <= current_date
    for update
  loop
    d := r.next_date;
    while d <= current_date and n < 500 loop
      insert into public.budget_transactions
        (user_id, account_id, category_id, date, amount, description, pending, recurring_id)
      values
        (uid, r.account_id, r.category_id, d, r.amount, r.description, r.amount_varies, r.id);
      n := n + 1;
      d := public.budget_next_date(d, r.frequency, r.anchor_day);
    end loop;
    update public.budget_recurring set next_date = d where id = r.id;
  end loop;

  return n;
end;
$$;

revoke execute on function public.budget_post_due_recurring() from public, anon;
grant execute on function public.budget_post_due_recurring() to authenticated;
