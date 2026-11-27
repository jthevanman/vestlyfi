-- Budget: a transaction whose amount may still change (a tip, a hold).
-- The user switches it on when adding; it shows a small Pending tag and
-- a "to confirm" reminder until they switch it off.
alter table public.budget_transactions
  add column pending boolean not null default false;

create index budget_transactions_user_pending_idx
  on public.budget_transactions (user_id) where pending;
