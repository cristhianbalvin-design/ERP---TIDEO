-- 675: Caja Chica — editar y anular egresos, anular aportes.
-- Reglas:
--   * Un egreso solo se edita/anula si está 'registrado', su fondo está activo y su
--     fecha no cae en el periodo de una rendición solicitada, aprobada o repuesta.
--   * La edición no cambia el monto: para corregir el monto se anula y se registra de nuevo.
--   * Si el egreso tiene gasto vinculado (compras_gastos), se sincroniza la edición y se
--     anula el gasto junto con el egreso (el ER lee el gasto).
--   * Un aporte solo se anula si el saldo del fondo sigue cubriendo lo ya gastado.
--     Si salió de una cuenta bancaria, se registra en Tesorería el ingreso de reversión.
-- Permisos: caja.editar / caja.anular, o ser responsable del fondo (solo egresos).

alter table public.caja_chica
  add column if not exists motivo_anulacion text,
  add column if not exists anulado_por text,
  add column if not exists anulado_en timestamptz,
  add column if not exists editado_por text,
  add column if not exists editado_en timestamptz;

alter table public.caja_chica_aportes
  add column if not exists motivo_anulacion text,
  add column if not exists anulado_por text,
  add column if not exists anulado_en timestamptz;

-- Valida que el egreso pueda modificarse y devuelve la fila bloqueada.
create or replace function public.cc_egreso_modificable(p_id text, p_accion text, p_fecha_nueva date default null)
returns public.caja_chica
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_egreso public.caja_chica%rowtype;
  v_fondo public.caja_chica_fondos%rowtype;
  v_alcance uuid[];
begin
  select * into v_egreso from public.caja_chica where id = p_id for update;
  if not found then
    raise exception 'EGRESO_NO_ENCONTRADO: El egreso de caja chica no existe.';
  end if;
  if v_egreso.fondo_id is null then
    raise exception 'EGRESO_SIN_FONDO: Este egreso no pertenece a un fondo de caja chica.';
  end if;
  if lower(coalesce(v_egreso.estado, '')) <> 'registrado' then
    raise exception 'EGRESO_NO_MODIFICABLE: Solo se pueden modificar egresos en estado registrado (estado actual: %).', v_egreso.estado;
  end if;

  select * into v_fondo from public.caja_chica_fondos where id = v_egreso.fondo_id for update;
  if v_fondo.estado <> 'activo' then
    raise exception 'FONDO_INACTIVO: El fondo de caja chica no está activo.';
  end if;

  if auth.uid() is not null then
    if not public.usuario_tiene_empresa(v_egreso.empresa_id) then
      raise exception 'PERMISO_DENEGADO: No tiene permisos para operar en esta empresa.';
    end if;
    if not (public.usuario_puede(v_egreso.empresa_id, 'caja', p_accion)
            or public.usuario_puede(v_egreso.empresa_id, 'caja', 'editar')
            or public.usuario_responsable_fondo_caja(v_fondo.id)) then
      raise exception 'PERMISO_DENEGADO: No tiene permisos para modificar egresos de este fondo.';
    end if;
    v_alcance := public.usuario_alcance_sociedades(v_egreso.empresa_id);
    if v_egreso.sociedad_id is not null and v_alcance is not null and not (v_egreso.sociedad_id = any(v_alcance)) then
      raise exception 'ALCANCE_DENEGADO: El egreso está fuera de su alcance societario.';
    end if;
  elsif current_user not in ('postgres', 'service_role') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'NO_AUTENTICADO: Sesión no autenticada.';
  end if;

  if exists (
    select 1 from public.caja_chica_rendiciones r
    where r.fondo_id = v_fondo.id
      and lower(coalesce(r.estado, '')) in ('solicitada', 'aprobada', 'repuesta')
      and (v_egreso.fecha between r.periodo_inicio and r.periodo_fin
           or (p_fecha_nueva is not null and p_fecha_nueva between r.periodo_inicio and r.periodo_fin))
  ) then
    raise exception 'EGRESO_RENDIDO: El egreso cae en el periodo de una rendición ya solicitada o repuesta; no se puede modificar.';
  end if;

  if v_egreso.gasto_id is not null and exists (
    select 1 from public.compras_gastos g where g.id = v_egreso.gasto_id and g.cxp_id is not null
  ) then
    raise exception 'GASTO_CON_CXP: El gasto vinculado tiene una cuenta por pagar; modifíquelo desde Cuentas por Pagar.';
  end if;

  return v_egreso;
end;
$function$;

create or replace function public.editar_egreso_caja_chica(
  p_id text, p_concepto text, p_categoria text, p_ceco_id text, p_num_comprobante text, p_fecha date)
returns public.caja_chica
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_egreso public.caja_chica%rowtype;
  v_concepto text := nullif(btrim(p_concepto), '');
  v_categoria text := nullif(btrim(p_categoria), '');
  v_ceco text := nullif(btrim(p_ceco_id), '');
  v_num text := nullif(btrim(p_num_comprobante), '');
begin
  if v_concepto is null then
    raise exception 'CONCEPTO_REQUERIDO: El concepto del egreso es obligatorio.';
  end if;
  if v_categoria is null then
    raise exception 'CATEGORIA_REQUERIDA: Seleccione la categoría del Estado de Resultados del egreso.';
  end if;
  if p_fecha is null then
    raise exception 'FECHA_REQUERIDA: La fecha del egreso es obligatoria.';
  end if;

  v_egreso := public.cc_egreso_modificable(p_id, 'editar', p_fecha);

  update public.caja_chica
     set concepto = v_concepto, categoria = v_categoria, ceco_id = v_ceco,
         num_comprobante = v_num, fecha = p_fecha,
         editado_por = auth.uid()::text, editado_en = now()
   where id = p_id
  returning * into v_egreso;

  if v_egreso.gasto_id is not null then
    update public.compras_gastos
       set descripcion = v_concepto, categoria = v_categoria, centro_costo_id = v_ceco,
           num_comprobante = v_num, fecha = p_fecha, updated_at = now()
     where id = v_egreso.gasto_id;
  end if;

  return v_egreso;
end;
$function$;

create or replace function public.anular_egreso_caja_chica(p_id text, p_motivo text)
returns public.caja_chica
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_egreso public.caja_chica%rowtype;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO: Indique el motivo de la anulación.';
  end if;

  v_egreso := public.cc_egreso_modificable(p_id, 'anular', null);

  update public.caja_chica
     set estado = 'anulado', motivo_anulacion = v_motivo,
         anulado_por = auth.uid()::text, anulado_en = now()
   where id = p_id
  returning * into v_egreso;

  if v_egreso.gasto_id is not null then
    update public.compras_gastos
       set estado = 'anulado', updated_at = now()
     where id = v_egreso.gasto_id;
  end if;

  return v_egreso;
end;
$function$;

create or replace function public.anular_aporte_caja_chica(p_id text, p_motivo text)
returns public.caja_chica_aportes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_aporte public.caja_chica_aportes%rowtype;
  v_fondo public.caja_chica_fondos%rowtype;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_saldo numeric(14,2);
begin
  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO: Indique el motivo de la anulación.';
  end if;

  select * into v_aporte from public.caja_chica_aportes where id = p_id for update;
  if not found then
    raise exception 'APORTE_NO_ENCONTRADO: El aporte de caja chica no existe.';
  end if;
  if v_aporte.estado <> 'registrado' then
    raise exception 'APORTE_NO_MODIFICABLE: El aporte ya está %.', v_aporte.estado;
  end if;

  select * into v_fondo from public.caja_chica_fondos where id = v_aporte.fondo_id for update;
  if v_fondo.estado <> 'activo' then
    raise exception 'FONDO_INACTIVO: El fondo de caja chica no está activo.';
  end if;

  if auth.uid() is not null then
    if not public.usuario_tiene_empresa(v_aporte.empresa_id) then
      raise exception 'PERMISO_DENEGADO: No tiene permisos para operar en esta empresa.';
    end if;
    if not (public.usuario_puede(v_aporte.empresa_id, 'caja', 'anular')
            or public.usuario_puede(v_aporte.empresa_id, 'caja', 'editar')) then
      raise exception 'PERMISO_DENEGADO: No tiene permisos para anular aportes de caja chica.';
    end if;
  elsif current_user not in ('postgres', 'service_role') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'NO_AUTENTICADO: Sesión no autenticada.';
  end if;

  v_saldo := public.calcular_saldo_fondo_caja_chica(v_fondo.id);
  if v_saldo - v_aporte.monto < 0 then
    raise exception 'SALDO_INSUFICIENTE_CAJA_CHICA: Al anular este aporte (% %) el saldo del fondo quedaría negativo (saldo actual % %).',
      v_aporte.monto, v_aporte.moneda, v_saldo, v_fondo.moneda;
  end if;

  update public.caja_chica_aportes
     set estado = 'anulado', motivo_anulacion = v_motivo,
         anulado_por = auth.uid()::text, anulado_en = now()
   where id = p_id
  returning * into v_aporte;

  if v_aporte.tipo_origen = 'cuenta_bancaria' and exists (
    select 1 from public.movimientos_tesoreria m
    where m.vinculo_tipo = 'caja_chica_aporte' and m.vinculo_id = v_aporte.id
  ) then
    insert into public.movimientos_tesoreria (
      id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria_id,
      categoria, es_manual, referencia, vinculo_tipo, vinculo_id, estado
    ) values (
      'tes_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      v_aporte.empresa_id, 'ingreso',
      'Reversión de aporte anulado a caja chica: ' || v_fondo.nombre,
      v_aporte.monto, v_aporte.moneda, current_date, v_aporte.cuenta_bancaria_id,
      'caja_chica', false, left(v_motivo, 200), 'caja_chica_aporte_anulacion', v_aporte.id, 'registrado'
    );
  end if;

  return v_aporte;
end;
$function$;

revoke all on function public.cc_egreso_modificable(text, text, date) from public, anon;
revoke all on function public.editar_egreso_caja_chica(text, text, text, text, text, date) from public, anon;
revoke all on function public.anular_egreso_caja_chica(text, text) from public, anon;
revoke all on function public.anular_aporte_caja_chica(text, text) from public, anon;
grant execute on function public.editar_egreso_caja_chica(text, text, text, text, text, date) to authenticated;
grant execute on function public.anular_egreso_caja_chica(text, text) to authenticated;
grant execute on function public.anular_aporte_caja_chica(text, text) to authenticated;

do $verificacion$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'caja_chica'
        and column_name in ('motivo_anulacion', 'anulado_por', 'anulado_en', 'editado_por', 'editado_en')) <> 5 then
    raise exception 'VERIFICACION_675: faltan columnas en caja_chica';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'caja_chica_aportes'
        and column_name in ('motivo_anulacion', 'anulado_por', 'anulado_en')) <> 3 then
    raise exception 'VERIFICACION_675: faltan columnas en caja_chica_aportes';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('cc_egreso_modificable', 'editar_egreso_caja_chica', 'anular_egreso_caja_chica', 'anular_aporte_caja_chica')) <> 4 then
    raise exception 'VERIFICACION_675: faltan funciones';
  end if;
end;
$verificacion$;
