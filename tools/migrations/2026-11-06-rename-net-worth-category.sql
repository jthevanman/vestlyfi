-- Renames a net worth account (a category) across every row that names it.
--
-- Purely additive: one new function, no table changes. Safe to run against
-- production with live data.
--
-- WHY A FUNCTION INSTEAD OF CLIENT-SIDE UPDATES: an account's name is a plain
-- string repeated on every dated entry, and the same string is how the debt
-- links (net_worth_debt_links) and the debt tracker (debts.net_worth_category)
-- find it. Renaming from the browser would be three separate writes, and a
-- failure halfway leaves the history under the new name with its ties still
-- pointing at the old one. One transaction keeps them in step.
--
-- WHY SECURITY INVOKER: RLS already scopes every table to auth.uid(). Running
-- as the caller means the function cannot touch another user's rows even if
-- the explicit user_id filters below were wrong.
--
-- WHY RENAMING ONTO AN EXISTING NAME IS REFUSED: two accounts of the same type
-- under one name are read as one account, and on any date both have a value
-- one of them is dropped. That is a merge, and a merge loses data silently.
-- Changing only the case or spacing of the same name is allowed.
--
-- WHY TIES MOVE ONLY WHEN NO ROW IS LEFT UNDER THE OLD NAME: links and debts
-- match names trimmed and lowercased, while entries match exactly. If "401k"
-- and "401K " both exist and only one is renamed, the other still owns the tie.

create or replace function public.rename_net_worth_category(p_type text, p_old text, p_new text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_name text := btrim(coalesce(p_new, ''));
  old_key text := lower(btrim(coalesce(p_old, '')));
  new_key text := lower(btrim(coalesce(p_new, '')));
  moved integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_type not in ('asset', 'liability') then raise exception 'bad_type'; end if;
  if new_name = '' then raise exception 'name_required'; end if;
  if p_old = new_name then return 0; end if;

  if exists (
    select 1 from net_worth_entries
    where user_id = uid and type = p_type
      and lower(btrim(category)) = new_key and category <> p_old
  ) then
    raise exception 'name_taken';
  end if;

  update net_worth_entries
     set category = new_name, updated_at = now()
   where user_id = uid and type = p_type and category = p_old;
  get diagnostics moved = row_count;
  if moved = 0 then raise exception 'not_found'; end if;

  if exists (
    select 1 from net_worth_entries
    where user_id = uid and type = p_type and lower(btrim(category)) = old_key
  ) then
    return moved;
  end if;

  if p_type = 'liability' then
    if new_key <> old_key then
      -- A tie row can outlive its entries. Nothing is logged under the new name
      -- (checked above), so a leftover row for it is stale and would block the move.
      delete from net_worth_debt_links
       where user_id = uid and lower(btrim(liability_category)) = new_key;
    end if;
    update net_worth_debt_links
       set liability_category = new_name, updated_at = now()
     where user_id = uid and lower(btrim(liability_category)) = old_key;
    update debts
       set net_worth_category = new_name, updated_at = now()
     where user_id = uid and lower(btrim(net_worth_category)) = old_key;
  else
    update net_worth_debt_links
       set asset_category = new_name, updated_at = now()
     where user_id = uid and lower(btrim(asset_category)) = old_key;
  end if;

  return moved;
end;
$$;

revoke all on function public.rename_net_worth_category(text, text, text) from public, anon;
grant execute on function public.rename_net_worth_category(text, text, text) to authenticated;
