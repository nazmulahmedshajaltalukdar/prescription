update public.profiles
set role = 'receptionist'
where role::text = 'assistant';

alter table public.profiles
  alter column role set default 'receptionist',
  alter column tenant_id drop default,
  alter column sub_tenant_id drop default;

create or replace function public.issue_serial_ticket(
  p_client_id uuid,
  p_patient_client_id uuid,
  p_appointment_client_id uuid,
  p_service_date date
)
returns public.serial_tickets
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_patient public.patients%rowtype;
  v_appointment public.appointments%rowtype;
  v_ticket public.serial_tickets%rowtype;
  v_serial_number integer;
  v_client_lock bigint;
  v_appointment_lock bigint;
begin
  if p_client_id is null or p_patient_client_id is null or p_service_date is null then
    raise exception 'Client, patient, and service date are required' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception 'A clinic profile is required to issue serials' using errcode = '42501';
  end if;

  if not app_private.can_write_scope(v_profile.tenant_id, v_profile.sub_tenant_id) then
    raise exception 'Not authorized to issue serials for this clinic' using errcode = '42501';
  end if;

  select * into v_patient
  from public.patients
  where client_id = p_patient_client_id
    and tenant_id = v_profile.tenant_id
    and sub_tenant_id = v_profile.sub_tenant_id;

  if not found then
    raise exception 'Patient is not available in the active clinic' using errcode = 'P0002';
  end if;

  if p_appointment_client_id is not null then
    select * into v_appointment
    from public.appointments
    where client_id = p_appointment_client_id
      and patient_id = v_patient.id
      and tenant_id = v_profile.tenant_id
      and sub_tenant_id = v_profile.sub_tenant_id;

    if not found then
      raise exception 'Appointment is not available in the active clinic' using errcode = 'P0002';
    end if;

    v_client_lock := hashtextextended('serial-client:' || p_client_id::text, 0);
    v_appointment_lock := hashtextextended('serial-appointment:' || p_appointment_client_id::text, 0);
    if v_client_lock <= v_appointment_lock then
      perform pg_advisory_xact_lock(v_client_lock);
      if v_client_lock <> v_appointment_lock then
        perform pg_advisory_xact_lock(v_appointment_lock);
      end if;
    else
      perform pg_advisory_xact_lock(v_appointment_lock);
      perform pg_advisory_xact_lock(v_client_lock);
    end if;

    select * into v_ticket
    from public.serial_tickets
    where appointment_id = v_appointment.id
      and tenant_id = v_profile.tenant_id
      and sub_tenant_id = v_profile.sub_tenant_id;

    if found then
      return v_ticket;
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('serial-client:' || p_client_id::text, 0));
  end if;

  select * into v_ticket
  from public.serial_tickets
  where client_id = p_client_id
    and tenant_id = v_profile.tenant_id
    and sub_tenant_id = v_profile.sub_tenant_id;

  if found then
    return v_ticket;
  end if;

  insert into public.serial_counters (tenant_id, sub_tenant_id, service_date, last_number)
  values (v_profile.tenant_id, v_profile.sub_tenant_id, p_service_date, 1)
  on conflict (tenant_id, sub_tenant_id, service_date)
  do update set last_number = public.serial_counters.last_number + 1
  returning last_number into v_serial_number;

  insert into public.serial_tickets (
    client_id, tenant_id, sub_tenant_id, patient_id, patient_name,
    appointment_id, date_key, serial_number, display_code, status, created_by
  ) values (
    p_client_id, v_profile.tenant_id, v_profile.sub_tenant_id, v_patient.id,
    v_patient.name, v_appointment.id, p_service_date, v_serial_number,
    'S-' || lpad(v_serial_number::text, 3, '0'), 'waiting', auth.uid()
  )
  returning * into v_ticket;

  return v_ticket;
end;
$$;

revoke all on function public.issue_serial_ticket(uuid, uuid, uuid, date) from public;
revoke all on function public.issue_serial_ticket(uuid, uuid, uuid, date) from anon;
grant execute on function public.issue_serial_ticket(uuid, uuid, uuid, date) to authenticated;
