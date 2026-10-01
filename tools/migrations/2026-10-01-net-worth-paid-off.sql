-- Marks a liability entry as paid off for good.
--
-- Purely additive. Existing rows default to false, so nothing already logged
-- changes meaning. Safe to run against production with live data.
--
-- WHY THIS EXISTS: a balance of 0 means two different things. A credit card at
-- 0 this month can carry a balance again next month, so it should stay in the
-- user's lists and in the monthly update. A loan at 0 is done, and keeping it
-- on screen forever is clutter. The value alone cannot tell them apart.
--
-- WHY PER ENTRY INSTEAD OF A FLAG ON THE CATEGORY: the flag rides on the dated
-- observation that closed the debt. The latest entry decides the state, so
-- logging a new balance under the same name reopens it with no extra write, and
-- the history of when it was paid off is kept.
--
-- WHY NOT ON net_worth_debt_links: that table answers "what is this debt tied
-- to". Overloading its state column would drop the tie when a loan closes, and
-- the tie is still true of the history.

alter table public.net_worth_entries
  add column if not exists paid_off boolean not null default false;
