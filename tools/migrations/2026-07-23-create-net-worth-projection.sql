-- Net worth projection: asset classes + projection assumptions.
--
-- Purely additive. No existing table is altered and no existing row is
-- touched, so this is safe to run against production with live data.
--
-- WHY A CATEGORY TABLE INSTEAD OF A COLUMN ON net_worth_entries:
-- an entry is one dated observation, but the asset class belongs to the
-- category itself. Putting it on the entry row would mean restating the class
-- on all 146 existing rows, carrying it on every future insert, and living
-- with rows of the same category disagreeing about their own class. One row
-- per category per user is the honest shape.
--
-- UNIQUE ON (user_id, type, category), NOT (user_id, category): a name is only
-- unique within a type. Live data already has a user with a "Silverado" asset
-- and a "Silverado" loan, and an "LC500" pair. Keying on the name alone cannot
-- represent them. buildMonthlySnapshots() used to make the same mistake and
-- silently dropped one side of each pair; it now keys on type+category too.

create table public.net_worth_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  type text not null check (type in ('asset', 'liability')),
  asset_class text not null default 'other',
  -- False means the class was keyword-guessed by the backfill and the user has
  -- not looked at it yet. The confirm step only shows unconfirmed rows, and
  -- nothing guessed is ever treated as user-entered data.
  class_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type, category)
);

alter table public.net_worth_categories enable row level security;

create policy "Users can view own net worth categories"
  on public.net_worth_categories for select
  using (auth.uid() = user_id);

create policy "Users can insert own net worth categories"
  on public.net_worth_categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update own net worth categories"
  on public.net_worth_categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own net worth categories"
  on public.net_worth_categories for delete
  using (auth.uid() = user_id);

create index net_worth_categories_user_idx
  on public.net_worth_categories (user_id);


-- One row per user. Holds everything the projection needs that cannot be
-- derived from logged balances.
--
-- monthly_contribution is a FLAT NOMINAL dollar amount. It does not escalate
-- with inflation or raises. If the user enters 2000 it stays 2000 for the
-- whole horizon until they change it. See assets/projection.js.
create table public.net_worth_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  monthly_contribution numeric not null default 0,
  salary numeric not null default 0,
  employer_match_pct numeric not null default 0,
  horizon_years int not null default 10,
  -- Banner state. enabled = user opted in and the chart shows a projection.
  -- dismissed_at = user said no thanks; do not nag again.
  projection_enabled boolean not null default false,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.net_worth_assumptions enable row level security;

create policy "Users can view own projection assumptions"
  on public.net_worth_assumptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own projection assumptions"
  on public.net_worth_assumptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projection assumptions"
  on public.net_worth_assumptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own projection assumptions"
  on public.net_worth_assumptions for delete
  using (auth.uid() = user_id);
