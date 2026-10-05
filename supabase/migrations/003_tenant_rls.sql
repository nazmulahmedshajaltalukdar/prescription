create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create or replace function app_private.can_read_scope(p_tenant_id text, p_sub_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = p_tenant_id
      and (
        p.role::text in ('tenant_owner', 'tenant_admin')
        or p.sub_tenant_id = p_sub_tenant_id
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
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = p_tenant_id
      and p.role::text not in ('pharmacy', 'pharmacist')
      and (
        p.role::text in ('tenant_owner', 'tenant_admin')
        or p.sub_tenant_id = p_sub_tenant_id
      )
  );
$$;

revoke all on function app_private.can_read_scope(text, text) from public;
revoke all on function app_private.can_write_scope(text, text) from public;
grant execute on function app_private.can_read_scope(text, text) to authenticated;
grant execute on function app_private.can_write_scope(text, text) to authenticated;

alter table profiles enable row level security;
drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles
  for select to authenticated
  using (id = auth.uid());

alter table drugs enable row level security;
drop policy if exists drugs_read_authenticated on drugs;
create policy drugs_read_authenticated on drugs
  for select to authenticated
  using (true);

do $$
declare
  table_name text;
  scoped_tables text[] := array[
    'patients', 'visits', 'prescriptions', 'inventory', 'pharmacy_links',
    'queue_tokens', 'lab_orders', 'procedures', 'appointments', 'serial_tickets'
  ];
begin
  foreach table_name in array scoped_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_scope_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_scope_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_scope_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_scope_delete', table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using (app_private.can_read_scope(tenant_id, sub_tenant_id))',
      table_name || '_scope_select', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (app_private.can_write_scope(tenant_id, sub_tenant_id))',
      table_name || '_scope_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (app_private.can_read_scope(tenant_id, sub_tenant_id)) with check (app_private.can_write_scope(tenant_id, sub_tenant_id))',
      table_name || '_scope_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (app_private.can_write_scope(tenant_id, sub_tenant_id))',
      table_name || '_scope_delete', table_name
    );
  end loop;
end;
$$;

-- The project is created with automatic table exposure disabled. Grant only
-- the client privileges required by the authenticated app; RLS remains the
-- row-level boundary for every scoped table.
grant usage on schema public to authenticated;
grant select on public.profiles, public.drugs to authenticated;
grant select, insert, update, delete on
  public.patients,
  public.visits,
  public.prescriptions,
  public.appointments,
  public.serial_tickets
to authenticated;

alter table offline_sync_logs enable row level security;
-- Sync payloads may contain health data; no client role can read or write this log.

alter table serial_counters enable row level security;
-- Counter changes are only allowed through the authenticated atomic RPC.