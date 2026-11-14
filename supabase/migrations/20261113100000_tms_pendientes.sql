-- TMS · Pendientes tras la Liquidación (Lote 1).
-- 1) Guarda: solo la Liquidación de transporte lleva un viaje a «En liquidación», lo devuelve a «Entregado» o lo cierra.
--    Las funciones de liquidación encienden la marca local tms.liquidando antes de cambiar el estado.
--    Cada función se reescribe desde su definición vigente (pg_get_functiondef) con un reemplazo exacto.
-- 2) El conductor ve la unidad de sus propios viajes (política SELECT adicional en vehiculos_transporte).
-- 3) Se elimina transporte_viajes.hora_salida (vacía y sin uso; la salida se guarda en fecha_programada). Autorizado por Cristhian.

do $mig$
declare
  d text; n text;
begin
  -- 1a) transporte_viaje_cambiar_estado: rechaza las transiciones de liquidación sin la marca.
  d := pg_get_functiondef('public.transporte_viaje_cambiar_estado(text,text,text)'::regprocedure);
  n := replace(d,
    E'  if p_estado_nuevo=''cancelado'' and nullif(trim(p_nota),'''') is null then',
    E'  if (p_estado_nuevo in (''en_liquidacion'',''cerrado'') or (v_estado_anterior=''en_liquidacion'' and p_estado_nuevo=''entregado''))\n'
    || E'     and coalesce(current_setting(''tms.liquidando'',true),'''') <> ''si'' then\n'
    || E'    raise exception ''Este cambio de estado lo hace la Liquidación de transporte.'' using errcode=''42501'';\n'
    || E'  end if;\n'
    || E'  if p_estado_nuevo=''cancelado'' and nullif(trim(p_nota),'''') is null then');
  if n = d then raise exception 'cambiar_estado: no se encontró el punto de inserción'; end if;
  execute n;

  -- 1b) transporte__liq_agregar
  d := pg_get_functiondef('public.transporte__liq_agregar(public.transporte_liquidaciones,text[])'::regprocedure);
  n := replace(d,
    E'    perform public.transporte_viaje_cambiar_estado(v.id, ''en_liquidacion'', ''Incluido en la liquidación '' || p_liq.numero);',
    E'    perform set_config(''tms.liquidando'', ''si'', true);\r\n'
    || E'    perform public.transporte_viaje_cambiar_estado(v.id, ''en_liquidacion'', ''Incluido en la liquidación '' || p_liq.numero);\r\n'
    || E'    perform set_config(''tms.liquidando'', ''no'', true);');
  if n = d then raise exception '__liq_agregar: no se encontró la llamada'; end if;
  execute n;

  -- 1c) transporte__liq_soltar
  d := pg_get_functiondef('public.transporte__liq_soltar(text,text)'::regprocedure);
  n := replace(d,
    E'    perform public.transporte_viaje_cambiar_estado(lv.viaje_id, ''entregado'', p_nota);',
    E'    perform set_config(''tms.liquidando'', ''si'', true);\r\n'
    || E'    perform public.transporte_viaje_cambiar_estado(lv.viaje_id, ''entregado'', p_nota);\r\n'
    || E'    perform set_config(''tms.liquidando'', ''no'', true);');
  if n = d then raise exception '__liq_soltar: no se encontró la llamada'; end if;
  execute n;

  -- 1d) transporte_liquidacion_accion (enviar a Ventas)
  d := pg_get_functiondef('public.transporte_liquidacion_accion(text,text,jsonb)'::regprocedure);
  n := replace(d,
    E'      perform public.transporte_viaje_cambiar_estado(r.viaje_id, ''cerrado'', ''Liquidado en '' || l.numero);',
    E'      perform set_config(''tms.liquidando'', ''si'', true);\r\n'
    || E'      perform public.transporte_viaje_cambiar_estado(r.viaje_id, ''cerrado'', ''Liquidado en '' || l.numero);\r\n'
    || E'      perform set_config(''tms.liquidando'', ''no'', true);');
  if n = d then raise exception 'liquidacion_accion: no se encontró la llamada'; end if;
  execute n;
end $mig$;

-- 2) El conductor ve la unidad de sus viajes.
create policy vehiculos_transporte_select_conductor on public.vehiculos_transporte
  for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and exists (
    select 1 from public.transporte_viajes v
    where v.vehiculo_id = vehiculos_transporte.id and v.empresa_id = vehiculos_transporte.empresa_id
      and public.transporte_es_conductor(v.empresa_id, v.conductor_id)));

-- 3) Columna sin uso.
alter table public.transporte_viajes drop column hora_salida;

-- Comprobación: si algo no quedó, se revierte todo.
do $chk$
begin
  if position('tms.liquidando' in pg_get_functiondef('public.transporte_viaje_cambiar_estado(text,text,text)'::regprocedure)) = 0
     or position('tms.liquidando' in pg_get_functiondef('public.transporte__liq_agregar(public.transporte_liquidaciones,text[])'::regprocedure)) = 0
     or position('tms.liquidando' in pg_get_functiondef('public.transporte__liq_soltar(text,text)'::regprocedure)) = 0
     or position('tms.liquidando' in pg_get_functiondef('public.transporte_liquidacion_accion(text,text,jsonb)'::regprocedure)) = 0 then
    raise exception 'La guarda de liquidación no quedó aplicada';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'vehiculos_transporte' and policyname = 'vehiculos_transporte_select_conductor') then
    raise exception 'Falta la política del conductor';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transporte_viajes' and column_name = 'hora_salida') then
    raise exception 'hora_salida sigue existiendo';
  end if;
end $chk$;
