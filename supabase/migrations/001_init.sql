-- supabase/migrations/001_init.sql

-- This migration creates the core schema for the prescription system.
-- Supabase Auth manages users. We create a profiles table linked to auth.users.

create type role_t as enum ('doctor','assistant','pharmacy');

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role role_t not null default 'assistant',
  created_at timestamptz default now()
);

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  hospital_id text,
  name text not null,
  date_of_birth date,
  gender text,
  phone text,
  address text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  clinic_id uuid,
  visit_type text,
  specialty text,
  status text,
  seen_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists drugs (
  id uuid primary key default gen_random_uuid(),
  generic_name text not null,
  brand_name text,
  strength text,
  manufacturer text,
  country text,
  created_at timestamptz default now()
);

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,
  doctor_id uuid references profiles(id),
  items jsonb not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  drug_id uuid references drugs(id) on delete set null,
  location text,
  quantity int default 0,
  low_stock_threshold int default 5,
  last_updated timestamptz default now()
);

create table if not exists queue_tokens (
  id bigserial primary key,
  token text,
  patient_id uuid references patients(id),
  visit_id uuid references visits(id),
  specialty text,
  source text,
  status text,
  created_at timestamptz default now()
);

create table if not exists lab_orders (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,
  tests jsonb,
  status text,
  created_at timestamptz default now()
);

create table if not exists procedures (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,
  type text,
  details jsonb,
  cost numeric(12,2) default 0,
  created_at timestamptz default now()
);

create table if not exists offline_sync_logs (
  id uuid primary key default gen_random_uuid(),
  payload jsonb,
  table_name text,
  op text,
  created_at timestamptz default now()
);

-- indexes
create index if not exists idx_patients_phone on patients (phone);
create index if not exists idx_visits_patient on visits (patient_id);
create index if not exists idx_prescriptions_visit on prescriptions (visit_id);

-- policies will be configured in Supabase UI for fine-grained access

