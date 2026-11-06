-- registrar_egreso_caja_chica_atomico: deja de asignar 'Administrativos' por defecto.
-- Si no llega categoria del ER, rechaza el egreso con CATEGORIA_REQUERIDA.
-- Parte de la definicion remota vigente (pg_get_functiondef) con solo dos cambios.
do $$
begin
  if position($q$coalesce(nullif(btrim(p_payload ->> 'categoria'), ''), 'Administrativos')$q$ in
     pg_get_functiondef('public.registrar_egreso_caja_chica_atomico(jsonb)'::regprocedure)) = 0 then
    raise exception 'BASE_CAMBIADA: la definicion remota ya no contiene el valor por defecto esperado; revisar antes de reemplazar';
  end if;
end $$;

create or replace function public.registrar_egreso_caja_chica_atomico(p_payload jsonb)
 returns caja_chica
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_categoria text := nullif(btrim(p_payload ->> 'categoria'), '');
  v_num_comprobante text := nullif(btrim(p_payload ->> 'num_comprobante'), '');
  v_comprobante_url text := nullif(btrim(p_payload ->> 'comprobante_url'), '');
  v_estado text := coalesce(nullif(btrim(p_payload ->> 'estado'), ''), 'registrado');
  v_origen_registro text := coalesce(nullif(btrim(p_payload ->> 'origen_registro'), ''), 'backoffice');
  v_gasto_id text := nullif(btrim(p_payload ->> 'gasto_id'), '');
  v_creado_por text := coalesce(nullif(btrim(p_payload ->> 'creado_por'), ''), auth.uid()::text);
  v_creado_en timestamptz := coalesce(nullif(p_payload ->> 'creado_en', '')::timestamptz, now());

  v_fondo public.caja_chica_fondos%rowtype;
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

  if v_categoria is null then
    raise exception 'CATEGORIA_REQUERIDA: Seleccione la categoría del Estado de Resultados del egreso.';
  end if;

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

  -- Un fondo clasificado es la autoridad de su sociedad. Si el cliente
  -- intenta atribuir el egreso a otra sociedad, se rechaza explícitamente.
  -- En fondos legacy sin sociedad se conserva la sociedad enviada por el
  -- cliente, siempre que el alcance del usuario la autorice; solo cuando no
  -- viene se usa el fallback histórico.
  if v_fondo.sociedad_id is not null then
    if v_sociedad_id is not null and v_sociedad_id <> v_fondo.sociedad_id then
      raise exception 'SOCIEDAD_NO_COINCIDE: El egreso debe pertenecer a la misma sociedad del fondo.';
    end if;
    v_sociedad_id := v_fondo.sociedad_id;
  elsif v_sociedad_id is null then
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

  v_disponible := public.calcular_saldo_fondo_caja_chica(v_fondo.id);

  if v_monto > v_disponible then
    raise exception 'SALDO_INSUFICIENTE_CAJA_CHICA: El monto del egreso (% %) supera el saldo disponible actual del fondo (% %).',
      v_monto, v_moneda, v_disponible, v_fondo.moneda;
  end if;

  if v_responsable_id is null then
    v_responsable_id := v_fondo.responsable_id;
  end if;
  if v_responsable_nombre is null and v_responsable_id is not null then
    select nombre into v_responsable_nombre
    from public.usuarios
    where id = v_responsable_id;
  end if;

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
$function$;

-- Comprobacion: sin categoria debe rechazar antes de tocar datos.
do $$
declare v_msg text;
begin
  begin
    perform public.registrar_egreso_caja_chica_atomico(
      jsonb_build_object('fondo_id','__prueba_inexistente__','monto',1,'concepto','prueba'));
    raise exception 'PRUEBA_FALLIDA: no rechazo el egreso sin categoria';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'CATEGORIA_REQUERIDA%' then
      raise exception 'PRUEBA_FALLIDA: error inesperado: %', v_msg;
    end if;
  end;
end $$;
