create table if not exists public.medicine_catalog (
  id uuid primary key default gen_random_uuid(),
  catalog_code text not null unique,
  generic_name text not null,
  brand_name text,
  strength text,
  dosage_form text,
  manufacturer text,
  registration_no text,
  search_terms text[] not null default '{}',
  source_name text not null,
  source_url text not null,
  source_license text not null,
  source_revision text not null,
  verified_at date not null,
  is_active boolean not null default true,
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(catalog_code, '') || ' ' || coalesce(generic_name, '') || ' ' ||
      coalesce(brand_name, '') || ' ' || coalesce(strength, '') || ' ' ||
      coalesce(dosage_form, '') || ' ' || coalesce(manufacturer, '') || ' ' ||
      coalesce(registration_no, '') || ' ' || coalesce(array_to_string(search_terms, ' '), '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medicine_catalog_search_idx
  on public.medicine_catalog using gin (search_vector);
create index if not exists medicine_catalog_generic_idx
  on public.medicine_catalog (lower(generic_name), lower(coalesce(strength, '')));

create table if not exists public.clinical_reference_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null check (category in ('chief_complaint', 'disease', 'specialty')),
  label_en text not null,
  label_bn text,
  synonyms text[] not null default '{}',
  classification_system text,
  classification_code text,
  source_name text not null,
  source_url text not null,
  source_license text not null,
  source_revision text not null,
  verified_at date not null,
  is_active boolean not null default true,
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(code, '') || ' ' || coalesce(label_en, '') || ' ' ||
      coalesce(label_bn, '') || ' ' || coalesce(array_to_string(synonyms, ' '), '') || ' ' ||
      coalesce(classification_system, '') || ' ' || coalesce(classification_code, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinical_reference_terms_search_idx
  on public.clinical_reference_terms using gin (search_vector);
create index if not exists clinical_reference_terms_category_idx
  on public.clinical_reference_terms (category, is_active);

create table if not exists public.clinic_prescription_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  sub_tenant_id text not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  medicine_catalog_id uuid references public.medicine_catalog(id) on delete set null,
  generic_name text not null,
  brand_name text,
  strength text,
  dosage_form text,
  dose text,
  frequency text,
  duration text,
  instructions text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visits
  add column if not exists chief_complaint text,
  add column if not exists diagnosis_code text,
  add column if not exists diagnosis_name text,
  add column if not exists diagnosis_system text;

create index if not exists clinic_prescription_templates_scope_idx
  on public.clinic_prescription_templates (tenant_id, sub_tenant_id, lower(title));

alter table public.medicine_catalog enable row level security;
alter table public.clinical_reference_terms enable row level security;
alter table public.clinic_prescription_templates enable row level security;

drop policy if exists medicine_catalog_read_active on public.medicine_catalog;
create policy medicine_catalog_read_active on public.medicine_catalog
  for select to authenticated
  using (
    is_active
    and (app_private.is_platform_owner() or exists (
      select 1 from public.profiles p
      join public.tenants t on t.id = p.tenant_id
      where p.id = auth.uid() and p.is_active and t.status = 'active'
    ))
  );

drop policy if exists clinical_reference_terms_read_active on public.clinical_reference_terms;
create policy clinical_reference_terms_read_active on public.clinical_reference_terms
  for select to authenticated
  using (
    is_active
    and (app_private.is_platform_owner() or exists (
      select 1 from public.profiles p
      join public.tenants t on t.id = p.tenant_id
      where p.id = auth.uid() and p.is_active and t.status = 'active'
    ))
  );

drop policy if exists clinic_prescription_templates_scope_select on public.clinic_prescription_templates;
create policy clinic_prescription_templates_scope_select on public.clinic_prescription_templates
  for select to authenticated
  using (app_private.can_read_scope(tenant_id, sub_tenant_id));
drop policy if exists clinic_prescription_templates_scope_insert on public.clinic_prescription_templates;
create policy clinic_prescription_templates_scope_insert on public.clinic_prescription_templates
  for insert to authenticated
  with check (app_private.can_write_scope(tenant_id, sub_tenant_id) and created_by = auth.uid());
drop policy if exists clinic_prescription_templates_scope_update on public.clinic_prescription_templates;
create policy clinic_prescription_templates_scope_update on public.clinic_prescription_templates
  for update to authenticated
  using (app_private.can_write_scope(tenant_id, sub_tenant_id))
  with check (app_private.can_write_scope(tenant_id, sub_tenant_id));
drop policy if exists clinic_prescription_templates_scope_delete on public.clinic_prescription_templates;
create policy clinic_prescription_templates_scope_delete on public.clinic_prescription_templates
  for delete to authenticated
  using (app_private.can_write_scope(tenant_id, sub_tenant_id));

grant select on public.medicine_catalog, public.clinical_reference_terms to authenticated;
grant select, insert, update, delete on public.clinic_prescription_templates to authenticated;
grant select, insert, update, delete
  on public.medicine_catalog, public.clinical_reference_terms, public.clinic_prescription_templates
  to service_role;
