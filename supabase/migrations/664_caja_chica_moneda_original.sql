-- Egresos de caja chica pagados en moneda distinta a la del fondo:
-- se registran en la moneda del fondo (convertidos con el tipo de cambio)
-- y se guarda el monto/moneda original y el tipo de cambio.
do $$
begin
  if (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.proname = 'registrar_egreso_caja_chica_atomico') <> '7c42bcdb249d94f0c61bfc5804518d6a' then
    raise exception 'registrar_egreso_caja_chica_atomico cambió respecto de la versión revisada; abortando';
  end if;
end $$;

alter table public.caja_chica
  add column if not exists tipo_cambio numeric(14,6),
  add column if not exists moneda_original text,
  add column if not exists monto_original numeric(14,2);

comment on column public.caja_chica.tipo_cambio is 'Soles por unidad de la moneda extranjera usada en la conversión (solo si el egreso se pagó en moneda distinta a la del fondo).';
comment on column public.caja_chica.moneda_original is 'Moneda en que se pagó el egreso cuando difiere de la moneda del fondo. monto/moneda quedan en la moneda del fondo.';
comment on column public.caja_chica.monto_original is 'Monto pagado en moneda_original.';

CREATE OR REPLACE FUNCTION public.registrar_egreso_caja_chica_atomico(p_payload jsonb)
 RETURNS caja_chica
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_moneda_original text := upper(nullif(btrim(p_payload ->> 'moneda_original'), ''));
  v_monto_original numeric(14,2) := round(nullif(p_payload ->> 'monto_original', '')::numeric, 2);
  v_tipo_cambio numeric(14,6) := nullif(p_payload ->> 'tipo_cambio', '')::numeric;
  v_moneda_fondo text;

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

  -- Moneda: el egreso siempre se registra en la moneda del fondo. Si se pagó en
  -- otra moneda, se convierte con el tipo de cambio y se guarda el original.
  v_moneda_fondo := upper(coalesce(v_fondo.moneda, 'PEN'));
  if v_moneda_original is null and v_moneda <> v_moneda_fondo then
    v_moneda_original := v_moneda;
    v_monto_original := v_monto;
  end if;

  if v_moneda_original is not null and v_moneda_original <> v_moneda_fondo then
    if v_monto_original is null or v_monto_original <= 0 then
      raise exception 'MONTO_ORIGINAL_INVALIDO: El monto pagado en la moneda original debe ser mayor a cero.';
    end if;
    if v_tipo_cambio is null or v_tipo_cambio <= 0 then
      raise exception 'TIPO_CAMBIO_REQUERIDO: El egreso está en % y el fondo en %; indique un tipo de cambio válido.', v_moneda_original, v_moneda_fondo;
    end if;
    if v_moneda_fondo = 'PEN' and v_moneda_original in ('USD', 'EUR') then
      v_monto := round(v_monto_original * v_tipo_cambio, 2);
    elsif v_moneda_original = 'PEN' and v_moneda_fondo in ('USD', 'EUR') then
      v_monto := round(v_monto_original / v_tipo_cambio, 2);
    else
      raise exception 'CONVERSION_NO_SOPORTADA: No se puede convertir de % a %.', v_moneda_original, v_moneda_fondo;
    end if;
    v_moneda := v_moneda_fondo;
    if v_monto <= 0 then
      raise exception 'MONTO_INVALIDO: El monto convertido debe ser mayor a cero.';
    end if;
  else
    v_moneda_original := null;
    v_monto_original := null;
    v_tipo_cambio := null;
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
    comprobante_url, estado, origen_registro, gasto_id, creado_por, creado_en,
    tipo_cambio, moneda_original, monto_original
  ) values (
    v_id, v_empresa_id, v_fondo.id, v_sociedad_id, v_fecha, v_concepto, v_monto, v_moneda,
    v_responsable_id, v_responsable_nombre, v_ceco_id, v_categoria, v_num_comprobante,
    v_comprobante_url, v_estado, v_origen_registro, v_gasto_id, v_creado_por, v_creado_en,
    v_tipo_cambio, v_moneda_original, v_monto_original
  )
  returning * into v_nuevo_egreso;

  return v_nuevo_egreso;
end;
$function$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.proname = 'registrar_egreso_caja_chica_atomico';
  if position('TIPO_CAMBIO_REQUERIDO' in v_def) = 0
     or position('SALDO_INSUFICIENTE_CAJA_CHICA' in v_def) = 0
     or position('usuario_puede(v_empresa_id, ''caja'', ''crear'')' in v_def) = 0
     or position('for update' in v_def) = 0 then
    raise exception 'registrar_egreso_caja_chica_atomico no quedó con la corrección o perdió validaciones';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='caja_chica'
      and column_name in ('tipo_cambio','moneda_original','monto_original')) <> 3 then
    raise exception 'faltan columnas nuevas en caja_chica';
  end if;
end $$;
