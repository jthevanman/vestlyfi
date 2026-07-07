-- Saved calculator results (pilot: compound-interest)
-- One generic table for all calculators: inputs/outputs stored as jsonb so
-- each calculator can restore its own state without a per-calculator schema.

create table public.saved_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calculator text not null,
  label text,
  inputs jsonb not null,
  outputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_results enable row level security;

create policy "Users can view own saved results"
  on public.saved_results for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved results"
  on public.saved_results for insert
  with check (auth.uid() = user_id);

create policy "Users can update own saved results"
  on public.saved_results for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own saved results"
  on public.saved_results for delete
  using (auth.uid() = user_id);

create index saved_results_user_calc_idx
  on public.saved_results (user_id, calculator, created_at desc);
