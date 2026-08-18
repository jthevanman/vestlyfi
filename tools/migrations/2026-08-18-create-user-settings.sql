-- Per-user display preferences that are not specific to any one tracker.
--
-- Purely additive. No existing table is altered and no existing row is touched,
-- so this is safe to run against production with live data.
--
-- WHY THIS EXISTS: currency was hardcoded as a '$' literal inside three
-- separate formatters (net-worth, debt-tracker, account). A user outside the US
-- had no way to make the numbers read correctly. The choice is one setting for
-- the whole account, not per entry, per tracker, or per device.
--
-- WHY A NEW TABLE INSTEAD OF A COLUMN ON debt_settings: debt_settings holds
-- payoff strategy and extra payment, which mean nothing to the net worth
-- tracker. Currency is read by every signed-in page, so it belongs in a table
-- whose name does not imply a single feature. If more account-wide preferences
-- appear (date format, week start), they are columns here.
--
-- WHY NOT A COLUMN ON net_worth_entries: an entry is one dated observation of a
-- balance. Storing currency per row would imply the app can hold mixed
-- currencies and convert between them, which it cannot: there is no FX rate
-- source and no historical rate store, so a chart spanning two years could not
-- be drawn honestly. This column is a DISPLAY preference. Values stay in
-- whatever currency the user entered them in, and switching the setting
-- relabels them rather than converting them. That is correct for the actual
-- case (a non-US user whose money is all in one currency) and is the reason
-- multi-currency holdings are deliberately out of scope.
--
-- UNIQUE ON user_id: one settings row per user. Writes use upsert on that
-- constraint, so there is no read-then-insert race.
--
-- NO CHECK CONSTRAINT ON currency: the allowed set lives in
-- assets/currency.js and will grow. A check constraint here would mean a
-- migration every time a currency is added, and a bad value degrades to the
-- USD fallback in the client rather than corrupting anything.

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- ISO 4217 code. The client maps this to a locale and a symbol.
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.user_settings enable row level security;

create policy "Users can view own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy. Clearing the row would only return the user to the USD
-- default, which the picker already does, so nothing needs to delete it.

create index user_settings_user_idx
  on public.user_settings (user_id);
