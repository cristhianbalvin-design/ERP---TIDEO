-- 641: Correos adicionales por empresa y evento en el motor de notificaciones.
-- Cada regla puede tener destinatarios.correos_adicionales (hasta 10 direcciones) que reciben el aviso por correo,
-- tengan o no usuario en el ERP. Cambios: notif_envios admite filas sin usuario (solo correo) con su propio índice
-- único de dedupe; helper notif_emitir_correos_adicionales; una llamada añadida en cada generador; validación en
-- notif_config_guardar; el historial muestra el correo cuando no hay usuario.
-- Las funciones reemplazadas parten de pg_get_functiondef vigente (idéntico a la 639) con cambios mínimos.

begin;

alter table public.notif_envios alter column destinatario_user_id drop not null;
alter table public.notif_envios drop constraint if exists notif_envios_destinatario_chk;
alter table public.notif_envios add constraint notif_envios_destinatario_chk
  check (destinatario_user_id is not null or nullif(trim(coalesce(destinatario_email, '')), '') is not null);
create unique index if not exists notif_envios_correo_adicional_uidx
  on public.notif_envios (empresa_id, evento_codigo, canal, lower(destinatario_email), clave_dedupe)
  where destinatario_user_id is null;

-- Lista normalizada de correos adicionales de una regla.
create or replace function public.notif_correos_adicionales(p_destinatarios jsonb)
returns setof text
language sql immutable set search_path to 'public'
as $$
  select distinct lower(trim(x))
  from jsonb_array_elements_text(
         case when jsonb_typeof(p_destinatarios -> 'correos_adicionales') = 'array'
              then p_destinatarios -> 'correos_adicionales' else '[]'::jsonb end) x
  where lower(trim(x)) ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
$$;

-- Encola el aviso por correo para cada correo adicional de la regla, sin duplicar a quien ya lo recibe como usuario.
create or replace function public.notif_emitir_correos_adicionales(
  p_empresa_id text, p_evento text, p_destinatarios jsonb, p_clave text,
  p_titulo text, p_mensaje text, p_payload jsonb, p_referencia_tipo text, p_referencia_id text)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_email text;
  v_id uuid;
  v_total integer := 0;
begin
  for v_email in select * from public.notif_correos_adicionales(p_destinatarios) limit 10 loop
    if exists (
      select 1 from public.notif_envios e
      where e.empresa_id = p_empresa_id and e.evento_codigo = p_evento and e.canal = 'correo'
        and e.clave_dedupe = p_clave and lower(coalesce(e.destinatario_email, '')) = v_email
    ) then
      continue;
    end if;
    v_id := null;
    insert into public.notif_envios
      (empresa_id, evento_codigo, canal, rol_destinatario, destinatario_user_id, destinatario_email, clave_dedupe,
       titulo, mensaje, payload, referencia_tipo, referencia_id, estado)
    values
      (p_empresa_id, p_evento, 'correo', 'correo_adicional', null, v_email, p_clave,
       p_titulo, p_mensaje, coalesce(p_payload, '{}'::jsonb), p_referencia_tipo, p_referencia_id, 'pendiente')
    on conflict (empresa_id, evento_codigo, canal, lower(destinatario_email), clave_dedupe)
      where destinatario_user_id is null do nothing
    returning id into v_id;
    if v_id is not null then
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

revoke all on function public.notif_emitir_correos_adicionales(text, text, jsonb, text, text, text, jsonb, text, text)
  from public, anon, authenticated;

-- Generador de contratos: idéntico a la 639 + llamada a correos adicionales por contrato.
create or replace function public.notif_generar_contratos_por_vencer(p_empresa_id text, p_hoy date default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_regla record; v_hoy date := coalesce(p_hoy, public.notif_hoy_lima()); v_dias int[]; v_max int; r record;
  v_umbral int; v_clave text; v_titulo text; v_mensaje text; v_payload jsonb; v_prioridad text;
  v_total integer := 0; v_canal text; v_u uuid;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'contrato_por_vencer' and activo;
  if not found then return 0; end if;
  select coalesce(array_agg(distinct x::int order by x::int), array[30,15,7]) into v_dias
  from jsonb_array_elements_text(coalesce(v_regla.parametros -> 'dias_anticipacion', '[]'::jsonb)) x
  where x ~ '^[0-9]+$' and x::int between 1 and 180;
  if v_dias is null or cardinality(v_dias) = 0 then v_dias := array[30,15,7]; end if;
  v_max := (select max(d) from unnest(v_dias) d);
  for r in
    select h.personal_id, h.personal_tipo, h.tipo_documento_id, h.tipo_doc_nombre, h.fecha_vencimiento, h.dias_restantes,
           coalesce(po.nombre, pa.nombre, 'Colaborador') as nombre,
           (select d.id from public.personal_documentos d
             where d.empresa_id = p_empresa_id and d.personal_id = h.personal_id
               and d.tipo_documento_id = h.tipo_documento_id and d.fecha_vencimiento = h.fecha_vencimiento
               and d.estado_validacion <> 'rechazado'
             order by coalesce(d.activo, false) desc, d.creado_en desc limit 1) as documento_id
    from public.calcular_habilitaciones_personal(p_empresa_id) h
    join public.tipos_documento_empresa t on t.id = h.tipo_documento_id and t.empresa_id = p_empresa_id
    left join public.personal_operativo po on h.personal_tipo = 'operativo' and po.id = h.personal_id and po.empresa_id = p_empresa_id
    left join public.personal_administrativo pa on h.personal_tipo = 'administrativo' and pa.id = h.personal_id and pa.empresa_id = p_empresa_id
    where t.categoria = 'Contractual' and t.exige_vencimiento and t.documento_padre_tipo_id is null
      and lower(t.nombre) not like '%adenda%'
      and h.estado in ('vigente','por_vencer') and h.fecha_vencimiento is not null
      and (h.fecha_vencimiento - v_hoy) between 0 and v_max
      and coalesce(pa.estado, po.estado, 'activo') <> 'inactivo'
      and not exists (
        select 1 from public.personal_documentos rf
        where rf.empresa_id = p_empresa_id and rf.personal_id = h.personal_id
          and rf.tipo_documento_id = h.tipo_documento_id and rf.contrato_referencia_id is null
          and rf.estado_validacion = 'aprobado'
          and coalesce(rf.periodo_fecha_inicio, rf.fecha_emision) > v_hoy
          and coalesce(rf.periodo_fecha_inicio, rf.fecha_emision) <= h.fecha_vencimiento + 1)
  loop
    select min(d) into v_umbral from unnest(v_dias) d where d >= (r.fecha_vencimiento - v_hoy);
    if v_umbral is null then continue; end if;
    v_clave := 'contrato:' || r.personal_tipo || ':' || r.personal_id || ':' || r.tipo_documento_id || ':'
               || r.fecha_vencimiento::text || ':' || v_umbral::text;
    v_titulo := 'Contrato por vencer';
    v_mensaje := r.nombre || ': el ' || lower(coalesce(r.tipo_doc_nombre, 'contrato')) || ' vence el '
                 || to_char(r.fecha_vencimiento, 'DD/MM/YYYY')
                 || case (r.fecha_vencimiento - v_hoy) when 0 then ' (hoy).' when 1 then ' (mañana).'
                    else ' (en ' || (r.fecha_vencimiento - v_hoy)::text || ' días).' end;
    v_prioridad := case when (r.fecha_vencimiento - v_hoy) <= 7 then 'alta' else 'media' end;
    v_payload := jsonb_build_object(
      'personal_id', r.personal_id, 'personal_tipo', r.personal_tipo, 'nombre', r.nombre,
      'tipo_documento', r.tipo_doc_nombre, 'fecha_vencimiento', r.fecha_vencimiento,
      'dias_restantes', r.fecha_vencimiento - v_hoy, 'umbral_dias', v_umbral, 'documento_id', r.documento_id);
    foreach v_canal in array array['campana','correo'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', v_canal) then
        for v_u in select user_id from public.notif_usuarios_rrhh(p_empresa_id) loop
          if public.notif_emitir(p_empresa_id, 'contrato_por_vencer', v_canal, 'rrhh', v_u, v_clave, v_titulo, v_mensaje,
                                 v_payload, 'personal_documento', r.documento_id, v_prioridad) then
            v_total := v_total + 1;
          end if;
        end loop;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
        if public.notif_emitir(p_empresa_id, 'contrato_por_vencer', v_canal, 'jefe', v_u, v_clave, v_titulo, v_mensaje,
                               v_payload, 'personal_documento', r.documento_id, v_prioridad) then
          v_total := v_total + 1;
        end if;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'colaborador', v_canal) then
        v_u := public.notif_usuario_colaborador(p_empresa_id, r.personal_tipo, r.personal_id);
        if public.notif_emitir(p_empresa_id, 'contrato_por_vencer', v_canal, 'colaborador', v_u, v_clave, v_titulo,
                               'Tu contrato vence el ' || to_char(r.fecha_vencimiento, 'DD/MM/YYYY') || '.',
                               v_payload, 'personal_documento', r.documento_id, v_prioridad) then
          v_total := v_total + 1;
        end if;
      end if;
    end loop;
    v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'contrato_por_vencer', v_regla.destinatarios,
                 v_clave, v_titulo, v_mensaje, v_payload, 'personal_documento', r.documento_id);
  end loop;
  return v_total;
end;
$$;

-- Generador de tardanzas: idéntico a la 639 + llamada a correos adicionales con el resumen de toda la empresa.
create or replace function public.notif_generar_tardanzas_resumen(p_empresa_id text, p_fecha date default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_regla record; v_fecha date := coalesce(p_fecha, public.notif_hoy_lima() - 1); v_umbral int;
  v_total integer := 0; v_items jsonb; v_n int; v_clave text; v_titulo text; v_mensaje text; v_canal text; v_u uuid; j record;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'tardanza_resumen_diario' and activo;
  if not found then return 0; end if;
  v_umbral := case when (v_regla.parametros ->> 'umbral_minutos') ~ '^[0-9]+$'
                   then least(greatest((v_regla.parametros ->> 'umbral_minutos')::int, 1), 480) else 10 end;
  create temporary table if not exists _notif_tardanzas (
    personal_tipo text, personal_id text, nombre text, minutos int, hora_entrada time, jefe uuid
  ) on commit drop;
  truncate _notif_tardanzas;
  insert into _notif_tardanzas
  select ra.trabajador_tipo, ra.trabajador_id, coalesce(po.nombre, pa.nombre, 'Colaborador'),
         coalesce(ra.tardanza_minutos, ra.tardanza_min), ra.hora_entrada,
         public.notif_jefe_directo(p_empresa_id, ra.trabajador_tipo, ra.trabajador_id)
  from public.registros_asistencia ra
  left join public.personal_operativo po on ra.trabajador_tipo = 'operativo' and po.id = ra.trabajador_id and po.empresa_id = ra.empresa_id
  left join public.personal_administrativo pa on ra.trabajador_tipo <> 'operativo' and pa.id = ra.trabajador_id and pa.empresa_id = ra.empresa_id
  where ra.empresa_id = p_empresa_id and ra.fecha = v_fecha and ra.anulado_en is null
    and not coalesce(ra.justificada, false)
    and coalesce(ra.tardanza_minutos, ra.tardanza_min, 0) > v_umbral;
  select count(*) into v_n from _notif_tardanzas;
  if v_n = 0 then return 0; end if;
  v_clave := 'tardanzas:' || v_fecha::text;
  v_titulo := 'Tardanzas del ' || to_char(v_fecha, 'DD/MM/YYYY');
  select jsonb_agg(jsonb_build_object('nombre', nombre, 'minutos', minutos, 'hora_entrada', to_char(hora_entrada, 'HH24:MI'))
                   order by minutos desc, nombre) into v_items from _notif_tardanzas;
  v_mensaje := v_n::text || case when v_n = 1 then ' colaborador llegó' else ' colaboradores llegaron' end
               || ' con más de ' || v_umbral::text || ' min de tardanza: '
               || (select string_agg(nombre || ' (' || minutos::text || ' min)', ', ' order by minutos desc, nombre)
                   from (select * from _notif_tardanzas order by minutos desc, nombre limit 5) t)
               || case when v_n > 5 then ' y ' || (v_n - 5)::text || ' más.' else '.' end;
  foreach v_canal in array array['campana','correo'] loop
    if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', v_canal) then
      for v_u in select user_id from public.notif_usuarios_rrhh(p_empresa_id) loop
        if public.notif_emitir(p_empresa_id, 'tardanza_resumen_diario', v_canal, 'rrhh', v_u, v_clave, v_titulo, v_mensaje,
             jsonb_build_object('fecha', v_fecha, 'umbral_minutos', v_umbral, 'total', v_n, 'alcance', 'empresa', 'items', v_items),
             'asistencia_fecha', v_fecha::text, 'media') then
          v_total := v_total + 1;
        end if;
      end loop;
    end if;
  end loop;
  v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'tardanza_resumen_diario', v_regla.destinatarios,
               v_clave, v_titulo, v_mensaje,
               jsonb_build_object('fecha', v_fecha, 'umbral_minutos', v_umbral, 'total', v_n, 'alcance', 'empresa', 'items', v_items),
               'asistencia_fecha', v_fecha::text);
  for j in
    select jefe, count(*)::int as n,
           jsonb_agg(jsonb_build_object('nombre', nombre, 'minutos', minutos, 'hora_entrada', to_char(hora_entrada, 'HH24:MI'))
                     order by minutos desc, nombre) as items,
           string_agg(nombre || ' (' || minutos::text || ' min)', ', ' order by minutos desc, nombre) as lista
    from _notif_tardanzas where jefe is not null group by jefe
  loop
    foreach v_canal in array array['campana','correo'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        if public.notif_emitir(p_empresa_id, 'tardanza_resumen_diario', v_canal, 'jefe', j.jefe, v_clave, v_titulo,
             'Tu equipo: ' || j.n::text || case when j.n = 1 then ' tardanza' else ' tardanzas' end
               || ' de más de ' || v_umbral::text || ' min: ' || j.lista || '.',
             jsonb_build_object('fecha', v_fecha, 'umbral_minutos', v_umbral, 'total', j.n, 'alcance', 'equipo', 'items', j.items),
             'asistencia_fecha', v_fecha::text, 'media') then
          v_total := v_total + 1;
        end if;
      end if;
    end loop;
  end loop;
  return v_total;
end;
$$;

-- Guardar regla: idéntico a la 639 + validación y guardado de correos_adicionales.
create or replace function public.notif_config_guardar(
  p_empresa_id text, p_evento text, p_activo boolean, p_parametros jsonb, p_destinatarios jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cat record; v_dest jsonb := '{}'::jsonb; v_rol text; v_canal text; v_param jsonb := '{}'::jsonb; v_dias int[]; v_umbral int;
  v_correos text[]; v_invalidos text[];
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  select * into v_cat from public.notif_eventos_catalogo where codigo = p_evento;
  if not found then raise exception 'Evento de notificación desconocido: %', p_evento; end if;
  if v_cat.legado then raise exception 'Este evento lo gestiona el sistema y no se puede configurar.'; end if;
  foreach v_rol in array v_cat.roles_soportados loop
    v_dest := v_dest || jsonb_build_object(v_rol, '{}'::jsonb);
    foreach v_canal in array v_cat.canales_soportados loop
      v_dest := jsonb_set(v_dest, array[v_rol, v_canal],
                  to_jsonb(coalesce((p_destinatarios -> v_rol ->> v_canal)::boolean, false)));
    end loop;
  end loop;

  if jsonb_typeof(p_destinatarios -> 'correos_adicionales') = 'array' then
    select array_agg(distinct lower(trim(x))) filter (where nullif(trim(x), '') is not null),
           array_agg(distinct trim(x)) filter (where nullif(trim(x), '') is not null
                                               and lower(trim(x)) !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$')
      into v_correos, v_invalidos
    from jsonb_array_elements_text(p_destinatarios -> 'correos_adicionales') x;
    if v_invalidos is not null and cardinality(v_invalidos) > 0 then
      raise exception 'Correo no válido: %', array_to_string(v_invalidos, ', ');
    end if;
    if v_correos is not null and cardinality(v_correos) > 10 then
      raise exception 'Puedes agregar hasta 10 correos adicionales por evento.';
    end if;
  end if;
  v_dest := v_dest || jsonb_build_object('correos_adicionales',
              coalesce(to_jsonb((select array_agg(c order by c) from unnest(v_correos) c)), '[]'::jsonb));

  if p_evento = 'contrato_por_vencer' then
    select array_agg(distinct x::int order by x::int desc) into v_dias
    from jsonb_array_elements_text(coalesce(p_parametros -> 'dias_anticipacion', '[]'::jsonb)) x
    where x ~ '^[0-9]+$';
    if v_dias is null or cardinality(v_dias) = 0 or cardinality(v_dias) > 5
       or exists (select 1 from unnest(v_dias) d where d < 1 or d > 180) then
      raise exception 'Indica entre 1 y 5 avisos, cada uno entre 1 y 180 días antes del vencimiento.';
    end if;
    v_param := jsonb_build_object('dias_anticipacion', to_jsonb(v_dias));
  elsif p_evento = 'tardanza_resumen_diario' then
    v_umbral := case when (p_parametros ->> 'umbral_minutos') ~ '^[0-9]+$' then (p_parametros ->> 'umbral_minutos')::int end;
    if v_umbral is null or v_umbral < 1 or v_umbral > 480 then
      raise exception 'El umbral de tardanza debe estar entre 1 y 480 minutos.';
    end if;
    v_param := jsonb_build_object('umbral_minutos', v_umbral);
  end if;
  insert into public.notif_reglas_empresa (empresa_id, evento_codigo, activo, parametros, destinatarios, actualizado_por, actualizado_en)
  values (p_empresa_id, p_evento, coalesce(p_activo, false), v_param, v_dest, auth.uid(), now())
  on conflict (empresa_id, evento_codigo) do update set
    activo = excluded.activo, parametros = excluded.parametros, destinatarios = excluded.destinatarios,
    actualizado_por = excluded.actualizado_por, actualizado_en = now();
end;
$$;

-- Historial: idéntico a la 639, con el correo como nombre cuando el destinatario no es usuario.
create or replace function public.notif_envios_listar(p_empresa_id text, p_limite integer default 100)
returns table(
  id uuid, evento_codigo text, evento_nombre text, canal text, rol_destinatario text, destinatario_nombre text,
  destinatario_email text, titulo text, mensaje text, estado text, intentos integer, ultimo_error text,
  creado_en timestamptz, enviado_en timestamptz)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  return query
  select e.id, e.evento_codigo, c.nombre, e.canal, e.rol_destinatario,
         coalesce(nullif(us.nombre, ''), nullif(u.raw_user_meta_data ->> 'nombre', ''), u.email, e.destinatario_email)::text,
         e.destinatario_email, e.titulo, e.mensaje, e.estado, e.intentos, e.ultimo_error, e.creado_en, e.enviado_en
  from public.notif_envios e
  join public.notif_eventos_catalogo c on c.codigo = e.evento_codigo
  left join auth.users u on u.id = e.destinatario_user_id
  left join public.usuarios us on us.id = e.destinatario_user_id::text
  where e.empresa_id = p_empresa_id
  order by e.creado_en desc
  limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notif_envios'
             and column_name='destinatario_user_id' and is_nullable='NO') then
    raise exception '641: destinatario_user_id sigue siendo NOT NULL';
  end if;
  if to_regclass('public.notif_envios_correo_adicional_uidx') is null then
    raise exception '641: falta el índice de dedupe de correos adicionales';
  end if;
  if position('notif_emitir_correos_adicionales' in pg_get_functiondef('public.notif_generar_contratos_por_vencer(text,date)'::regprocedure)) = 0
     or position('notif_emitir_correos_adicionales' in pg_get_functiondef('public.notif_generar_tardanzas_resumen(text,date)'::regprocedure)) = 0 then
    raise exception '641: los generadores no llaman a los correos adicionales';
  end if;
  if (select count(*) from public.notif_correos_adicionales('{"correos_adicionales":["A@x.com"," a@x.com","malo"]}'::jsonb)) <> 1 then
    raise exception '641: la normalización de correos falló';
  end if;
  if exists (select 1 from public.notif_reglas_empresa where activo) then
    raise exception '641: no debía haber reglas activas';
  end if;
end $$;

commit;
