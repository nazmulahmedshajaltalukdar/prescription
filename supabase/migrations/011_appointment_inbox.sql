create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid() unique,
  tenant_id text not null,
  sub_tenant_id text not null,
  patient_id uuid references public.patients(id) on delete set null,
  patient_name text not null check (length(btrim(patient_name)) between 1 and 120),
  patient_phone text not null check (length(btrim(patient_phone)) between 3 and 40),
  source text not null check (source in ('phone', 'whatsapp', 'facebook', 'website', 'walk_in', 'other')),
  requested_at timestamptz,
  specialty text not null default 'General practice' check (length(btrim(specialty)) between 1 and 120),
  reason text,
  promotion_code text,
  status text not null default 'new' check (status in ('new', 'contacted', 'booked', 'cancelled', 'completed', 'no_show')),
  appointment_id uuid references public.appointments(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointment_requests_scope_status_created_idx
  on public.appointment_requests (tenant_id, sub_tenant_id, status, created_at desc);
create index if not exists appointment_requests_scope_phone_idx
  on public.appointment_requests (tenant_id, patient_phone);

alter table public.appointment_requests enable row level security;

drop policy if exists appointment_requests_scope_select on public.appointment_requests;
create policy appointment_requests_scope_select on public.appointment_requests
  for select to authenticated
  using (app_private.can_read_scope(tenant_id, sub_tenant_id));

drop policy if exists appointment_requests_scope_insert on public.appointment_requests;
create policy appointment_requests_scope_insert on public.appointment_requests
  for insert to authenticated
  with check (
    app_private.can_write_scope(tenant_id, sub_tenant_id)
    and created_by = auth.uid()
  );

drop policy if exists appointment_requests_scope_update on public.appointment_requests;
create policy appointment_requests_scope_update on public.appointment_requests
  for update to authenticated
  using (app_private.can_write_scope(tenant_id, sub_tenant_id))
  with check (app_private.can_write_scope(tenant_id, sub_tenant_id));

drop policy if exists appointment_requests_scope_delete on public.appointment_requests;
create policy appointment_requests_scope_delete on public.appointment_requests
  for delete to authenticated
  using (app_private.can_write_scope(tenant_id, sub_tenant_id));

grant select, insert, update, delete on public.appointment_requests to authenticated;
