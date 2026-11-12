-- Aria: registrar leads y cuentas (prospecto, cliente o partner) desde el chat, con el mismo esquema del egreso:
-- 1) asistente_preparar_lead / asistente_preparar_cuenta (herramientas de Aria): validan, avisan duplicados y guardan un borrador.
-- 2) La persona revisa la tarjeta y pulsa Confirmar (Aria no puede confirmar).
-- 3) asistente_confirmar_borrador_crm (solo desde el panel): revalida permiso y graba.
-- Aditiva. El único cambio a algo existente es ampliar el CHECK de tipos de borrador y una guardia de tipo en
-- asistente_confirmar_borrador (egreso), que parte de su definición remota vigente.

alter table public.asistente_borradores drop constraint if exists asistente_borradores_tipo_check;
alter table public.asistente_borradores add constraint asistente_borradores_tipo_check
  check (tipo in ('egreso_caja_chica', 'lead', 'cuenta'));

-- El confirmador del egreso no debe procesar borradores de otro tipo.
do $$
declare
  v_def text := pg_get_functiondef('public.asistente_confirmar_borrador(uuid, text, text)'::regprocedure);
  v_ancla text := 'v_p := v_b.payload;';
begin
  if position('BORRADOR_DE_OTRO_TIPO' in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
      raise exception 'asistente_confirmar_borrador cambió: no se encontró el ancla esperada';
    end if;
    execute replace(v_def, v_ancla,
      E'if v_b.tipo <> ''egreso_caja_chica'' then\n    raise exception ''BORRADOR_DE_OTRO_TIPO: Este borrador no es un egreso de caja chica.'';\n  end if;\n  ' || v_ancla);
  end if;
end $$;

create or replace function public.asistente_texto(p text, p_max integer)
returns text language sql immutable set search_path to 'public'
as $$ select left(nullif(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), ''), p_max); $$;

-- Tipo y número de documento normalizados; devuelve error si no cuadran.
create or replace function public.asistente_documento(p_tipo text, p_numero text)
returns jsonb language plpgsql immutable set search_path to 'public'
as $$
declare
  v_num text := nullif(regexp_replace(coalesce(p_numero, ''), '[\s.\-]', '', 'g'), '');
  v_tipo text := upper(nullif(btrim(coalesce(p_tipo, '')), ''));
begin
  if v_tipo in ('EXTRANJERO', 'TAX ID', 'TAX_ID') then v_tipo := 'TAX_ID_EXTRANJERO'; end if;
  if v_tipo is not null and v_tipo not in ('RUC', 'DNI', 'TAX_ID_EXTRANJERO') then
    return jsonb_build_object('error', 'El tipo de documento debe ser RUC, DNI o documento extranjero.');
  end if;
  if v_num is null then return jsonb_build_object('tipo', coalesce(v_tipo, 'RUC'), 'numero', null); end if;
  if v_tipo is null then
    v_tipo := case when v_num ~ '^\d{8}$' then 'DNI' else 'RUC' end;
  end if;
  if v_tipo = 'RUC' and v_num !~ '^\d{11}$' then return jsonb_build_object('error', 'El RUC debe tener 11 dígitos.'); end if;
  if v_tipo = 'DNI' and v_num !~ '^\d{8}$' then return jsonb_build_object('error', 'El DNI debe tener 8 dígitos.'); end if;
  return jsonb_build_object('tipo', v_tipo, 'numero', left(v_num, 20));
end; $$;

create or replace function public.asistente_preparar_lead(
  p_empresa_id text,
  p_nombre_contacto text default null,
  p_empresa_nombre text default null,
  p_tipo_documento text default null,
  p_numero_documento text default null,
  p_razon_social text default null,
  p_cargo text default null,
  p_telefono text default null,
  p_email text default null,
  p_linkedin_url text default null,
  p_fuente text default null,
  p_industria text default null,
  p_necesidad text default null,
  p_presupuesto_estimado numeric default null,
  p_moneda text default null,
  p_urgencia text default null,
  p_campana text default null,
  p_confirmar_duplicado boolean default false
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_doc jsonb;
  v_nombre text := public.asistente_texto(p_nombre_contacto, 160);
  v_empresa text := public.asistente_texto(p_empresa_nombre, 200);
  v_razon text := public.asistente_texto(p_razon_social, 200);
  v_email text := lower(public.asistente_texto(p_email, 160));
  v_urgencia text := lower(coalesce(public.asistente_texto(p_urgencia, 20), 'media'));
  v_moneda text := upper(coalesce(public.asistente_texto(p_moneda, 3), 'PEN'));
  v_faltan text[] := array[]::text[];
  v_dups jsonb;
  v_payload jsonb; v_borrador uuid; v_vence timestamptz; v_responsable text;
begin
  if v_uid is null then raise exception 'NO_AUTENTICADO: Sesión no autenticada.'; end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then raise exception 'PERMISO_DENEGADO: No tiene acceso a esta empresa.'; end if;
  if not public.usuario_puede(p_empresa_id, 'leads', 'crear') then
    return jsonb_build_object('estado', 'sin_permiso', 'mensaje', 'El rol de la persona no tiene permiso para crear leads.');
  end if;
  v_doc := public.asistente_documento(p_tipo_documento, p_numero_documento);
  if v_doc ? 'error' then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', v_doc ->> 'error'); end if;
  v_empresa := coalesce(v_empresa, v_razon);
  if v_nombre is null then v_faltan := array_append(v_faltan, 'nombre_contacto'); end if;
  if v_empresa is null and v_doc ->> 'tipo' <> 'DNI' then v_faltan := array_append(v_faltan, 'empresa_nombre'); end if;
  if cardinality(v_faltan) > 0 then
    return jsonb_build_object('estado', 'faltan_datos', 'faltan', to_jsonb(v_faltan),
      'mensaje', 'Pide solo lo que falta. El nombre del contacto es la persona con quien se habla; la empresa es obligatoria salvo que sea una persona con DNI.',
      'opcionales', 'documento, razon_social, cargo, telefono, email, linkedin_url, fuente, industria, necesidad, presupuesto_estimado, moneda, urgencia, campana');
  end if;
  if v_urgencia not in ('alta', 'media', 'baja') then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'La urgencia debe ser alta, media o baja.'); end if;
  if v_moneda not in ('PEN', 'USD') then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'La moneda debe ser PEN o USD.'); end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'El correo no tiene un formato válido.'); end if;
  if p_presupuesto_estimado is not null and p_presupuesto_estimado < 0 then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'El presupuesto no puede ser negativo.'); end if;

  if not coalesce(p_confirmar_duplicado, false) then
    select jsonb_agg(d) into v_dups from (
      select jsonb_build_object('tipo', 'lead', 'nombre', l.nombre_contacto, 'empresa', l.empresa_nombre, 'estado', l.estado, 'coincide_por', case when v_doc ->> 'numero' is not null and l.numero_documento = v_doc ->> 'numero' then 'documento' else 'correo' end) d
        from public.leads l
       where l.empresa_id = p_empresa_id and coalesce(l.estado, '') <> 'descartado'
         and ((v_doc ->> 'numero' is not null and l.numero_documento = v_doc ->> 'numero') or (v_email is not null and lower(l.email) = v_email))
      union all
      select jsonb_build_object('tipo', 'cuenta', 'nombre', coalesce(nullif(c.razon_social, ''), c.nombre_comercial), 'clase', c.tipo, 'coincide_por', 'documento')
        from public.cuentas c
       where c.empresa_id = p_empresa_id and v_doc ->> 'numero' is not null and c.ruc = v_doc ->> 'numero'
      limit 5) x;
    if v_dups is not null then
      return jsonb_build_object('estado', 'posible_duplicado', 'coincidencias', v_dups,
        'mensaje', 'Ya existe un registro que coincide. Muéstraselo a la persona y pregunta si igual quiere crear el lead; solo si confirma, vuelve a llamar con confirmar_duplicado en true.');
    end if;
  end if;

  select u.nombre into v_responsable from public.usuarios u where u.id::text = v_uid::text limit 1;
  update public.asistente_borradores set estado = 'cancelado', cerrado_en = now()
   where user_id = v_uid and tipo = 'lead' and estado = 'pendiente';

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'nombre_contacto', v_nombre, 'empresa_nombre', v_empresa, 'razon_social', v_razon,
    'tipo_documento', v_doc ->> 'tipo', 'numero_documento', v_doc ->> 'numero',
    'cargo', public.asistente_texto(p_cargo, 120), 'telefono', public.asistente_texto(p_telefono, 40), 'email', v_email,
    'linkedin_url', public.asistente_texto(p_linkedin_url, 300),
    'fuente', coalesce(public.asistente_texto(p_fuente, 80), 'Manual'),
    'industria', public.asistente_texto(p_industria, 120), 'necesidad', public.asistente_texto(p_necesidad, 1000),
    'presupuesto_estimado', p_presupuesto_estimado, 'moneda', v_moneda, 'urgencia', v_urgencia,
    'campana', public.asistente_texto(p_campana, 160), 'responsable', v_responsable));

  insert into public.asistente_borradores (empresa_id, user_id, tipo, payload)
  values (p_empresa_id, v_uid, 'lead', v_payload) returning id, vence_en into v_borrador, v_vence;

  return jsonb_build_object('estado', 'listo',
    'mensaje', 'Borrador de lead preparado, todavía NO registrado. La persona debe revisar la tarjeta y pulsar Confirmar.',
    'borrador', v_payload || jsonb_build_object('id', v_borrador, 'vence_en', v_vence, 'tipo', 'lead'));
end; $$;

create or replace function public.asistente_preparar_cuenta(
  p_empresa_id text,
  p_razon_social text default null,
  p_nombre_comercial text default null,
  p_tipo_documento text default null,
  p_ruc text default null,
  p_tipo text default null,
  p_industria text default null,
  p_tamano text default null,
  p_telefono text default null,
  p_email text default null,
  p_direccion text default null,
  p_condicion_pago text default null,
  p_limite_credito numeric default null,
  p_moneda text default null,
  p_fuente_origen text default null,
  p_contacto_nombre text default null,
  p_contacto_cargo text default null,
  p_contacto_telefono text default null,
  p_contacto_email text default null,
  p_confirmar_duplicado boolean default false
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_doc jsonb;
  v_razon text := public.asistente_texto(p_razon_social, 200);
  v_comercial text := public.asistente_texto(p_nombre_comercial, 200);
  v_tipo text := lower(coalesce(public.asistente_texto(p_tipo, 20), 'prospecto'));
  v_email text := lower(public.asistente_texto(p_email, 160));
  v_cemail text := lower(public.asistente_texto(p_contacto_email, 160));
  v_cnombre text := public.asistente_texto(p_contacto_nombre, 160);
  v_moneda text := upper(coalesce(public.asistente_texto(p_moneda, 3), 'PEN'));
  v_dups jsonb;
  v_payload jsonb; v_borrador uuid; v_vence timestamptz; v_responsable text;
begin
  if v_uid is null then raise exception 'NO_AUTENTICADO: Sesión no autenticada.'; end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then raise exception 'PERMISO_DENEGADO: No tiene acceso a esta empresa.'; end if;
  if not public.usuario_puede(p_empresa_id, 'cuentas', 'crear') then
    return jsonb_build_object('estado', 'sin_permiso', 'mensaje', 'El rol de la persona no tiene permiso para crear cuentas.');
  end if;
  v_doc := public.asistente_documento(p_tipo_documento, p_ruc);
  if v_doc ? 'error' then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', v_doc ->> 'error'); end if;
  if v_razon is null and v_comercial is null then
    return jsonb_build_object('estado', 'faltan_datos', 'faltan', jsonb_build_array('razon_social'),
      'mensaje', 'Pide la razón social o el nombre comercial. Lo demás es opcional.',
      'opcionales', 'ruc, tipo (prospecto, cliente o partner), nombre_comercial, industria, tamano, telefono, email, direccion, condicion_pago, limite_credito, moneda, fuente_origen y un contacto principal (nombre, cargo, telefono, email)');
  end if;
  if v_tipo not in ('prospecto', 'cliente', 'partner') then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'El tipo de cuenta debe ser prospecto, cliente o partner.'); end if;
  if v_moneda not in ('PEN', 'USD') then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'La moneda debe ser PEN o USD.'); end if;
  if (v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') or (v_cemail is not null and v_cemail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'El correo no tiene un formato válido.');
  end if;
  if p_limite_credito is not null and p_limite_credito < 0 then return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'El límite de crédito no puede ser negativo.'); end if;
  if v_cnombre is null and (p_contacto_cargo is not null or p_contacto_telefono is not null or v_cemail is not null) then
    return jsonb_build_object('estado', 'faltan_datos', 'faltan', jsonb_build_array('contacto_nombre'), 'mensaje', 'Para guardar el contacto principal falta su nombre.');
  end if;

  if not coalesce(p_confirmar_duplicado, false) then
    select jsonb_agg(d) into v_dups from (
      select jsonb_build_object('tipo', 'cuenta', 'nombre', coalesce(nullif(c.razon_social, ''), c.nombre_comercial), 'ruc', c.ruc, 'clase', c.tipo,
               'coincide_por', case when v_doc ->> 'numero' is not null and c.ruc = v_doc ->> 'numero' then 'documento' else 'nombre' end) d
        from public.cuentas c
       where c.empresa_id = p_empresa_id
         and ((v_doc ->> 'numero' is not null and c.ruc = v_doc ->> 'numero')
           or public.asistente_norm(coalesce(nullif(c.razon_social, ''), c.nombre_comercial)) in (public.asistente_norm(v_razon), public.asistente_norm(v_comercial)))
       limit 5) x;
    if v_dups is not null then
      return jsonb_build_object('estado', 'posible_duplicado', 'coincidencias', v_dups,
        'mensaje', 'Ya existe una cuenta que coincide. Muéstrasela a la persona y pregunta si igual quiere crearla; solo si confirma, vuelve a llamar con confirmar_duplicado en true.');
    end if;
  end if;

  select u.nombre into v_responsable from public.usuarios u where u.id::text = v_uid::text limit 1;
  update public.asistente_borradores set estado = 'cancelado', cerrado_en = now()
   where user_id = v_uid and tipo = 'cuenta' and estado = 'pendiente';

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'razon_social', v_razon, 'nombre_comercial', coalesce(v_comercial, v_razon),
    'tipo_documento', v_doc ->> 'tipo', 'ruc', v_doc ->> 'numero', 'tipo_cuenta', v_tipo,
    'industria', public.asistente_texto(p_industria, 120), 'tamano', public.asistente_texto(p_tamano, 40),
    'telefono', public.asistente_texto(p_telefono, 40), 'email', v_email, 'direccion', public.asistente_texto(p_direccion, 300),
    'condicion_pago', public.asistente_texto(p_condicion_pago, 60), 'limite_credito', p_limite_credito, 'moneda', v_moneda,
    'fuente_origen', public.asistente_texto(p_fuente_origen, 80), 'responsable', v_responsable,
    'contacto_nombre', v_cnombre, 'contacto_cargo', public.asistente_texto(p_contacto_cargo, 120),
    'contacto_telefono', public.asistente_texto(p_contacto_telefono, 40), 'contacto_email', v_cemail));

  insert into public.asistente_borradores (empresa_id, user_id, tipo, payload)
  values (p_empresa_id, v_uid, 'cuenta', v_payload) returning id, vence_en into v_borrador, v_vence;

  return jsonb_build_object('estado', 'listo',
    'mensaje', 'Borrador de cuenta preparado, todavía NO registrado. La persona debe revisar la tarjeta y pulsar Confirmar.',
    'borrador', v_payload || jsonb_build_object('id', v_borrador, 'vence_en', v_vence, 'tipo', 'cuenta'));
end; $$;

create or replace function public.asistente_confirmar_borrador_crm(p_borrador_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_b public.asistente_borradores%rowtype;
  v_p jsonb;
  v_id text; v_contacto_id text; v_nombre text; v_res jsonb;
begin
  if auth.uid() is null then raise exception 'NO_AUTENTICADO: Sesión no autenticada.'; end if;
  select * into v_b from public.asistente_borradores where id = p_borrador_id and user_id = auth.uid() for update;
  if not found then raise exception 'BORRADOR_NO_ENCONTRADO: El borrador no existe o no es tuyo.'; end if;
  if v_b.tipo not in ('lead', 'cuenta') then raise exception 'BORRADOR_DE_OTRO_TIPO: Este borrador no es de un lead ni de una cuenta.'; end if;
  if v_b.estado = 'confirmado' then
    return jsonb_build_object('estado', 'confirmado', 'ya_registrado', true) || coalesce(v_b.resultado, '{}'::jsonb);
  end if;
  if v_b.estado <> 'pendiente' then
    return jsonb_build_object('estado', v_b.estado, 'mensaje', 'Este borrador ya no está vigente. Pídele a Aria que lo prepare de nuevo.');
  end if;
  if v_b.vence_en < now() then
    update public.asistente_borradores set estado = 'vencido', cerrado_en = now() where id = v_b.id;
    return jsonb_build_object('estado', 'vencido', 'mensaje', 'El borrador venció. Pídele a Aria que lo prepare de nuevo.');
  end if;
  if not public.usuario_tiene_empresa(v_b.empresa_id)
     or not public.usuario_puede(v_b.empresa_id, case v_b.tipo when 'lead' then 'leads' else 'cuentas' end, 'crear') then
    raise exception 'PERMISO_DENEGADO: No tienes permiso para crear este registro.';
  end if;
  v_p := v_b.payload;

  if v_b.tipo = 'lead' then
    v_id := 'lead_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    v_nombre := v_p ->> 'nombre_contacto';
    insert into public.leads (id, empresa_id, nombre_contacto, empresa_nombre, razon_social, numero_documento, tipo_documento,
      industria, telefono, email, linkedin_url, fuente, cargo, urgencia, registrado_desde, responsable, responsable_id, campana,
      dias_sin_actividad, fecha_creacion, necesidad, presupuesto_estimado, moneda, estado, convertido)
    values (v_id, v_b.empresa_id, v_nombre, v_p ->> 'empresa_nombre', v_p ->> 'razon_social', v_p ->> 'numero_documento', coalesce(v_p ->> 'tipo_documento', 'RUC'),
      v_p ->> 'industria', v_p ->> 'telefono', v_p ->> 'email', v_p ->> 'linkedin_url', coalesce(v_p ->> 'fuente', 'Manual'), v_p ->> 'cargo',
      coalesce(v_p ->> 'urgencia', 'media'), 'backoffice', v_p ->> 'responsable', auth.uid(), v_p ->> 'campana',
      0, (now() at time zone 'America/Lima')::date, v_p ->> 'necesidad', nullif(v_p ->> 'presupuesto_estimado', '')::numeric, coalesce(v_p ->> 'moneda', 'PEN'), 'nuevo', false);
    v_res := jsonb_build_object('tipo', 'lead', 'id', v_id, 'nombre', v_nombre, 'empresa', v_p ->> 'empresa_nombre');
  else
    v_id := 'cta_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
    v_nombre := coalesce(v_p ->> 'razon_social', v_p ->> 'nombre_comercial');
    insert into public.cuentas (id, empresa_id, nombre_comercial, razon_social, ruc, tipo_documento, tipo, industria, tamano, telefono, email, direccion,
      responsable_comercial, responsable_id, fuente_origen, condicion_pago, limite_credito, moneda, saldo_cxc, estado)
    values (v_id, v_b.empresa_id, coalesce(v_p ->> 'nombre_comercial', v_nombre), v_p ->> 'razon_social', v_p ->> 'ruc', coalesce(v_p ->> 'tipo_documento', 'RUC'),
      coalesce(v_p ->> 'tipo_cuenta', 'prospecto'), v_p ->> 'industria', v_p ->> 'tamano', v_p ->> 'telefono', v_p ->> 'email', v_p ->> 'direccion',
      v_p ->> 'responsable', auth.uid(), v_p ->> 'fuente_origen', v_p ->> 'condicion_pago', nullif(v_p ->> 'limite_credito', '')::numeric, coalesce(v_p ->> 'moneda', 'PEN'), 0, 'activo');
    if v_p ->> 'contacto_nombre' is not null then
      v_contacto_id := 'con_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
      insert into public.contactos (id, empresa_id, cuenta_id, nombre, cargo, telefono, email, es_principal, estado)
      values (v_contacto_id, v_b.empresa_id, v_id, v_p ->> 'contacto_nombre', v_p ->> 'contacto_cargo',
        coalesce(v_p ->> 'contacto_telefono', v_p ->> 'telefono'), coalesce(v_p ->> 'contacto_email', v_p ->> 'email'), true, 'activo');
    end if;
    v_res := jsonb_build_object('tipo', 'cuenta', 'id', v_id, 'nombre', v_nombre, 'clase', coalesce(v_p ->> 'tipo_cuenta', 'prospecto'), 'contacto_id', v_contacto_id);
  end if;

  update public.asistente_borradores set estado = 'confirmado', cerrado_en = now(), resultado = v_res where id = v_b.id;
  return jsonb_build_object('estado', 'confirmado') || v_res;
end; $$;

revoke all on function public.asistente_preparar_lead(text, text, text, text, text, text, text, text, text, text, text, text, text, numeric, text, text, text, boolean) from public, anon;
revoke all on function public.asistente_preparar_cuenta(text, text, text, text, text, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.asistente_confirmar_borrador_crm(uuid) from public, anon;
grant execute on function public.asistente_preparar_lead(text, text, text, text, text, text, text, text, text, text, text, text, text, numeric, text, text, text, boolean) to authenticated;
grant execute on function public.asistente_preparar_cuenta(text, text, text, text, text, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.asistente_confirmar_borrador_crm(uuid) to authenticated;
grant execute on function public.asistente_texto(text, integer) to authenticated;
grant execute on function public.asistente_documento(text, text) to authenticated;

do $$
begin
  if to_regprocedure('public.asistente_confirmar_borrador_crm(uuid)') is null then raise exception 'Falta asistente_confirmar_borrador_crm'; end if;
  if position('BORRADOR_DE_OTRO_TIPO' in pg_get_functiondef('public.asistente_confirmar_borrador(uuid, text, text)'::regprocedure)) = 0 then
    raise exception 'Falta la guardia de tipo en asistente_confirmar_borrador';
  end if;
  if (public.asistente_documento(null, '20608522060') ->> 'tipo') <> 'RUC' or not (public.asistente_documento('RUC', '123') ? 'error') then
    raise exception 'asistente_documento no valida como se espera';
  end if;
end $$;
