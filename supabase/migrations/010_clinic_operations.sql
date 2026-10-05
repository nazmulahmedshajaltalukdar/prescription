alter table public.inventory
  add column if not exists name text not null default '',
  add column if not exists sku text,
  add column if not exists batch text,
  add column if not exists unit text not null default 'unit',
  add column if not exists supplier text,
  add column if not exists updated_by uuid references public.profiles(id);

update public.inventory i
set name = coalesce(nullif(i.name, ''), nullif(d.brand_name, ''), nullif(d.generic_name, ''), 'Medicine')
from public.drugs d
where i.drug_id = d.id;
update public.inventory set name = 'Medicine' where name = '';

create unique index if not exists inventory_scope_sku_uq
  on public.inventory (tenant_id, sub_tenant_id, sku)
  where sku is not null and sku <> '';

alter table public.pharmacy_links
  add column if not exists items jsonb not null default '[]'::jsonb;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  tenant_id text not null,
  sub_tenant_id text not null,
  delta integer not null check (delta <> 0),
  reason text not null,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_scope_created_idx
  on public.inventory_movements (tenant_id, sub_tenant_id, created_at desc);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  tenant_id text not null,
  sub_tenant_id text not null,
  invoice_no text not null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  visit_id uuid references public.visits(id) on delete set null,
  description text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0 and total = subtotal - discount),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total),
  currency text not null default 'BDT' check (currency = 'BDT'),
  status text not null default 'unpaid' check (status in ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sub_tenant_id, invoice_no),
  unique (tenant_id, sub_tenant_id, client_id)
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  tenant_id text not null,
  sub_tenant_id text not null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash', 'card', 'mobile_money', 'bank_transfer', 'other')),
  reference text,
  received_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, sub_tenant_id, client_id)
);

create index if not exists billing_invoices_scope_created_idx
  on public.billing_invoices (tenant_id, sub_tenant_id, created_at desc);
create index if not exists invoice_payments_invoice_created_idx
  on public.invoice_payments (invoice_id, created_at desc);

create or replace function app_private.validate_billing_invoice()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_line jsonb;
  v_items_total numeric(12,2) := 0;
begin
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then
    raise exception 'Invoice requires at least one line item' using errcode = '22023';
  end if;
  for v_line in select value from jsonb_array_elements(new.items)
  loop
    if coalesce(btrim(v_line ->> 'description'), '') = ''
       or coalesce(v_line ->> 'quantity', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_line ->> 'unit_price', '') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      raise exception 'Invoice line has an invalid description, quantity, or price' using errcode = '22023';
    end if;
    v_items_total := v_items_total
      + (v_line ->> 'quantity')::integer * (v_line ->> 'unit_price')::numeric;
  end loop;
  if round(v_items_total, 2) <> new.subtotal then
    raise exception 'Invoice subtotal does not match its line items' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_billing_invoice on public.billing_invoices;
create trigger validate_billing_invoice
  before insert on public.billing_invoices
  for each row execute function app_private.validate_billing_invoice();

alter table public.lab_orders
  add column if not exists client_id uuid,
  add column if not exists patient_id uuid references public.patients(id) on delete restrict,
  add column if not exists test_name text,
  add column if not exists notes text,
  add column if not exists result_text text,
  add column if not exists ordered_by uuid references public.profiles(id),
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists updated_at timestamptz not null default now();

update public.lab_orders set client_id = gen_random_uuid() where client_id is null;
alter table public.lab_orders alter column client_id set not null;
create unique index if not exists lab_orders_scope_client_id_uq
  on public.lab_orders (tenant_id, sub_tenant_id, client_id);

create index if not exists lab_orders_scope_created_idx
  on public.lab_orders (tenant_id, sub_tenant_id, created_at desc);

create or replace function app_private.validate_lab_order()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.ordered_by := auth.uid();
    end if;
    new.updated_by := auth.uid();
  end if;
  new.updated_at := now();
  if new.status not in ('requested', 'processing', 'completed', 'cancelled') then
    raise exception 'Invalid laboratory order status' using errcode = '22023';
  end if;
  if new.test_name is null or btrim(new.test_name) = '' or length(new.test_name) > 160 then
    raise exception 'Lab test name must be between 1 and 160 characters' using errcode = '22023';
  end if;
  if new.notes is not null and length(new.notes) > 1000 then
    raise exception 'Lab notes must be 1000 characters or fewer' using errcode = '22023';
  end if;
  if new.status = 'completed' and coalesce(btrim(new.result_text), '') = '' then
    raise exception 'Enter the lab result before marking an order complete' using errcode = '22023';
  end if;
  if new.result_text is not null and length(new.result_text) > 5000 then
    raise exception 'Lab result must be 5000 characters or fewer' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_lab_order on public.lab_orders;
create trigger validate_lab_order
  before insert or update on public.lab_orders
  for each row execute function app_private.validate_lab_order();

create or replace function app_private.can_use_clinic_module(
  p_tenant_id text,
  p_sub_tenant_id text,
  p_module text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.tenants t on t.id = p_tenant_id
    join public.clinic_locations l
      on l.tenant_id = p_tenant_id and l.id = p_sub_tenant_id
    where p.id = auth.uid()
      and p.is_active
      and p.tenant_id = p_tenant_id
      and t.status = 'active'
      and l.is_active
      and t.modules ->> p_module = 'true'
      and (p.role::text in ('tenant_owner', 'tenant_admin') or p.sub_tenant_id = p_sub_tenant_id)
  );
$$;

revoke all on function app_private.can_use_clinic_module(text, text, text) from public;
grant execute on function app_private.can_use_clinic_module(text, text, text) to authenticated;

alter table public.inventory_movements enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.invoice_payments enable row level security;

drop policy if exists inventory_movements_scope_select on public.inventory_movements;
create policy inventory_movements_scope_select on public.inventory_movements
  for select to authenticated
  using (
    app_private.can_read_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'inventory')
  );

drop policy if exists inventory_scope_select on public.inventory;
create policy inventory_scope_select on public.inventory
  for select to authenticated
  using (
    app_private.can_read_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'inventory')
  );

drop policy if exists pharmacy_links_scope_select on public.pharmacy_links;
create policy pharmacy_links_scope_select on public.pharmacy_links
  for select to authenticated
  using (
    app_private.can_read_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'inventory')
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'pharmacy')
  );

drop policy if exists billing_invoices_scope_select on public.billing_invoices;
create policy billing_invoices_scope_select on public.billing_invoices
  for select to authenticated
  using (
    app_private.can_read_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'billing')
  );
drop policy if exists billing_invoices_scope_insert on public.billing_invoices;
create policy billing_invoices_scope_insert on public.billing_invoices
  for insert to authenticated
  with check (
    app_private.can_write_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'billing')
    and exists (
      select 1 from public.patients p
      where p.id = billing_invoices.patient_id
        and p.tenant_id = billing_invoices.tenant_id
        and p.sub_tenant_id = billing_invoices.sub_tenant_id
    )
    and billing_invoices.status = 'unpaid'
    and billing_invoices.paid_amount = 0
    and (
      billing_invoices.visit_id is null
      or exists (
        select 1 from public.visits v
        where v.id = billing_invoices.visit_id
          and v.tenant_id = billing_invoices.tenant_id
          and v.sub_tenant_id = billing_invoices.sub_tenant_id
      )
    )
  );
drop policy if exists billing_invoices_scope_update on public.billing_invoices;

drop policy if exists invoice_payments_scope_select on public.invoice_payments;
create policy invoice_payments_scope_select on public.invoice_payments
  for select to authenticated
  using (
    app_private.can_read_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'billing')
  );

drop policy if exists lab_orders_scope_select on public.lab_orders;
create policy lab_orders_scope_select on public.lab_orders
  for select to authenticated
  using (
    app_private.can_read_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'labs')
  );
drop policy if exists lab_orders_scope_insert on public.lab_orders;
create policy lab_orders_scope_insert on public.lab_orders
  for insert to authenticated
  with check (
    app_private.can_write_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'labs')
    and (
      lab_orders.patient_id is null
      or exists (
        select 1 from public.patients p
        where p.id = lab_orders.patient_id
          and p.tenant_id = lab_orders.tenant_id
          and p.sub_tenant_id = lab_orders.sub_tenant_id
      )
    )
    and (
      lab_orders.visit_id is null
      or exists (
        select 1 from public.visits v
        where v.id = lab_orders.visit_id
          and v.tenant_id = lab_orders.tenant_id
          and v.sub_tenant_id = lab_orders.sub_tenant_id
      )
    )
  );
drop policy if exists lab_orders_scope_update on public.lab_orders;
create policy lab_orders_scope_update on public.lab_orders
  for update to authenticated
  using (app_private.can_read_scope(tenant_id, sub_tenant_id))
  with check (
    app_private.can_write_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'labs')
    and (
      lab_orders.patient_id is null
      or exists (
        select 1 from public.patients p
        where p.id = lab_orders.patient_id
          and p.tenant_id = lab_orders.tenant_id
          and p.sub_tenant_id = lab_orders.sub_tenant_id
      )
    )
    and (
      lab_orders.visit_id is null
      or exists (
        select 1 from public.visits v
        where v.id = lab_orders.visit_id
          and v.tenant_id = lab_orders.tenant_id
          and v.sub_tenant_id = lab_orders.sub_tenant_id
      )
    )
  );
drop policy if exists lab_orders_scope_delete on public.lab_orders;

grant select, insert on public.inventory to authenticated;
grant select on public.pharmacy_links, public.inventory_movements to authenticated;
grant select, insert on public.billing_invoices to authenticated;
grant select on public.invoice_payments to authenticated;
grant select, insert, update on public.lab_orders to authenticated;
grant all on public.inventory_movements, public.billing_invoices, public.invoice_payments to service_role;

drop policy if exists inventory_scope_insert on public.inventory;
create policy inventory_scope_insert on public.inventory
  for insert to authenticated
  with check (
    app_private.can_write_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'inventory')
  );
drop policy if exists inventory_scope_update on public.inventory;
create policy inventory_scope_update on public.inventory
  for update to authenticated
  using (app_private.can_read_scope(tenant_id, sub_tenant_id))
  with check (
    app_private.can_write_scope(tenant_id, sub_tenant_id)
    and app_private.can_use_clinic_module(tenant_id, sub_tenant_id, 'inventory')
  );

create or replace function public.adjust_inventory_stock(
  p_inventory_id uuid,
  p_delta integer,
  p_reason text default 'manual adjustment'
)
returns public.inventory
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_item public.inventory%rowtype;
begin
  if p_inventory_id is null or p_delta is null or p_delta = 0 then
    raise exception 'Inventory item and non-zero stock adjustment are required' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found or not v_profile.is_active then
    raise exception 'An active clinic profile is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.tenants t
    join public.clinic_locations l on l.tenant_id = t.id
    where t.id = v_profile.tenant_id and t.status = 'active'
      and t.modules ->> 'inventory' = 'true'
      and l.id = v_profile.sub_tenant_id and l.is_active
  ) then
    raise exception 'Inventory module is not enabled for this clinic' using errcode = '42501';
  end if;

  select * into v_item from public.inventory
  where id = p_inventory_id
    and tenant_id = v_profile.tenant_id
    and sub_tenant_id = v_profile.sub_tenant_id
  for update;
  if not found then
    raise exception 'Inventory item is not available in this clinic location' using errcode = 'P0002';
  end if;

  if not app_private.can_write_scope(v_item.tenant_id, v_item.sub_tenant_id)
     and v_profile.role::text <> 'pharmacist' then
    raise exception 'Not authorized to adjust stock in this clinic' using errcode = '42501';
  end if;
  update public.inventory
  set quantity = quantity + p_delta,
      last_updated = now(),
      updated_by = auth.uid()
  where id = p_inventory_id
    and quantity + p_delta >= 0
  returning * into v_item;
  if not found then
    raise exception 'Stock adjustment would make quantity negative' using errcode = '22003';
  end if;

  insert into public.inventory_movements (
    inventory_id, tenant_id, sub_tenant_id, delta, reason, created_by
  ) values (
    v_item.id, v_item.tenant_id, v_item.sub_tenant_id, p_delta,
    coalesce(nullif(btrim(p_reason), ''), 'manual adjustment'), auth.uid()
  );
  return v_item;
end;
$$;

create or replace function public.dispense_prescription_inventory(
  p_prescription_id uuid,
  p_items jsonb
)
returns public.pharmacy_links
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_prescription public.prescriptions%rowtype;
  v_link public.pharmacy_links%rowtype;
  v_line record;
  v_item public.inventory%rowtype;
  v_has_link boolean := false;
begin
  if p_prescription_id is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Prescription and at least one dispense line are required' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as line
    where jsonb_typeof(line) <> 'object'
      or coalesce(line ->> 'inventory_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(line ->> 'quantity', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Each dispense line requires an inventory item UUID and positive whole-number quantity' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found or not v_profile.is_active then
    raise exception 'An active clinic profile is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.tenants t
    join public.clinic_locations l on l.tenant_id = t.id
    where t.id = v_profile.tenant_id and t.status = 'active'
      and t.modules ->> 'inventory' = 'true'
      and t.modules ->> 'pharmacy' = 'true'
      and l.id = v_profile.sub_tenant_id and l.is_active
  ) then
    raise exception 'Inventory and pharmacy modules must be enabled for this clinic' using errcode = '42501';
  end if;

  if not app_private.can_write_scope(v_profile.tenant_id, v_profile.sub_tenant_id)
     and v_profile.role::text <> 'pharmacist' then
    raise exception 'Not authorized to dispense for this clinic' using errcode = '42501';
  end if;
  select * into v_prescription from public.prescriptions
  where id = p_prescription_id
    and tenant_id = v_profile.tenant_id
    and sub_tenant_id = v_profile.sub_tenant_id;
  if not found then
    raise exception 'Prescription is not available in this clinic location' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dispense:' || p_prescription_id::text, 0));
  select * into v_link from public.pharmacy_links
  where prescription_id = p_prescription_id
    and tenant_id = v_profile.tenant_id
    and sub_tenant_id = v_profile.sub_tenant_id
  order by created_at desc
  limit 1
  for update;
  v_has_link := found;
  if found and v_link.status = 'dispensed' then
    return v_link;
  end if;

  for v_line in
    select (line ->> 'inventory_id')::uuid as inventory_id,
           sum((line ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as line
    where line ->> 'inventory_id' is not null
      and coalesce(line ->> 'quantity', '') ~ '^[1-9][0-9]*$'
    group by (line ->> 'inventory_id')::uuid
    order by (line ->> 'inventory_id')::uuid
  loop
    select * into v_item from public.inventory
    where id = v_line.inventory_id
      and tenant_id = v_profile.tenant_id
      and sub_tenant_id = v_profile.sub_tenant_id
    for update;
    if not found then
      raise exception 'Inventory item % is not available in this clinic', v_line.inventory_id using errcode = 'P0002';
    end if;
    update public.inventory
    set quantity = quantity - v_line.quantity,
        last_updated = now(),
        updated_by = auth.uid()
    where id = v_item.id and quantity >= v_line.quantity;
    if not found then
      raise exception 'Insufficient stock for %', v_item.name using errcode = '22003';
    end if;
    insert into public.inventory_movements (
      inventory_id, tenant_id, sub_tenant_id, delta, reason, reference_id, created_by
    ) values (
      v_item.id, v_profile.tenant_id, v_profile.sub_tenant_id, -v_line.quantity,
      'prescription dispense', p_prescription_id, auth.uid()
    );
  end loop;

  if v_has_link then
    update public.pharmacy_links
    set status = 'dispensed', items = p_items
    where id = v_link.id returning * into v_link;
  else
    insert into public.pharmacy_links (
      prescription_id, doctor_id, tenant_id, sub_tenant_id, pharmacy_id, status, items
    ) values (
      p_prescription_id, v_prescription.doctor_id, v_profile.tenant_id,
      v_profile.sub_tenant_id, auth.uid(), 'dispensed', p_items
    ) returning * into v_link;
  end if;
  return v_link;
end;
$$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_client_id uuid default gen_random_uuid()
)
returns public.billing_invoices
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_invoice public.billing_invoices%rowtype;
begin
  if p_invoice_id is null or p_client_id is null or p_amount is null or p_amount <= 0
     or p_amount <> round(p_amount, 2)
     or p_method is null
     or p_method not in ('cash', 'card', 'mobile_money', 'bank_transfer', 'other') then
    raise exception 'Invoice, positive amount, and valid payment method are required' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found or not v_profile.is_active
     or not app_private.can_write_scope(v_profile.tenant_id, v_profile.sub_tenant_id) then
    raise exception 'An authorized active clinic profile is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clinic_locations l
    where l.tenant_id = v_profile.tenant_id
      and l.id = v_profile.sub_tenant_id
      and l.is_active
  ) then
    raise exception 'Clinic location is inactive' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.tenants t
    where t.id = v_profile.tenant_id and t.status = 'active'
      and t.modules ->> 'billing' = 'true'
  ) then
    raise exception 'Billing module is not enabled for this clinic' using errcode = '42501';
  end if;

  select * into v_invoice from public.billing_invoices
  where id = p_invoice_id
    and tenant_id = v_profile.tenant_id
    and sub_tenant_id = v_profile.sub_tenant_id
  for update;
  if not found then
    raise exception 'Invoice is not available in this clinic location' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.invoice_payments
    where tenant_id = v_invoice.tenant_id
      and sub_tenant_id = v_invoice.sub_tenant_id
      and client_id = p_client_id
  ) then
    if not exists (
      select 1 from public.invoice_payments
      where tenant_id = v_invoice.tenant_id
        and sub_tenant_id = v_invoice.sub_tenant_id
        and client_id = p_client_id
        and invoice_id = v_invoice.id
        and amount = p_amount
        and method = p_method
    ) then
      raise exception 'Payment request ID was already used for a different payment' using errcode = '22023';
    end if;
    return v_invoice;
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'Cannot record payment against a cancelled invoice' using errcode = '22023';
  end if;
  if v_invoice.paid_amount + p_amount > v_invoice.total then
    raise exception 'Payment exceeds the invoice balance' using errcode = '22003';
  end if;

  insert into public.invoice_payments (
    client_id, invoice_id, tenant_id, sub_tenant_id, amount, method, reference, received_by
  ) values (
    p_client_id, v_invoice.id, v_invoice.tenant_id, v_invoice.sub_tenant_id, p_amount,
    p_method, nullif(btrim(p_reference), ''), auth.uid()
  );

  update public.billing_invoices
  set paid_amount = paid_amount + p_amount,
      status = case when paid_amount + p_amount = total then 'paid' else 'partially_paid' end,
      updated_at = now()
  where id = v_invoice.id
  returning * into v_invoice;
  return v_invoice;
end;
$$;

revoke all on function public.adjust_inventory_stock(uuid, integer, text) from public, anon;
revoke all on function public.dispense_prescription_inventory(uuid, jsonb) from public, anon;
revoke all on function public.record_invoice_payment(uuid, numeric, text, text, uuid) from public, anon;
grant execute on function public.adjust_inventory_stock(uuid, integer, text) to authenticated;
grant execute on function public.dispense_prescription_inventory(uuid, jsonb) to authenticated;
grant execute on function public.record_invoice_payment(uuid, numeric, text, text, uuid) to authenticated;
