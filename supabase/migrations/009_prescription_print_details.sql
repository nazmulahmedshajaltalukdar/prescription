alter table public.prescriptions
  add column if not exists print_details jsonb not null default '{}'::jsonb;
