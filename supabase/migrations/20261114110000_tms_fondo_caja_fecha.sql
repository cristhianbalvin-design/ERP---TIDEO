-- Lote 2 · complemento: fecha de entrega del fondo (mock aprobado 5.1) y lectura
-- de cajas y movimientos para la pantalla de rendición.

alter table public.transporte_rendiciones add column if not exists fondo_fecha date;

-- La entrega se registra con la fecha indicada (o la de hoy en Lima).
create or replace function public.transporte__rendicion_entrega(p_rendicion_id text, p_fondo_id text, p_monto numeric, p_referencia text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.transporte_rendiciones%rowtype;
  v_fondo public.caja_chica_fondos%rowtype;
  v_conductor text;
  v_egreso public.caja_chica%rowtype;
begin
  select * into r from public.transporte_rendiciones where id = p_rendicion_id;
  select * into v_fondo from public.caja_chica_fondos where id = p_fondo_id;
  if not found or v_fondo.empresa_id <> r.empresa_id then
    raise exception 'La caja chica elegida no existe en esta empresa.';
  end if;
  if upper(coalesce(v_fondo.moneda, 'PEN')) <> upper(coalesce(r.moneda, 'PEN')) then
    raise exception 'La caja chica está en % y la rendición en %; elige una caja de la misma moneda.', v_fondo.moneda, r.moneda;
  end if;
  select c.nombre into v_conductor from public.conductores_transporte c where c.id = r.conductor_id;
  v_egreso := public.registrar_egreso_caja_chica_atomico(jsonb_build_object(
    'fondo_id', p_fondo_id,
    'empresa_id', r.empresa_id,
    'monto', round(p_monto, 2),
    'moneda', r.moneda,
    'concepto', 'Entrega a rendir · ' || r.numero || ' · ' || coalesce(v_conductor, 'Sin conductor'),
    'categoria', public.transporte__categoria_logistica(r.empresa_id),
    'num_comprobante', nullif(trim(p_referencia), ''),
    'fecha', coalesce(r.fondo_fecha, (now() at time zone 'America/Lima')::date),
    'origen_registro', 'transporte_entrega'));
  update public.caja_chica set transporte_rendicion_id = r.id where id = v_egreso.id;
  return v_egreso.id;
end $function$;

create or replace function public.transporte_rendicion_fondo_caja(p_viaje_id text, p_monto numeric, p_referencia text, p_fondo_caja_id text, p_fecha date)
returns public.transporte_rendiciones
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.transporte_rendiciones%rowtype;
  v_entrega text;
  v_fondo text := nullif(trim(p_fondo_caja_id), '');
begin
  r := public.transporte__rendicion_para(p_viaje_id, 'editar');
  if r.estado = 'aprobada' then raise exception 'La rendición ya está aprobada.'; end if;
  if coalesce(p_monto, -1) < 0 then raise exception 'El fondo no puede ser negativo.'; end if;

  perform set_config('tms.rendicion', 'si', true);
  if r.entrega_caja_id is not null and exists (
    select 1 from public.caja_chica where id = r.entrega_caja_id and lower(coalesce(estado, '')) = 'registrado') then
    perform public.anular_egreso_caja_chica(r.entrega_caja_id, 'Entrega reemplazada en ' || r.numero);
  end if;
  update public.transporte_rendiciones
     set fondo_fecha = coalesce(p_fecha, (now() at time zone 'America/Lima')::date)
   where id = r.id;
  if v_fondo is not null and round(p_monto, 2) > 0 then
    v_entrega := public.transporte__rendicion_entrega(r.id, v_fondo, p_monto, p_referencia);
  end if;
  perform set_config('tms.rendicion', 'no', true);

  update public.transporte_rendiciones
     set fondo_entregado = round(p_monto, 2), fondo_referencia = nullif(trim(p_referencia), ''),
         fondo_caja_id = v_fondo, entrega_caja_id = v_entrega
   where id = r.id;
  perform public.transporte__rendicion_totales(p_viaje_id);
  select * into r from public.transporte_rendiciones where id = r.id;
  return r;
end $function$;

-- La de 4 argumentos delega con la fecha de hoy.
create or replace function public.transporte_rendicion_fondo_caja(p_viaje_id text, p_monto numeric, p_referencia text, p_fondo_caja_id text)
returns public.transporte_rendiciones
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.transporte_rendicion_fondo_caja(p_viaje_id, p_monto, p_referencia, p_fondo_caja_id, null::date);
end $function$;

-- Cajas que el usuario puede usar y movimientos de caja de la rendición.
create or replace function public.transporte_rendicion_caja(p_viaje_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_ren text;
begin
  select * into v from public.transporte_viajes where id = p_viaje_id;
  if not found then raise exception 'El viaje no existe.'; end if;
  if not (public.usuario_tiene_empresa(v.empresa_id) and public.transporte_puede_logistica(v.empresa_id, 'ver')) then
    raise exception 'No tienes permiso para ver rendiciones.' using errcode = '42501';
  end if;
  select id into v_ren from public.transporte_rendiciones where viaje_id = p_viaje_id;
  return jsonb_build_object(
    'cajas', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'nombre', f.nombre, 'moneda', upper(coalesce(f.moneda, 'PEN')),
               'saldo', public.calcular_saldo_fondo_caja_chica(f.id)) order by f.nombre)
        from public.caja_chica_fondos f
       where f.empresa_id = v.empresa_id and f.estado = 'activo'
         and (public.usuario_puede(v.empresa_id, 'caja', 'crear') or public.usuario_responsable_fondo_caja(f.id))), '[]'::jsonb),
    'movimientos', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'fecha', c.fecha, 'concepto', c.concepto, 'monto', c.monto, 'moneda', c.moneda,
               'categoria', c.categoria, 'estado', c.estado, 'origen', c.origen_registro, 'motivo_anulacion', c.motivo_anulacion,
               'gasto_id', c.transporte_gasto_id, 'fondo_id', c.fondo_id, 'fondo_nombre', f.nombre) order by c.creado_en, c.id)
        from public.caja_chica c left join public.caja_chica_fondos f on f.id = c.fondo_id
       where v_ren is not null and c.transporte_rendicion_id = v_ren), '[]'::jsonb));
end $function$;

revoke all on function public.transporte_rendicion_fondo_caja(text, numeric, text, text, date) from public, anon;
revoke all on function public.transporte_rendicion_caja(text) from public, anon;
grant execute on function public.transporte_rendicion_fondo_caja(text, numeric, text, text, date) to authenticated;
grant execute on function public.transporte_rendicion_caja(text) to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'transporte_rendiciones' and column_name = 'fondo_fecha') then
    raise exception 'Falta transporte_rendiciones.fondo_fecha.';
  end if;
  if to_regprocedure('public.transporte_rendicion_fondo_caja(text,numeric,text,text,date)') is null
     or to_regprocedure('public.transporte_rendicion_caja(text)') is null then
    raise exception 'Faltan funciones nuevas.';
  end if;
  if position('fondo_fecha' in pg_get_functiondef('public.transporte__rendicion_entrega(text,text,numeric,text)'::regprocedure)) = 0 then
    raise exception 'transporte__rendicion_entrega no usa fondo_fecha.';
  end if;
end $$;
