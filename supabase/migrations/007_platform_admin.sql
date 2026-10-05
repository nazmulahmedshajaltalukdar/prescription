alter type public.role_t add value if not exists 'platform_owner';

alter table public.profiles
  add column if not exists is_active boolean not null default true;

create table if not exists public.tenants (
  id text primary key,
  name text not null,
  plan_tier text not null default 'starter_5'
    check (plan_tier in ('solo_chamber', 'starter_5', 'starter_10', 'standard_20', 'growth_50', 'enterprise_100')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  modules jsonb not null default '{"inventory": false, "pharmacy": false, "billing": false, "labs": false, "ai": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_locations (
  tenant_id text not null references public.tenants(id) on delete cascade,
  id text not null,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

insert into public.tenants (id, name, plan_tier)
select distinct on (p.tenant_id) p.tenant_id, p.tenant_id, p.plan_tier
from public.profiles p
where p.tenant_id is not null
order by p.tenant_id, p.created_at desc nulls last
on conflict (id) do nothing;

insert into public.clinic_locations (tenant_id, id, name)
select distinct p.tenant_id, p.sub_tenant_id, p.sub_tenant_id
from public.profiles p
where p.tenant_id is not null
  and p.sub_tenant_id is not null
on conflict (tenant_id, id) do nothing;

create or replace function app_private.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'platform_owner'
      and p.is_active
  );
$$;

create or replace function app_private.can_manage_tenant(p_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.tenant_id = p_tenant_id
      and p.role::text in ('tenant_owner', 'tenant_admin')
      and exists (
        select 1 from public.tenants t
        where t.id = p_tenant_id and t.status = 'active'
      )
  );
$$;

create or replace function app_private.can_read_scope(p_tenant_id text, p_sub_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.is_platform_owner() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.tenant_id = p_tenant_id
      and exists (
        select 1 from public.tenants t
        where t.id = p_tenant_id and t.status = 'active'
      )
      and (
        p.role::text in ('tenant_owner', 'tenant_admin')
        or (
          p.sub_tenant_id = p_sub_tenant_id
          and exists (
            select 1 from public.clinic_locations l
            where l.tenant_id = p_tenant_id
              and l.id = p_sub_tenant_id
              and l.is_active
          )
        )
      )
  );
$$;

create or replace function app_private.can_write_scope(p_tenant_id text, p_sub_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.is_platform_owner() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.tenant_id = p_tenant_id
      and exists (
        select 1 from public.tenants t
        where t.id = p_tenant_id and t.status = 'active'
      )
      and p.role::text not in ('pharmacy', 'pharmacist')
      and (
        p.role::text in ('tenant_owner', 'tenant_admin')
        or (
          p.sub_tenant_id = p_sub_tenant_id
          and exists (
            select 1 from public.clinic_locations l
            where l.tenant_id = p_tenant_id
              and l.id = p_sub_tenant_id
              and l.is_active
          )
        )
      )
  );
$$;

alter table public.tenants enable row level security;
alter table public.clinic_locations enable row level security;

drop policy if exists tenants_read_scope on public.tenants;
create policy tenants_read_scope on public.tenants
  for select to authenticated
  using (
    app_private.is_platform_owner()
    or app_private.can_manage_tenant(id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = id
        and p.is_active
        and p.role::text not in ('platform_owner')
    )
  );

drop policy if exists locations_read_scope on public.clinic_locations;
create policy locations_read_scope on public.clinic_locations
  for select to authenticated
  using (app_private.is_platform_owner() or app_private.can_manage_tenant(tenant_id));

grant select on public.tenants, public.clinic_locations to authenticated;
grant all on public.tenants, public.clinic_locations to service_role;
