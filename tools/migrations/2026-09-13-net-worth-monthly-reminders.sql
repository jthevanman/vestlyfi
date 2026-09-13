-- Monthly net worth reminder emails (supabase/functions/net-worth-reminder).
--
-- Widens the email_subscriptions topic allowlist, adds the snapshot lookup the
-- function uses, and records the Vault secret and pg_cron job that drive it.

alter table public.email_subscriptions
  drop constraint email_subscriptions_topic_check;
alter table public.email_subscriptions
  add constraint email_subscriptions_topic_check
  check (topic in ('quarterly-tax-deadlines', 'net-worth-monthly'));

-- Latest net worth snapshot per user, for the net-worth-reminder function.
-- net_worth_entries holds one row per account line, so a snapshot is every row
-- sharing a user's max(date). date is char(10) YYYY-MM-DD, hence the casts.
-- Pass p_user_ids to re-check specific users right before sending.
create or replace function public.net_worth_latest_snapshots(p_user_ids uuid[] default null)
returns table (user_id uuid, email text, last_date date, net_worth numeric, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select e.user_id, max(e.date::date) as last_date
    from public.net_worth_entries e
    where p_user_ids is null or e.user_id = any (p_user_ids)
    group by e.user_id
  )
  select
    l.user_id,
    lower(u.email)::text,
    l.last_date,
    coalesce(sum(e.value) filter (where e.type = 'asset'), 0)
      - coalesce(sum(e.value) filter (where e.type = 'liability'), 0),
    s.currency
  from latest l
  join public.net_worth_entries e on e.user_id = l.user_id and e.date::date = l.last_date
  left join auth.users u on u.id = l.user_id
  left join public.user_settings s on s.user_id = l.user_id
  group by l.user_id, u.email, l.last_date, s.currency;
$$;

revoke all on function public.net_worth_latest_snapshots(uuid[]) from public, anon, authenticated;
grant execute on function public.net_worth_latest_snapshots(uuid[]) to service_role;

-- Run once, outside migrations (generated in-database, never displayed):
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
--     'net_worth_cron_secret', 'x-cron-secret for net-worth-reminder');
--
--   select cron.schedule('net-worth-reminder-daily', '0 16 * * *', $cmd$
--     select net.http_post(
--       url := 'https://bgbxninvpfhizjalicee.supabase.co/functions/v1/net-worth-reminder',
--       headers := jsonb_build_object('Content-Type', 'application/json',
--         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'net_worth_cron_secret')),
--       body := '{}'::jsonb,
--       timeout_milliseconds := 60000);
--   $cmd$);
