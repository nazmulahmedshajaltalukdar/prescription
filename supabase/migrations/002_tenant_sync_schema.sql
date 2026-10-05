-- Tenant-scoped, idempotent sync identifiers and internal scheduling tables.

alter type role_t add value if not exists 'tenant_owner';
alter type role_t add value if not exists 'tenant_admin';
alter type role_t add value if not exists 'doctor';
alter type role_t add value if not exists 'pharmacist';
alter type role_t add value if not exists 'nurse';
alter type role_t add value if not exists 'receptionist';

alter table profiles
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo',
  add column if not exists plan_tier text not null default 'starter_5';

alter table patients
  add column if not exists client_id uuid default gen_random_uuid(),
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo',
  add column if not exists created_by uuid references profiles(id);

alter table visits
  add column if not exists client_id uuid default gen_random_uuid(),
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo';

alter table prescriptions
  add column if not exists client_id uuid default gen_random_uuid(),
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo';

create table if not exists pharmacy_links (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  doctor_id uuid references profiles(id),
  clinic_id uuid,
  pharmacy_id uuid,
  status text not null default 'pending' check (status in ('pending', 'dispensed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table inventory
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo';

alter table pharmacy_links
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo';

alter table queue_tokens
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo';

alter table lab_orders
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo';

alter table procedures
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo';

alter table offline_sync_logs
  add column if not exists tenant_id text not null default 'tenant-demo',
  add column if not exists sub_tenant_id text not null default 'clinic-demo';

update patients set client_id = gen_random_uuid() where client_id is null;
update visits set client_id = gen_random_uuid() where client_id is null;
update prescriptions set client_id = gen_random_uuid() where client_id is null;

alter table patients alter column client_id set not null;
alter table visits alter column client_id set not null;
alter table prescriptions alter column client_id set not null;

create unique index if not exists patients_client_id_uq on patients(client_id);
create unique index if not exists visits_client_id_uq on visits(client_id);
create unique index if not exists prescriptions_client_id_uq on prescriptions(client_id);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid() unique,
  tenant_id text not null,
  sub_tenant_id text not null,
  patient_id uuid not null references patients(id) on delete restrict,
  patient_name text not null,
  start_at timestamptz not null,
  duration_minutes integer not null default 20 check (duration_minutes between 5 and 480),
  specialty text not null,
  reason text,
  status text not null default 'scheduled' check (status in ('scheduled', 'checked_in', 'in_consult', 'completed', 'cancelled')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists serial_counters (
  tenant_id text not null,
  sub_tenant_id text not null,
  service_date date not null,
  last_number integer not null default 0 check (last_number >= 0),
  primary key (tenant_id, sub_tenant_id, service_date)
);

create table if not exists serial_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  tenant_id text not null,
  sub_tenant_id text not null,
  patient_id uuid not null references patients(id) on delete restrict,
  patient_name text not null,
  appointment_id uuid references appointments(id) on delete set null,
  date_key date not null,
  serial_number integer not null,
  display_code text not null,
  status text not null default 'waiting' check (status in ('waiting', 'in_consult', 'completed', 'cancelled')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, sub_tenant_id, date_key, serial_number),
  unique (appointment_id)
);

create index if not exists appointments_scope_start_idx on appointments(tenant_id, sub_tenant_id, start_at);
create index if not exists serial_tickets_scope_day_idx on serial_tickets(tenant_id, sub_tenant_id, date_key, serial_number);
create index if not exists patients_scope_name_idx on patients(tenant_id, sub_tenant_id, name);