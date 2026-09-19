-- 544 · Línea de negocio en CRM, costeo, cotizaciones y OT.
-- Las columnas son nullable: no se realiza backfill histórico.
-- La línea de negocio comercial se deriva server-side desde oportunidades
-- cuando existe oportunidad de origen. sociedad_id queda fuera de alcance.

begin;

alter table public.oportunidades
  add column if not exists linea_negocio text;

alter table public.hojas_costeo
  add column if not exists linea_negocio text;

alter table public.cotizaciones
  add column if not exists linea_negocio text;

alter table public.cotizaciones_especiales
  add column if not exists linea_negocio text;

alter table public.ordenes_trabajo
  add column if not exists linea_negocio text;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.oportunidades'::regclass
      and conname = 'oportunidades_linea_negocio_check'
  ) then
    alter table public.oportunidades
      add constraint oportunidades_linea_negocio_check
      check (linea_negocio is null or linea_negocio in (
        'flota_alquileres',
        'maestranza_fab',
        'transporte_comercial',
        'venta_repuestos'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hojas_costeo'::regclass
      and conname = 'hojas_costeo_linea_negocio_check'
  ) then
    alter table public.hojas_costeo
      add constraint hojas_costeo_linea_negocio_check
      check (linea_negocio is null or linea_negocio in (
        'flota_alquileres',
        'maestranza_fab',
        'transporte_comercial',
        'venta_repuestos'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cotizaciones'::regclass
      and conname = 'cotizaciones_linea_negocio_check'
  ) then
    alter table public.cotizaciones
      add constraint cotizaciones_linea_negocio_check
      check (linea_negocio is null or linea_negocio in (
        'flota_alquileres',
        'maestranza_fab',
        'transporte_comercial',
        'venta_repuestos'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cotizaciones_especiales'::regclass
      and conname = 'cotizaciones_especiales_linea_negocio_check'
  ) then
    alter table public.cotizaciones_especiales
      add constraint cotizaciones_especiales_linea_negocio_check
      check (linea_negocio is null or linea_negocio in (
        'flota_alquileres',
        'maestranza_fab',
        'transporte_comercial',
        'venta_repuestos'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ordenes_trabajo'::regclass
      and conname = 'ordenes_trabajo_linea_negocio_check'
  ) then
    alter table public.ordenes_trabajo
      add constraint ordenes_trabajo_linea_negocio_check
      check (linea_negocio is null or linea_negocio in (
        'flota_alquileres',
        'maestranza_fab',
        'transporte_comercial',
        'venta_repuestos',
        'interno_zahory'
      ));
  end if;
end;
$constraints$;

-- Protege también los inserts directos permitidos por RLS. Para documentos
-- comerciales, el valor enviado por el cliente no es autoritativo cuando hay
-- oportunidad de origen; sin oportunidad queda NULL.
create or replace function public.derivar_linea_negocio_desde_oportunidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.oportunidad_id is null then
    new.linea_negocio := null;
  else
    select o.linea_negocio
      into new.linea_negocio
    from public.oportunidades o
    where o.id = new.oportunidad_id
      and o.empresa_id = new.empresa_id;
  end if;

  return new;
end;
$$;

revoke all on function public.derivar_linea_negocio_desde_oportunidad()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_hojas_costeo_linea_negocio on public.hojas_costeo;
drop trigger if exists trg_cotizaciones_linea_negocio on public.cotizaciones;
drop trigger if exists trg_cotizaciones_especiales_linea_negocio on public.cotizaciones_especiales;

create trigger trg_hojas_costeo_linea_negocio
before insert or update of oportunidad_id, linea_negocio on public.hojas_costeo
for each row execute function public.derivar_linea_negocio_desde_oportunidad();

create trigger trg_cotizaciones_linea_negocio
before insert or update of oportunidad_id, linea_negocio on public.cotizaciones
for each row execute function public.derivar_linea_negocio_desde_oportunidad();

create trigger trg_cotizaciones_especiales_linea_negocio
before insert or update of oportunidad_id, linea_negocio on public.cotizaciones_especiales
for each row execute function public.derivar_linea_negocio_desde_oportunidad();

-- La validación del campo en oportunidades es un CHECK de tabla; sólo los
-- documentos que heredan el valor necesitan trigger.

-- Actualiza la RPC vigente de Hoja de Costeo con lectura directa de la
-- oportunidad, manteniendo su firma pública existente.
alter function public.crear_hoja_costeo_sociedad(
  text, uuid, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) rename to _crear_hoja_costeo_sociedad_impl_544;

create function public.crear_hoja_costeo_sociedad(
  p_empresa_id text,
  p_sociedad_id uuid,
  p_id text,
  p_numero text,
  p_oportunidad_id text default null,
  p_cuenta_id text default null,
  p_responsable_costeo text default null,
  p_fecha date default current_date,
  p_margen_objetivo_pct numeric default 35,
  p_notas text default null,
  p_mano_obra jsonb default '[]'::jsonb,
  p_materiales jsonb default '[]'::jsonb,
  p_servicios_terceros jsonb default '[]'::jsonb,
  p_logistica jsonb default '[]'::jsonb,
  p_total_mano_obra numeric default 0,
  p_total_materiales numeric default 0,
  p_total_servicios_terceros numeric default 0,
  p_total_logistica numeric default 0,
  p_costo_total numeric default 0,
  p_precio_sugerido_sin_igv numeric default 0,
  p_precio_sugerido_total numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hojas_costeo%rowtype;
begin
  perform public._crear_hoja_costeo_sociedad_impl_544(
    p_empresa_id, p_sociedad_id, p_id, p_numero, p_oportunidad_id,
    p_cuenta_id, p_responsable_costeo, p_fecha, p_margen_objetivo_pct,
    p_notas, p_mano_obra, p_materiales, p_servicios_terceros, p_logistica,
    p_total_mano_obra, p_total_materiales, p_total_servicios_terceros,
    p_total_logistica, p_costo_total, p_precio_sugerido_sin_igv,
    p_precio_sugerido_total
  );

  update public.hojas_costeo h
     set linea_negocio = (
       select o.linea_negocio
       from public.oportunidades o
       where o.id = h.oportunidad_id
         and o.empresa_id = h.empresa_id
     )
   where h.id = p_id
     and h.empresa_id = p_empresa_id;

  select * into v_row
  from public.hojas_costeo
  where id = p_id
    and empresa_id = p_empresa_id;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.crear_hoja_costeo_sociedad(
  text, uuid, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, service_role;
grant execute on function public.crear_hoja_costeo_sociedad(
  text, uuid, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

-- RPC legacy: conserva la firma y deriva el mismo campo cuando aplica.
alter function public.crear_hoja_costeo(
  text, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) rename to _crear_hoja_costeo_impl_544;

create function public.crear_hoja_costeo(
  p_empresa_id text,
  p_id text,
  p_numero text,
  p_oportunidad_id text default null,
  p_cuenta_id text default null,
  p_responsable_costeo text default null,
  p_fecha date default current_date,
  p_margen_objetivo_pct numeric default 35,
  p_notas text default null,
  p_mano_obra jsonb default '[]'::jsonb,
  p_materiales jsonb default '[]'::jsonb,
  p_servicios_terceros jsonb default '[]'::jsonb,
  p_logistica jsonb default '[]'::jsonb,
  p_total_mano_obra numeric default 0,
  p_total_materiales numeric default 0,
  p_total_servicios_terceros numeric default 0,
  p_total_logistica numeric default 0,
  p_costo_total numeric default 0,
  p_precio_sugerido_sin_igv numeric default 0,
  p_precio_sugerido_total numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hojas_costeo%rowtype;
begin
  perform public._crear_hoja_costeo_impl_544(
    p_empresa_id, p_id, p_numero, p_oportunidad_id, p_cuenta_id,
    p_responsable_costeo, p_fecha, p_margen_objetivo_pct, p_notas,
    p_mano_obra, p_materiales, p_servicios_terceros, p_logistica,
    p_total_mano_obra, p_total_materiales, p_total_servicios_terceros,
    p_total_logistica, p_costo_total, p_precio_sugerido_sin_igv,
    p_precio_sugerido_total
  );

  update public.hojas_costeo h
     set linea_negocio = (
       select o.linea_negocio
       from public.oportunidades o
       where o.id = h.oportunidad_id
         and o.empresa_id = h.empresa_id
     )
   where h.id = p_id
     and h.empresa_id = p_empresa_id;

  select * into v_row
  from public.hojas_costeo
  where id = p_id
    and empresa_id = p_empresa_id;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.crear_hoja_costeo(
  text, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, service_role;
grant execute on function public.crear_hoja_costeo(
  text, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated, service_role;

-- Ambas RPC de aprobación crean la Cotización Estándar desde una HC. Se
-- envuelve la implementación existente para recalcular desde oportunidades,
-- sin aceptar linea_negocio como parámetro del cliente.
alter function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(
  text, uuid, text, text, text, text, text
) rename to _aprobar_hoja_costeo_y_crear_cotizacion_sociedad_impl_544;

create function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(
  p_empresa_id text,
  p_sociedad_id uuid,
  p_hoja_costeo_id text,
  p_cotizacion_id text,
  p_numero text,
  p_moneda text default 'PEN',
  p_validez text default '30 dias'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
begin
  perform public._aprobar_hoja_costeo_y_crear_cotizacion_sociedad_impl_544(
    p_empresa_id, p_sociedad_id, p_hoja_costeo_id, p_cotizacion_id,
    p_numero, p_moneda, p_validez
  );

  update public.cotizaciones c
     set linea_negocio = (
       select o.linea_negocio
       from public.oportunidades o
       where o.id = c.oportunidad_id
         and o.empresa_id = c.empresa_id
     )
   where c.id = p_cotizacion_id
     and c.empresa_id = p_empresa_id;

  select * into v_hc from public.hojas_costeo where id = p_hoja_costeo_id;
  select * into v_cot from public.cotizaciones where id = p_cotizacion_id;
  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

revoke all on function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(
  text, uuid, text, text, text, text, text
) from public, anon, service_role;
grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(
  text, uuid, text, text, text, text, text
) to authenticated;

alter function public.aprobar_hoja_costeo_y_crear_cotizacion(
  text, text, text, text, text, text
) rename to _aprobar_hoja_costeo_y_crear_cotizacion_impl_544;

create function public.aprobar_hoja_costeo_y_crear_cotizacion(
  p_empresa_id text,
  p_hoja_costeo_id text,
  p_cotizacion_id text,
  p_numero text,
  p_moneda text default 'PEN',
  p_validez text default '30 dias'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
begin
  perform public._aprobar_hoja_costeo_y_crear_cotizacion_impl_544(
    p_empresa_id, p_hoja_costeo_id, p_cotizacion_id,
    p_numero, p_moneda, p_validez
  );

  update public.cotizaciones c
     set linea_negocio = (
       select o.linea_negocio
       from public.oportunidades o
       where o.id = c.oportunidad_id
         and o.empresa_id = c.empresa_id
     )
   where c.id = p_cotizacion_id
     and c.empresa_id = p_empresa_id;

  select * into v_hc from public.hojas_costeo where id = p_hoja_costeo_id;
  select * into v_cot from public.cotizaciones where id = p_cotizacion_id;
  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

revoke all on function public.aprobar_hoja_costeo_y_crear_cotizacion(
  text, text, text, text, text, text
) from public, anon, service_role;
grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(
  text, text, text, text, text, text
) to authenticated;

-- Cotización Especial: la RPC pública existente conserva su firma; la
-- implementación interna se envuelve para recalcular la línea desde la
-- oportunidad después de crear el borrador.
alter function public.crear_cotizacion_especial(
  uuid, uuid, text, text, text, text, text, jsonb,
  text, text, integer, date, boolean, jsonb, text, text
) rename to _crear_cotizacion_especial_impl_544;

create function public.crear_cotizacion_especial(
  p_tipo_documento_id uuid,
  p_plantilla_documento_id uuid,
  p_cuenta_id text,
  p_oportunidad_id text,
  p_origen_items text,
  p_hoja_costeo_id text,
  p_moneda text,
  p_items jsonb,
  p_contacto_id text default null,
  p_validez_tipo text default 'dias',
  p_validez_dias integer default 30,
  p_validez_fecha date default null,
  p_hitos_activos boolean default false,
  p_hitos_pago jsonb default '[]'::jsonb,
  p_activo_id text default null,
  p_recepcion_id text default null
)
returns table(id uuid, numero text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_numero text;
begin
  select created.id, created.numero
    into v_id, v_numero
  from public._crear_cotizacion_especial_impl_544(
    p_tipo_documento_id, p_plantilla_documento_id, p_cuenta_id,
    p_oportunidad_id, p_origen_items, p_hoja_costeo_id, p_moneda,
    p_items, p_contacto_id, p_validez_tipo, p_validez_dias,
    p_validez_fecha, p_hitos_activos, p_hitos_pago, p_activo_id,
    p_recepcion_id
  ) created;

  update public.cotizaciones_especiales c
     set linea_negocio = (
       select o.linea_negocio
       from public.oportunidades o
       where o.id = c.oportunidad_id
         and o.empresa_id = c.empresa_id
     )
   where c.id = v_id;

  return query
  select c.id, c.numero
  from public.cotizaciones_especiales c
  where c.id = v_id;
end;
$$;

revoke all on function public.crear_cotizacion_especial(
  uuid, uuid, text, text, text, text, text, jsonb,
  text, text, integer, date, boolean, jsonb, text, text
) from public, anon, service_role;
grant execute on function public.crear_cotizacion_especial(
  uuid, uuid, text, text, text, text, text, jsonb,
  text, text, integer, date, boolean, jsonb, text, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');
commit;
