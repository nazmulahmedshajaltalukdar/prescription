alter table public.profiles
  add column if not exists signup_source text not null default 'admin',
  add column if not exists email_verified_at timestamptz;

create or replace function public.provision_public_clinic_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_name text;
  v_tenant_id text;
begin
  if coalesce(new.raw_user_meta_data ->> 'signup_type', '') <> 'clinic_owner_signup' then
    return new;
  end if;

  v_clinic_name := nullif(btrim(new.raw_user_meta_data ->> 'clinic_name'), '');
  if v_clinic_name is null or length(v_clinic_name) > 120 then
    raise exception 'A valid clinic name is required for registration';
  end if;

  v_tenant_id := 'clinic-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.tenants (id, name, plan_tier, status, modules)
  values (
    v_tenant_id,
    v_clinic_name,
    'starter_5',
    'active',
    '{"inventory": true, "pharmacy": false, "billing": false, "labs": false, "ai": false}'::jsonb
  );

  insert into public.clinic_locations (tenant_id, id, name)
  values (v_tenant_id, 'main', 'Main clinic');

  insert into public.profiles (
    id, full_name, role, tenant_id, sub_tenant_id, plan_tier, is_active,
    signup_source, email_verified_at
  )
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'tenant_owner',
    v_tenant_id,
    'main',
    'starter_5',
    new.email_confirmed_at is not null,
    'public_signup',
    new.email_confirmed_at
  );

  return new;
end;
$$;

revoke all on function public.provision_public_clinic_owner() from public, anon, authenticated;

drop trigger if exists provision_public_clinic_owner on auth.users;
create trigger provision_public_clinic_owner
  after insert on auth.users
  for each row execute function public.provision_public_clinic_owner();

create or replace function public.activate_verified_clinic_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles
    set is_active = true,
        email_verified_at = new.email_confirmed_at
    where id = new.id
      and role::text = 'tenant_owner'
      and signup_source = 'public_signup'
      and email_verified_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.activate_verified_clinic_owner() from public, anon, authenticated;

drop trigger if exists activate_verified_clinic_owner on auth.users;
create trigger activate_verified_clinic_owner
  after update of email_confirmed_at on auth.users
  for each row execute function public.activate_verified_clinic_owner();
