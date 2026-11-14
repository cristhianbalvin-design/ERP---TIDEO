-- Lote 2 · Rendición de transporte conectada a Caja Chica (modelo A).
-- 1) La entrega al conductor sale de una caja chica elegida: egreso con origen
--    'transporte_entrega' que baja el saldo pero no es gasto (el Estado de
--    Resultados lo excluye por su origen).
-- 2) Al aprobar la rendición, la entrega se anula ("Rendida en REN-…") y cada gasto
--    aprobado se registra como egreso de la caja en la categoría Logística
--    (origen 'transporte_gasto').
-- 3) Al reabrir, se anulan esos egresos y se vuelve a registrar la entrega.
-- 4) Los egresos con esos orígenes solo se anulan o editan desde la rendición.
-- Todo es aditivo: columnas nuevas, funciones nuevas y tres CREATE OR REPLACE que
-- parten de pg_get_functiondef de la versión vigente (14/11/2026).

-- ── Columnas de enlace ─────────────────────────────────────────────────────────
alter table public.caja_chica
  add column if not exists transporte_rendicion_id text references public.transporte_rendiciones(id) on delete set null,
  add column if not exists transporte_gasto_id text references public.transporte_viaje_gastos(id) on delete set null;

alter table public.transporte_rendiciones
  add column if not exists fondo_caja_id text references public.caja_chica_fondos(id) on delete set null,
  add column if not exists entrega_caja_id text references public.caja_chica(id) on delete set null;

create index if not exists caja_chica_transporte_rendicion_idx on public.caja_chica(transporte_rendicion_id) where transporte_rendicion_id is not null;
create index if not exists caja_chica_transporte_gasto_idx on public.caja_chica(transporte_gasto_id) where transporte_gasto_id is not null;
create index if not exists transporte_rendiciones_fondo_caja_idx on public.transporte_rendiciones(fondo_caja_id) where fondo_caja_id is not null;
create index if not exists transporte_rendiciones_entrega_caja_idx on public.transporte_rendiciones(entrega_caja_id) where entrega_caja_id is not null;

-- ── Categoría Logística del tenant ─────────────────────────────────────────────
create or replace function public.transporte__categoria_logistica(p_empresa_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select c.nombre from public.er_categorias c
      where c.empresa_id = p_empresa_id and c.activo and lower(c.nombre) in ('logística', 'logistica')
      order by c.orden limit 1),
    (select c.nombre from public.er_categorias c
      where c.empresa_id = p_empresa_id and c.activo and c.tipo_sistema = 'logistica'
      order by c.orden limit 1),
    'Logística');
$function$;

-- ── Registrar la entrega en la caja (uso interno) ──────────────────────────────
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
    'fecha', (now() at time zone 'America/Lima')::date,
    'origen_registro', 'transporte_entrega'));
  update public.caja_chica set transporte_rendicion_id = r.id where id = v_egreso.id;
  return v_egreso.id;
end $function$;

-- ── Fondo entregado con caja chica ─────────────────────────────────────────────
-- p_fondo_caja_id null = no mueve Caja Chica (comportamiento anterior).
create or replace function public.transporte_rendicion_fondo_caja(p_viaje_id text, p_monto numeric, p_referencia text, p_fondo_caja_id text)
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

-- Versión anterior (3 argumentos): ahora conserva la caja ya elegida.
-- Antes: actualizaba fondo_entregado y fondo_referencia sin tocar Caja Chica.
create or replace function public.transporte_rendicion_fondo(p_viaje_id text, p_monto numeric, p_referencia text)
returns public.transporte_rendiciones
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.transporte_rendicion_fondo_caja(p_viaje_id, p_monto, p_referencia,
    (select fondo_caja_id from public.transporte_rendiciones where viaje_id = p_viaje_id));
end $function$;

-- ── Aprobar / reabrir con Caja Chica ───────────────────────────────────────────
-- Parte de transporte_rendicion_accion(text,text) vigente; agrega p_fondo_caja_id
-- y el movimiento de caja. La validación previa a aprobar no cambia.
create or replace function public.transporte_rendicion_accion(p_viaje_id text, p_accion text, p_fondo_caja_id text)
returns public.transporte_rendiciones
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.transporte_rendiciones%rowtype;
  v_estado text;
  v_fondo text;
  v_moneda_fondo text;
  v_cat text;
  g record;
  v_egreso public.caja_chica%rowtype;
  v_id text;
  v_entrega text;
begin
  r := public.transporte__rendicion_para(p_viaje_id, 'aprobar');
  if p_accion = 'aprobar' then
    if r.estado = 'aprobada' then raise exception 'La rendición ya está aprobada.'; end if;
    select estado into v_estado from public.transporte_viajes where id = p_viaje_id;
    if v_estado not in ('entregado','en_liquidacion','cerrado') then raise exception 'El viaje aún no termina: la rendición se aprueba al final.'; end if;
    if exists (select 1 from public.transporte_viaje_gastos where viaje_id = p_viaje_id and estado = 'pendiente') then
      raise exception 'Revisa todos los gastos (aprobar u observar) antes de aprobar la rendición.';
    end if;
    perform public.transporte__rendicion_totales(p_viaje_id);

    v_fondo := coalesce(r.fondo_caja_id, nullif(trim(p_fondo_caja_id), ''));
    if v_fondo is null and exists (select 1 from public.transporte_viaje_gastos where viaje_id = p_viaje_id and estado = 'aprobado') then
      raise exception 'Elige la caja chica de la que salen los gastos aprobados.';
    end if;
    if v_fondo is not null then
      select upper(coalesce(moneda, 'PEN')) into v_moneda_fondo from public.caja_chica_fondos where id = v_fondo and empresa_id = r.empresa_id;
      if v_moneda_fondo is null then raise exception 'La caja chica elegida no existe en esta empresa.'; end if;
      if exists (select 1 from public.transporte_viaje_gastos where viaje_id = p_viaje_id and estado = 'aprobado'
                  and upper(coalesce(moneda, 'PEN')) <> v_moneda_fondo) then
        raise exception 'Hay gastos aprobados en otra moneda que la caja chica (%); no se pueden registrar en esa caja.', v_moneda_fondo;
      end if;
      v_cat := public.transporte__categoria_logistica(r.empresa_id);

      perform set_config('tms.rendicion', 'si', true);
      -- La entrega deja de bajar el saldo: el dinero ya se convirtió en gastos.
      if r.entrega_caja_id is not null and exists (
        select 1 from public.caja_chica where id = r.entrega_caja_id and lower(coalesce(estado, '')) = 'registrado') then
        perform public.anular_egreso_caja_chica(r.entrega_caja_id, 'Rendida en ' || r.numero);
      end if;
      for g in select * from public.transporte_viaje_gastos where viaje_id = p_viaje_id and estado = 'aprobado' order by fecha, id loop
        v_egreso := public.registrar_egreso_caja_chica_atomico(jsonb_build_object(
          'fondo_id', v_fondo,
          'empresa_id', r.empresa_id,
          'monto', g.monto,
          'moneda', g.moneda,
          'concepto', initcap(replace(coalesce(g.tipo, 'gasto'), '_', ' ')) || ' · ' || r.numero || coalesce(' · ' || nullif(trim(g.lugar), ''), ''),
          'categoria', v_cat,
          'comprobante_url', g.foto_url,
          'fecha', (coalesce(g.fecha, now()) at time zone 'America/Lima')::date,
          'origen_registro', 'transporte_gasto'));
        update public.caja_chica set transporte_rendicion_id = r.id, transporte_gasto_id = g.id where id = v_egreso.id;
      end loop;
      perform set_config('tms.rendicion', 'no', true);
    end if;

    update public.transporte_rendiciones
       set estado = 'aprobada', aprobada_at = now(), aprobada_por = auth.uid(), fondo_caja_id = v_fondo
     where id = r.id;
  elsif p_accion = 'reabrir' then
    if r.estado <> 'aprobada' then raise exception 'La rendición no está aprobada.'; end if;
    perform set_config('tms.rendicion', 'si', true);
    for v_id in select id from public.caja_chica
                 where transporte_rendicion_id = r.id and origen_registro = 'transporte_gasto'
                   and lower(coalesce(estado, '')) = 'registrado' order by id loop
      perform public.anular_egreso_caja_chica(v_id, 'Rendición ' || r.numero || ' reabierta');
    end loop;
    -- La entrega vuelve a estar pendiente de rendir: se registra de nuevo.
    if r.fondo_caja_id is not null and r.entrega_caja_id is not null and coalesce(r.fondo_entregado, 0) > 0 then
      v_entrega := public.transporte__rendicion_entrega(r.id, r.fondo_caja_id, r.fondo_entregado, r.fondo_referencia);
    end if;
    perform set_config('tms.rendicion', 'no', true);
    update public.transporte_rendiciones
       set estado = 'abierta', aprobada_at = null, aprobada_por = null,
           entrega_caja_id = case when r.entrega_caja_id is not null then v_entrega end
     where id = r.id;
  else
    raise exception 'Acción no válida: %.', p_accion;
  end if;
  select * into r from public.transporte_rendiciones where id = r.id;
  return r;
end $function$;

-- Versión de 2 argumentos: delega en la nueva usando la caja ya elegida.
create or replace function public.transporte_rendicion_accion(p_viaje_id text, p_accion text)
returns public.transporte_rendiciones
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.transporte_rendicion_accion(p_viaje_id, p_accion, null::text);
end $function$;

-- ── Los egresos de la rendición solo se tocan desde la rendición ───────────────
do $$
declare
  v_def text := pg_get_functiondef('public.cc_egreso_modificable(text,text,date)'::regprocedure);
  v_ancla text := E'    raise exception ''EGRESO_NO_MODIFICABLE: Solo se pueden modificar egresos en estado registrado (estado actual: %).'', v_egreso.estado;\n  end if;\n';
begin
  if position(v_ancla in v_def) = 0 then
    raise exception 'cc_egreso_modificable cambió; no se encontró el punto de inserción.';
  end if;
  if position('EGRESO_TRANSPORTE' in v_def) = 0 then
    v_def := replace(v_def, v_ancla, v_ancla ||
      E'  if v_egreso.origen_registro in (''transporte_entrega'', ''transporte_gasto'')\n' ||
      E'     and coalesce(current_setting(''tms.rendicion'', true), '''') <> ''si'' then\n' ||
      E'    raise exception ''EGRESO_TRANSPORTE: Este egreso viene de una rendición de transporte; corrígelo desde Liquidación de transporte.'';\n' ||
      E'  end if;\n');
    execute v_def;
  end if;
end $$;

-- ── Permisos: las internas no se exponen ───────────────────────────────────────
revoke all on function public.transporte__rendicion_entrega(text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.transporte__categoria_logistica(text) from public, anon;
revoke all on function public.transporte_rendicion_fondo_caja(text, numeric, text, text) from public, anon;
revoke all on function public.transporte_rendicion_accion(text, text, text) from public, anon;
grant execute on function public.transporte_rendicion_fondo_caja(text, numeric, text, text) to authenticated;
grant execute on function public.transporte_rendicion_accion(text, text, text) to authenticated;

-- ── Comprobación ───────────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'public'
        and ((table_name = 'caja_chica' and column_name in ('transporte_rendicion_id', 'transporte_gasto_id'))
          or (table_name = 'transporte_rendiciones' and column_name in ('fondo_caja_id', 'entrega_caja_id')))) <> 4 then
    raise exception 'Faltan columnas de enlace.';
  end if;
  if position('EGRESO_TRANSPORTE' in pg_get_functiondef('public.cc_egreso_modificable(text,text,date)'::regprocedure)) = 0 then
    raise exception 'cc_egreso_modificable sin la guarda de transporte.';
  end if;
  if to_regprocedure('public.transporte_rendicion_accion(text,text,text)') is null
     or to_regprocedure('public.transporte_rendicion_fondo_caja(text,numeric,text,text)') is null then
    raise exception 'Faltan funciones nuevas.';
  end if;
  if has_function_privilege('authenticated', 'public.transporte__rendicion_entrega(text,text,numeric,text)', 'execute') then
    raise exception 'transporte__rendicion_entrega no debe ser ejecutable por authenticated.';
  end if;
end $$;
