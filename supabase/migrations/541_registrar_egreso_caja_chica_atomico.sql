-- Función atómica para registrar egresos en caja chica validando saldo disponible en DB.
-- Sigue el patrón de 475_registrar_cobro_cxc_atomico.sql con bloqueo FOR UPDATE sobre el fondo.

create or replace function public.registrar_egreso_caja_chica_atomico(
  p_payload jsonb
)
returns public.caja_chica
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fondo_id text := nullif(btrim(p_payload ->> 'fondo_id'), '');
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_sociedad_id uuid := nullif(btrim(p_payload ->> 'sociedad_id'), '')::uuid;
  v_monto numeric(14,2) := round(coalesce(nullif(p_payload ->> 'monto', '')::numeric, 0), 2);
  v_concepto text := nullif(btrim(p_payload ->> 'concepto'), '');
  v_fecha date := coalesce(nullif(p_payload ->> 'fecha', '')::date, current_date);
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_id text := nullif(btrim(p_payload ->> 'id'), '');
  v_responsable_id text := nullif(btrim(p_payload ->> 'responsable_id'), '');
  v_responsable_nombre text := nullif(btrim(p_payload ->> 'responsable_nombre'), '');
  v_ceco_id text := nullif(btrim(p_payload ->> 'ceco_id'), '');
  v_categoria text := coalesce(nullif(btrim(p_payload ->> 'categoria'), ''), 'Administrativos');
  v_num_comprobante text := nullif(btrim(p_payload ->> 'num_comprobante'), '');
  v_comprobante_url text := nullif(btrim(p_payload ->> 'comprobante_url'), '');
  v_estado text := coalesce(nullif(btrim(p_payload ->> 'estado'), ''), 'registrado');
  v_origen_registro text := coalesce(nullif(btrim(p_payload ->> 'origen_registro'), ''), 'backoffice');
  v_gasto_id text := nullif(btrim(p_payload ->> 'gasto_id'), '');
  v_creado_por text := coalesce(nullif(btrim(p_payload ->> 'creado_por'), ''), auth.uid()::text);
  v_creado_en timestamptz := coalesce(nullif(p_payload ->> 'creado_en', '')::timestamptz, now());

  v_fondo public.caja_chica_fondos%rowtype;
  v_gastado numeric(14,2) := 0;
  v_aportado numeric(14,2) := 0;
  v_repuesto numeric(14,2) := 0;
  v_disponible numeric(14,2) := 0;
  v_alcance uuid[];
  v_nuevo_egreso public.caja_chica%rowtype;
begin
  if v_fondo_id is null then
    raise exception 'FONDO_REQUERIDO: Seleccione un fondo de caja chica.';
  end if;

  if v_monto <= 0 then
    raise exception 'MONTO_INVALIDO: El monto del egreso debe ser mayor a cero.';
  end if;

  if v_concepto is null then
    raise exception 'CONCEPTO_REQUERIDO: El concepto del egreso es obligatorio.';
  end if;

  -- 1. Bloqueo exclusivo del fondo para concurrencia
  select * into v_fondo
  from public.caja_chica_fondos
  where id = v_fondo_id
  for update;

  if not found then
    raise exception 'FONDO_NO_ENCONTRADO: El fondo de caja chica especificado no existe.';
  end if;

  if v_empresa_id is not null and v_empresa_id <> v_fondo.empresa_id then
    raise exception 'EMPRESA_NO_COINCIDE: El fondo no pertenece a la empresa indicada.';
  end if;
  v_empresa_id := v_fondo.empresa_id;

  if v_fondo.estado = 'cerrado' then
    raise exception 'FONDO_CERRADO: No se pueden registrar egresos en un fondo de caja chica cerrado.';
  end if;
  if v_fondo.estado <> 'activo' then
    raise exception 'FONDO_INACTIVO: El fondo de caja chica no se encuentra activo.';
  end if;

  -- 2. Derivar sociedad si no fue provista
  if v_sociedad_id is null then
    select id into v_sociedad_id
    from public.sociedades
    where empresa_id = v_empresa_id and es_principal = true
    limit 1;
    if v_sociedad_id is null then
      select id into v_sociedad_id
      from public.sociedades
      where empresa_id = v_empresa_id
      order by id asc
      limit 1;
    end if;
  end if;

  -- 3. Permisos y alcance societario
  if auth.uid() is not null then
    if not public.usuario_tiene_empresa(v_empresa_id) then
      raise exception 'PERMISO_DENEGADO: No tiene permisos para operar en esta empresa.';
    end if;

    if not (public.usuario_puede(v_empresa_id, 'caja', 'crear') or public.usuario_responsable_fondo_caja(v_fondo.id)) then
      raise exception 'PERMISO_DENEGADO: No tiene permisos para registrar egresos en este fondo de caja chica.';
    end if;

    v_alcance := public.usuario_alcance_sociedades(v_empresa_id);
    if v_sociedad_id is not null
       and v_alcance is not null
       and not (v_sociedad_id = any(v_alcance)) then
      raise exception 'ALCANCE_DENEGADO: La sociedad seleccionada está fuera del alcance societario del usuario.';
    end if;
  elsif current_user not in ('postgres', 'service_role') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'NO_AUTENTICADO: Sesión no autenticada.';
  end if;

  -- 4. Recalcular saldo disponible real (fórmula idéntica a calcularFondos sin máscara)
  select coalesce(sum(monto), 0)
  into v_gastado
  from public.caja_chica
  where fondo_id = v_fondo.id
    and lower(coalesce(estado, '')) not in ('anulado', 'anulada');

  select coalesce(sum(monto), 0)
  into v_aportado
  from public.caja_chica_aportes
  where fondo_id = v_fondo.id
    and lower(coalesce(estado, '')) not in ('anulado', 'anulada');

  select coalesce(sum(monto_aprobado), 0)
  into v_repuesto
  from public.caja_chica_rendiciones
  where fondo_id = v_fondo.id
    and lower(coalesce(estado, '')) in ('aprobada', 'repuesta');

  v_disponible := round(coalesce(v_fondo.monto_asignado, 0) + v_aportado + v_repuesto - v_gastado, 2);

  -- 5. Validación estricta de saldo
  if v_monto > v_disponible then
    raise exception 'SALDO_INSUFICIENTE_CAJA_CHICA: El monto del egreso (% %) supera el saldo disponible actual del fondo (% %).',
      v_monto, v_moneda, v_disponible, v_fondo.moneda;
  end if;

  -- 6. Resolver responsable
  if v_responsable_id is null then
    v_responsable_id := v_fondo.responsable_id;
  end if;
  if v_responsable_nombre is null and v_responsable_id is not null then
    select nombre into v_responsable_nombre
    from public.usuarios
    where id = v_responsable_id;
  end if;

  -- 7. Inserción del registro
  if v_id is null then
    v_id := 'cc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  end if;

  insert into public.caja_chica (
    id, empresa_id, fondo_id, sociedad_id, fecha, concepto, monto, moneda,
    responsable_id, responsable_nombre, ceco_id, categoria, num_comprobante,
    comprobante_url, estado, origen_registro, gasto_id, creado_por, creado_en
  ) values (
    v_id, v_empresa_id, v_fondo.id, v_sociedad_id, v_fecha, v_concepto, v_monto, v_moneda,
    v_responsable_id, v_responsable_nombre, v_ceco_id, v_categoria, v_num_comprobante,
    v_comprobante_url, v_estado, v_origen_registro, v_gasto_id, v_creado_por, v_creado_en
  )
  returning * into v_nuevo_egreso;

  return v_nuevo_egreso;
end;
$$;

create or replace function public.registrar_egreso_caja_chica_atomico(
  p_fondo_id text,
  p_monto numeric,
  p_empresa_id text default null,
  p_sociedad_id uuid default null,
  p_concepto text default null,
  p_fecha date default null,
  p_moneda text default 'PEN',
  p_responsable_id text default null,
  p_responsable_nombre text default null,
  p_ceco_id text default null,
  p_categoria text default 'Administrativos',
  p_num_comprobante text default null,
  p_comprobante_url text default null,
  p_gasto_id text default null,
  p_id text default null
)
returns public.caja_chica
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.registrar_egreso_caja_chica_atomico(
    jsonb_build_object(
      'fondo_id', p_fondo_id,
      'monto', p_monto,
      'empresa_id', p_empresa_id,
      'sociedad_id', p_sociedad_id,
      'concepto', p_concepto,
      'fecha', p_fecha,
      'moneda', p_moneda,
      'responsable_id', p_responsable_id,
      'responsable_nombre', p_responsable_nombre,
      'ceco_id', p_ceco_id,
      'categoria', p_categoria,
      'num_comprobante', p_num_comprobante,
      'comprobante_url', p_comprobante_url,
      'gasto_id', p_gasto_id,
      'id', p_id
    )
  );
end;
$$;

revoke execute on function public.registrar_egreso_caja_chica_atomico(jsonb) from public, anon;
grant execute on function public.registrar_egreso_caja_chica_atomico(jsonb) to authenticated, service_role;

revoke execute on function public.registrar_egreso_caja_chica_atomico(text, numeric, text, uuid, text, date, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.registrar_egreso_caja_chica_atomico(text, numeric, text, uuid, text, date, text, text, text, text, text, text, text, text, text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
