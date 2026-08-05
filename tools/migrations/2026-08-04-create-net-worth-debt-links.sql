-- Records, per user, what each liability is tied to.
--
-- Purely additive. No existing table is altered and no existing row is touched,
-- so this is safe to run against production with live data.
--
-- WHY THIS EXISTS: net_worth_entries stores "Home = 420000" and "Mortgage =
-- 352000" as two unrelated rows. Nothing connects them, so the allocation chart
-- had to treat the full 420000 as the user's, which overstates a leveraged
-- holding badly. That connection only exists in the user's head, so it has to
-- be asked for and stored. It is never guessed.
--
-- WHY A SEPARATE TABLE INSTEAD OF A COLUMN ON net_worth_entries: an entry is one
-- dated observation. The tie belongs to the category, not to any single dated
-- row. Three of the four write paths on the page (bulk history, Update Numbers,
-- Log New Value) only ever re-log an existing category, so keying the tie to the
-- category name means it is answered once and inherited by every future entry.
--
-- WHY NOT A COLUMN ON net_worth_categories: that table is defined in
-- 2026-07-23-create-net-worth-projection.sql but has not been applied to
-- production and is not referenced by net-worth/index.html. Depending on it
-- would couple this feature to unshipped work. If that migration lands later,
-- these two tables are the obvious consolidation candidate.
--
-- THREE STATES, NOT TWO:
--   tied       user picked an asset. asset_category is set.
--   standalone user said it is not tied to anything. Permanent, never re-ask.
--   skipped    user was asked and moved on. Carries snooze bookkeeping.
-- A liability with NO ROW AT ALL is also unanswered, it just has no snooze
-- history. The chart treats "no row" and "skipped" identically; the review
-- banner does not.
--
-- UNIQUE ON (user_id, liability_category): a liability is tied to at most one
-- asset, while one asset can carry several debts (a mortgage plus a HELOC), so
-- the uniqueness belongs on the liability side.
--
-- NOTE ON TEXT KEYS: category is free text with no foreign key, because in this
-- schema a category name is the only identity an asset has. Reads normalise with
-- trim + lower on both sides, the same way debts.net_worth_category is resolved
-- in debt-tracker/index.html. A link whose target category no longer exists is
-- shown as unassigned rather than silently dropped.

create table public.net_worth_debt_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  liability_category text not null,
  asset_category text,
  state text not null check (state in ('tied', 'standalone', 'skipped')),
  -- Number of times the user dismissed the review banner while this liability
  -- was still unanswered. At 3 we stop asking about it for good.
  dismissed_count int not null default 0,
  snoozed_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, liability_category),
  -- asset_category is set if and only if the state is 'tied'.
  check ((state = 'tied') = (asset_category is not null))
);

alter table public.net_worth_debt_links enable row level security;

create policy "Users can view own debt links"
  on public.net_worth_debt_links for select
  using (auth.uid() = user_id);

create policy "Users can insert own debt links"
  on public.net_worth_debt_links for insert
  with check (auth.uid() = user_id);

create policy "Users can update own debt links"
  on public.net_worth_debt_links for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own debt links"
  on public.net_worth_debt_links for delete
  using (auth.uid() = user_id);

create index net_worth_debt_links_user_idx
  on public.net_worth_debt_links (user_id);
