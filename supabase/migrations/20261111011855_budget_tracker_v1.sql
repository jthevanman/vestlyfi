-- Budget tracker v1: manual entries only.
--
-- These tables are fully independent of the net worth tables
-- (net_worth_entries, net_worth_debt_links) and the debt tracker (debts).
-- Nothing here references them and nothing there references these.
-- The two products meet only on the dashboard, by calendar month.
--
-- CSV import (budget_imports, budget_rules, bank_description, fingerprint)
-- is a later migration; nothing in v1 needs to change for it.

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every update.
-- ---------------------------------------------------------------------------
create or replace function public.budget_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts: where money moves (Chase card, checking, cash).
-- Not linked to net worth items, by design.
-- ---------------------------------------------------------------------------
create table public.budget_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (btrim(name) <> '' and length(name) <= 80),
  kind        text not null default 'other'
              check (kind in ('checking', 'savings', 'credit_card', 'cash', 'other')),
  archived    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Lets child tables require that a row belongs to the same user.
  unique (user_id, id)
);
create unique index budget_accounts_user_name_key
  on public.budget_accounts (user_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Groups: Income, Housing, Food, Transfers...
-- kind decides how the dashboard counts the money:
--   income   -> counts toward income
--   expense  -> counts toward spending
--   transfer -> counts toward neither (card payments, moving to savings)
-- ---------------------------------------------------------------------------
create table public.budget_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (btrim(name) <> '' and length(name) <= 60),
  kind        text not null check (kind in ('income', 'expense', 'transfer')),
  hidden      boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, id)
);
create unique index budget_groups_user_name_key
  on public.budget_groups (user_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Categories: Groceries, Dining out, Paycheck...
-- monthly_target is null unless the user sets one.
-- ---------------------------------------------------------------------------
create table public.budget_categories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  group_id        uuid not null,
  name            text not null check (btrim(name) <> '' and length(name) <= 60),
  monthly_target  numeric(12, 2) check (monthly_target is null or monthly_target >= 0),
  hidden          boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, id),
  -- The group must belong to the same user.
  foreign key (user_id, group_id)
    references public.budget_groups (user_id, id) on delete cascade
);
create unique index budget_categories_user_name_key
  on public.budget_categories (user_id, lower(btrim(name)));
create index budget_categories_group_idx
  on public.budget_categories (user_id, group_id);

-- ---------------------------------------------------------------------------
-- Transactions.
-- amount: negative = money out, positive = money in. Never zero.
-- origin: how the row was created. Set once; cannot change (see trigger).
-- ---------------------------------------------------------------------------
create table public.budget_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  account_id   uuid,
  category_id  uuid,
  date         date not null,
  amount       numeric(12, 2) not null check (amount <> 0),
  description  text not null default '' check (length(description) <= 200),
  note         text check (note is null or length(note) <= 500),
  origin       text not null default 'manual' check (origin in ('manual', 'csv')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Account and category must belong to the same user.
  -- Accounts are archived, not deleted, once they have transactions.
  -- NO ACTION (not RESTRICT) is checked at the end of the statement, so
  -- deleting a whole user still cascades through accounts and transactions.
  foreign key (user_id, account_id)
    references public.budget_accounts (user_id, id) on delete no action,
  -- Deleting a category leaves its transactions uncategorized.
  foreign key (user_id, category_id)
    references public.budget_categories (user_id, id) on delete set null (category_id)
);
create index budget_transactions_user_date_idx
  on public.budget_transactions (user_id, date desc);
create index budget_transactions_user_category_idx
  on public.budget_transactions (user_id, category_id);
create index budget_transactions_user_account_idx
  on public.budget_transactions (user_id, account_id);

create or replace function public.budget_transactions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.origin is distinct from old.origin then
    raise exception 'origin_is_permanent';
  end if;
  return new;
end;
$$;

create trigger budget_transactions_guard
  before update on public.budget_transactions
  for each row execute function public.budget_transactions_guard();

create trigger budget_accounts_updated_at
  before update on public.budget_accounts
  for each row execute function public.budget_set_updated_at();
create trigger budget_groups_updated_at
  before update on public.budget_groups
  for each row execute function public.budget_set_updated_at();
create trigger budget_categories_updated_at
  before update on public.budget_categories
  for each row execute function public.budget_set_updated_at();
create trigger budget_transactions_updated_at
  before update on public.budget_transactions
  for each row execute function public.budget_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: users only see and change their own rows.
-- ---------------------------------------------------------------------------
alter table public.budget_accounts     enable row level security;
alter table public.budget_groups       enable row level security;
alter table public.budget_categories   enable row level security;
alter table public.budget_transactions enable row level security;

create policy "Users manage own budget accounts" on public.budget_accounts
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own budget groups" on public.budget_groups
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own budget categories" on public.budget_categories
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own budget transactions" on public.budget_transactions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Starter categories. The budget page calls this when it opens.
-- Creates the list only for a user with no groups yet; otherwise does nothing.
-- Returns true if it created the list. Runs as the caller, so RLS applies.
-- ---------------------------------------------------------------------------
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

  -- Two tabs opening the budget page at once must not seed twice.
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
      (6, 'Transfers',      'transfer', array['Credit card payment', 'To savings or investing', 'Between my accounts'])
    ) as t (ord, name, kind, cats)
  loop
    insert into public.budget_groups (user_id, name, kind, sort_order)
    values (uid, g.name, g.kind, g.ord)
    returning id into gid;

    for i in 1 .. array_length(g.cats, 1) loop
      insert into public.budget_categories (user_id, group_id, name, sort_order)
      values (uid, gid, g.cats[i], i);
    end loop;
  end loop;

  return true;
end;
$$;

revoke execute on function public.seed_budget_defaults() from public, anon;
grant execute on function public.seed_budget_defaults() to authenticated;
