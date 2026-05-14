-- TIDEO ERP - calcula dias_sin_actividad de leads desde actividad real.
-- Se toma la ultima actividad/agenda vinculada al lead con fecha <= current_date.
-- Si no existe actividad, se cuenta desde fecha_creacion/created_at del lead.

create or replace function public.recalcular_dias_sin_actividad_lead(p_lead_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ultima_fecha date;
begin
  select max(fecha) into v_ultima_fecha
  from (
    select ac.fecha
    from public.actividades_comerciales ac
    where ac.lead_id = p_lead_id
      and ac.fecha <= current_date
    union all
    select ac.fecha
    from public.actividades_comerciales ac
    where ac.vinculo_tipo = 'lead'
      and ac.vinculo_id = p_lead_id
      and ac.fecha <= current_date
    union all
    select ag.fecha
    from public.agenda_comercial ag
    where ag.lead_id = p_lead_id
      and ag.fecha <= current_date
  ) fechas;

  update public.leads l
  set dias_sin_actividad = greatest(
    0,
    current_date - coalesce(v_ultima_fecha, l.fecha_creacion, l.created_at::date, current_date)
  )
  where l.id = p_lead_id;
end;
$$;

create or replace function public.recalcular_dias_sin_actividad_leads_empresa(p_empresa_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select id from public.leads where empresa_id = p_empresa_id loop
    perform public.recalcular_dias_sin_actividad_lead(r.id);
  end loop;
end;
$$;

create or replace function public.trg_recalcular_dias_sin_actividad_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id text;
  v_new jsonb := '{}'::jsonb;
  v_old jsonb := '{}'::jsonb;
begin
  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;

  v_lead_id := coalesce(
    v_new->>'lead_id',
    case when v_new->>'vinculo_tipo' = 'lead' then v_new->>'vinculo_id' else null end,
    v_old->>'lead_id',
    case when v_old->>'vinculo_tipo' = 'lead' then v_old->>'vinculo_id' else null end
  );

  if v_lead_id is not null then
    perform public.recalcular_dias_sin_actividad_lead(v_lead_id);
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists recalcular_dias_sin_actividad_actividades on public.actividades_comerciales;
create trigger recalcular_dias_sin_actividad_actividades
after insert or update or delete on public.actividades_comerciales
for each row execute function public.trg_recalcular_dias_sin_actividad_lead();

drop trigger if exists recalcular_dias_sin_actividad_agenda on public.agenda_comercial;
create trigger recalcular_dias_sin_actividad_agenda
after insert or update or delete on public.agenda_comercial
for each row execute function public.trg_recalcular_dias_sin_actividad_lead();

do $$
declare
  r record;
begin
  for r in select distinct empresa_id from public.leads loop
    perform public.recalcular_dias_sin_actividad_leads_empresa(r.empresa_id);
  end loop;
end;
$$;
