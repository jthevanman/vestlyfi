-- Edge functions verify their x-cron-secret header against Vault, the same
-- place pg_cron reads it from. One stored value means rotation is a single
-- vault.update_secret call and the caller and checker can never drift.
-- Fails closed: a missing secret, null or empty candidate all return false.
--
-- WHY NOT A FUNCTION ENV SECRET: the cron job already read its header from
-- Vault (quarterly_tax_cron_secret), so an env copy would be a second place to
-- keep in sync, and the value never has to leave the database to be rotated.
--
-- Rotate without the value ever being displayed:
--   select vault.update_secret(id, encode(extensions.gen_random_bytes(32), 'hex'))
--   from vault.secrets where name = '<secret name>';
create or replace function public.cron_secret_matches(secret_name text, candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(candidate, '') <> ''
     and exists (
       select 1 from vault.decrypted_secrets
       where name = secret_name and decrypted_secret = candidate
     );
$$;

revoke all on function public.cron_secret_matches(text, text) from public, anon, authenticated;
grant execute on function public.cron_secret_matches(text, text) to service_role;
