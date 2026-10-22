-- 648: Fase 3 del motor de notificaciones. Dos eventos nuevos configurables por empresa (nacen desactivados).
-- * documento_por_vencer: documentos del personal con vencimiento que NO son contratos. Campana: un aviso por
--   documento y umbral (30/15/7 por defecto). Correo: resumen diario por destinatario ('documentos:diario:<fecha>').
-- * contrato_vencido: contratos vencidos sin renovación aprobada de colaboradores activos, vencidos hace 1..N días
--   (dias_vencido_max, 30 por defecto). Campana: una vez por contrato. Correo: lista diaria ('contratos_vencidos:diario:<fecha>').
-- Además: la rutina por empresa ejecuta los 4 generadores; notif_config_guardar valida los parámetros nuevos; el sistema
-- antiguo deja de avisar en campana lo que cubren los eventos nuevos solo en las empresas que los activan.
-- notif_config_guardar y generar_notificaciones_documentarias_base_213 se reconstruyen desde pg_get_functiondef vigente
-- con reemplazos verificados. procesar_contratos_vencimiento no se toca.

begin;

create or replace function public.notif_generar_documentos_por_vencer(p_empresa_id text, p_hoy date default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_regla record; v_hoy date := coalesce(p_hoy, public.notif_hoy_lima()); v_dias int[]; v_max int; r record;
  v_umbral int; v_clave text; v_titulo text; v_mensaje text; v_payload jsonb; v_prioridad text;
  v_total integer := 0; v_canal text; v_u uuid;
  v_item jsonb; v_res record; v_clave_dig text; v_lista text;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'documento_por_vencer' and activo;
  if not found then return 0; end if;
  select coalesce(array_agg(distinct x::int order by x::int), array[30,15,7]) into v_dias
  from jsonb_array_elements_text(coalesce(v_regla.parametros -> 'dias_anticipacion', '[]'::jsonb)) x
  where x ~ '^[0-9]+$' and x::int between 1 and 180;
  if v_dias is null or cardinality(v_dias) = 0 then v_dias := array[30,15,7]; end if;
  v_max := (select max(d) from unnest(v_dias) d);
  create temporary table if not exists _notif_documentos_correo (
    rol text, user_id uuid, email text, clave text, item jsonb
  ) on commit drop;
  truncate _notif_documentos_correo;
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
    where not (coalesce(t.categoria, '') = 'Contractual' or coalesce(t.captura_snapshot_laboral, false) or lower(t.nombre) like '%contrat%')
      and t.exige_vencimiento
      and h.estado in ('vigente','por_vencer') and h.fecha_vencimiento is not null
      and (h.fecha_vencimiento - v_hoy) between 0 and v_max
      and coalesce(pa.estado, po.estado, 'activo') <> 'inactivo'
  loop
    select min(d) into v_umbral from unnest(v_dias) d where d >= (r.fecha_vencimiento - v_hoy);
    if v_umbral is null then continue; end if;
    v_clave := 'documento:' || r.personal_tipo || ':' || r.personal_id || ':' || r.tipo_documento_id || ':'
               || r.fecha_vencimiento::text || ':' || v_umbral::text;
    v_titulo := 'Documento por vencer';
    v_mensaje := r.nombre || ': ' || coalesce(r.tipo_doc_nombre, 'documento') || ' vence el '
                 || to_char(r.fecha_vencimiento, 'DD/MM/YYYY')
                 || case (r.fecha_vencimiento - v_hoy) when 0 then ' (hoy).' when 1 then ' (mañana).'
                    else ' (en ' || (r.fecha_vencimiento - v_hoy)::text || ' días).' end;
    v_prioridad := case when (r.fecha_vencimiento - v_hoy) <= 7 then 'alta' else 'media' end;
    v_payload := jsonb_build_object(
      'personal_id', r.personal_id, 'personal_tipo', r.personal_tipo, 'nombre', r.nombre,
      'tipo_documento', r.tipo_doc_nombre, 'fecha_vencimiento', r.fecha_vencimiento,
      'dias_restantes', r.fecha_vencimiento - v_hoy, 'umbral_dias', v_umbral, 'documento_id', r.documento_id);
    v_item := jsonb_build_object('nombre', r.nombre, 'tipo_documento', r.tipo_doc_nombre,
      'fecha_vencimiento', r.fecha_vencimiento, 'dias_restantes', r.fecha_vencimiento - v_hoy,
      'clave', v_clave, 'documento_id', r.documento_id);
    -- Campana: un aviso por documento y por umbral.
    foreach v_canal in array array['campana'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', v_canal) then
        for v_u in select user_id from public.notif_usuarios_rrhh(p_empresa_id) loop
          if public.notif_emitir(p_empresa_id, 'documento_por_vencer', v_canal, 'rrhh', v_u, v_clave, v_titulo, v_mensaje,
                                 v_payload, 'personal_documento', r.documento_id, v_prioridad) then
            v_total := v_total + 1;
          end if;
        end loop;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
        if public.notif_emitir(p_empresa_id, 'documento_por_vencer', v_canal, 'jefe', v_u, v_clave, v_titulo, v_mensaje,
                               v_payload, 'personal_documento', r.documento_id, v_prioridad) then
          v_total := v_total + 1;
        end if;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'colaborador', v_canal) then
        v_u := public.notif_usuario_colaborador(p_empresa_id, r.personal_tipo, r.personal_id);
        if public.notif_emitir(p_empresa_id, 'documento_por_vencer', v_canal, 'colaborador', v_u, v_clave, v_titulo,
                               'Tu ' || coalesce(r.tipo_doc_nombre, 'documento') || ' vence el ' || to_char(r.fecha_vencimiento, 'DD/MM/YYYY') || '.',
                               v_payload, 'personal_documento', r.documento_id, v_prioridad) then
          v_total := v_total + 1;
        end if;
      end if;
    end loop;
    -- Correo: se acumula por destinatario y se envía un resumen diario al final.
    if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', 'correo') then
      insert into _notif_documentos_correo (rol, user_id, clave, item)
      select 'rrhh', u.user_id, v_clave, v_item from public.notif_usuarios_rrhh(p_empresa_id) u;
    end if;
    if public.notif_destino_activo(v_regla.destinatarios, 'jefe', 'correo') then
      v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
      if v_u is not null then
        insert into _notif_documentos_correo (rol, user_id, clave, item) values ('jefe', v_u, v_clave, v_item);
      end if;
    end if;
    if public.notif_destino_activo(v_regla.destinatarios, 'colaborador', 'correo') then
      v_u := public.notif_usuario_colaborador(p_empresa_id, r.personal_tipo, r.personal_id);
      if v_u is not null then
        insert into _notif_documentos_correo (rol, user_id, clave, item) values ('colaborador', v_u, v_clave, v_item);
      end if;
    end if;
    insert into _notif_documentos_correo (rol, email, clave, item)
    select 'correo_adicional', e, v_clave, v_item
    from (select * from public.notif_correos_adicionales(v_regla.destinatarios) limit 10) a(e);
  end loop;

  -- Resumen diario por correo: un envío por destinatario y por día con todos los documentos dentro del rango.
  update _notif_documentos_correo c set email = lower(u.email)
  from auth.users u where c.user_id is not null and u.id = c.user_id;
  delete from _notif_documentos_correo a
  where a.user_id is null and exists (
    select 1 from _notif_documentos_correo b where b.user_id is not null and b.email = a.email and b.clave = a.clave);

  for v_res in
    select x.user_id, x.email, min(x.rol) as rol,
           jsonb_agg(x.item order by (x.item ->> 'dias_restantes')::int, x.item ->> 'nombre') as items,
           jsonb_agg(x.clave order by x.clave) as claves,
           count(*)::int as n,
           min((x.item ->> 'dias_restantes')::int) as min_dias
    from (select distinct on (coalesce(c.user_id::text, c.email), c.clave) c.*
          from _notif_documentos_correo c
          order by coalesce(c.user_id::text, c.email), c.clave, c.rol) x
    group by x.user_id, x.email
  loop
    v_clave_dig := 'documentos:diario:' || v_hoy::text;
    select string_agg((i ->> 'nombre') || ' (' || to_char((i ->> 'fecha_vencimiento')::date, 'DD/MM') || ')', ', ')
      into v_lista
    from (select t.i from jsonb_array_elements(v_res.items) as t(i) limit 5) s;
    v_mensaje := v_res.n::text || case when v_res.n = 1 then ' documento vence pronto: ' else ' documentos vencen pronto: ' end
                 || v_lista || case when v_res.n > 5 then ' y ' || (v_res.n - 5)::text || ' más.' else '.' end;
    v_payload := jsonb_build_object('resumen', true, 'fecha', v_hoy, 'total', v_res.n, 'items', v_res.items, 'claves', v_res.claves);
    if v_res.user_id is not null then
      if public.notif_emitir(p_empresa_id, 'documento_por_vencer', 'correo', v_res.rol, v_res.user_id, v_clave_dig,
                             'Documentos por vencer', v_mensaje, v_payload, 'documentos_resumen', v_hoy::text,
                             case when v_res.min_dias <= 7 then 'alta' else 'media' end) then
        v_total := v_total + 1;
      end if;
    else
      v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'documento_por_vencer',
                   jsonb_build_object('correos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Documentos por vencer', v_mensaje, v_payload, 'documentos_resumen', v_hoy::text);
    end if;
  end loop;
  return v_total;
end;
$$;

create or replace function public.notif_generar_contratos_vencidos(p_empresa_id text, p_hoy date default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_regla record; v_hoy date := coalesce(p_hoy, public.notif_hoy_lima()); v_max int; r record;
  v_clave text; v_titulo text; v_mensaje text; v_payload jsonb;
  v_total integer := 0; v_u uuid;
  v_item jsonb; v_res record; v_clave_dig text; v_lista text;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'contrato_vencido' and activo;
  if not found then return 0; end if;
  v_max := case when (v_regla.parametros ->> 'dias_vencido_max') ~ '^[0-9]+$'
                then least(greatest((v_regla.parametros ->> 'dias_vencido_max')::int, 1), 365) else 30 end;
  create temporary table if not exists _notif_vencidos_correo (
    rol text, user_id uuid, email text, clave text, item jsonb
  ) on commit drop;
  truncate _notif_vencidos_correo;
  for r in
    select h.personal_id, h.personal_tipo, h.tipo_documento_id, h.tipo_doc_nombre, h.fecha_vencimiento,
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
    where (t.categoria = 'Contractual' or coalesce(t.captura_snapshot_laboral, false) or lower(t.nombre) like '%contrat%')
      and t.exige_vencimiento and t.documento_padre_tipo_id is null
      and lower(t.nombre) not like '%adenda%'
      and h.estado = 'vencido' and h.fecha_vencimiento is not null
      and (v_hoy - h.fecha_vencimiento) between 1 and v_max
      and coalesce(pa.estado, po.estado, 'activo') <> 'inactivo'
      and not exists (
        select 1 from public.personal_documentos rf
        where rf.empresa_id = p_empresa_id and rf.personal_id = h.personal_id
          and rf.tipo_documento_id = h.tipo_documento_id and rf.contrato_referencia_id is null
          and rf.estado_validacion = 'aprobado'
          and coalesce(rf.periodo_fecha_inicio, rf.fecha_emision) > h.fecha_vencimiento)
  loop
    v_clave := 'contrato_vencido:' || r.personal_tipo || ':' || r.personal_id || ':' || r.tipo_documento_id || ':'
               || r.fecha_vencimiento::text;
    v_titulo := 'Contrato vencido';
    v_mensaje := r.nombre || ': el ' || lower(coalesce(r.tipo_doc_nombre, 'contrato')) || ' venció el '
                 || to_char(r.fecha_vencimiento, 'DD/MM/YYYY') || ' y no tiene renovación.';
    v_payload := jsonb_build_object(
      'personal_id', r.personal_id, 'personal_tipo', r.personal_tipo, 'nombre', r.nombre,
      'tipo_documento', r.tipo_doc_nombre, 'fecha_vencimiento', r.fecha_vencimiento,
      'dias_vencido', v_hoy - r.fecha_vencimiento, 'documento_id', r.documento_id);
    v_item := jsonb_build_object('nombre', r.nombre, 'tipo_documento', r.tipo_doc_nombre,
      'fecha_vencimiento', r.fecha_vencimiento, 'dias_vencido', v_hoy - r.fecha_vencimiento,
      'clave', v_clave, 'documento_id', r.documento_id);
    -- Campana: un aviso por contrato vencido, una sola vez (la clave no depende del día).
    if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', 'campana') then
      for v_u in select user_id from public.notif_usuarios_rrhh(p_empresa_id) loop
        if public.notif_emitir(p_empresa_id, 'contrato_vencido', 'campana', 'rrhh', v_u, v_clave, v_titulo, v_mensaje,
                               v_payload, 'personal_documento', r.documento_id, 'alta') then
          v_total := v_total + 1;
        end if;
      end loop;
    end if;
    if public.notif_destino_activo(v_regla.destinatarios, 'jefe', 'campana') then
      v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
      if public.notif_emitir(p_empresa_id, 'contrato_vencido', 'campana', 'jefe', v_u, v_clave, v_titulo, v_mensaje,
                             v_payload, 'personal_documento', r.documento_id, 'alta') then
        v_total := v_total + 1;
      end if;
    end if;
    -- Correo: se acumula por destinatario y se envía una lista diaria al final.
    if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', 'correo') then
      insert into _notif_vencidos_correo (rol, user_id, clave, item)
      select 'rrhh', u.user_id, v_clave, v_item from public.notif_usuarios_rrhh(p_empresa_id) u;
    end if;
    if public.notif_destino_activo(v_regla.destinatarios, 'jefe', 'correo') then
      v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
      if v_u is not null then
        insert into _notif_vencidos_correo (rol, user_id, clave, item) values ('jefe', v_u, v_clave, v_item);
      end if;
    end if;
    insert into _notif_vencidos_correo (rol, email, clave, item)
    select 'correo_adicional', e, v_clave, v_item
    from (select * from public.notif_correos_adicionales(v_regla.destinatarios) limit 10) a(e);
  end loop;

  -- Lista diaria por correo: un envío por destinatario y por día con todos los contratos vencidos del rango.
  update _notif_vencidos_correo c set email = lower(u.email)
  from auth.users u where c.user_id is not null and u.id = c.user_id;
  delete from _notif_vencidos_correo a
  where a.user_id is null and exists (
    select 1 from _notif_vencidos_correo b where b.user_id is not null and b.email = a.email and b.clave = a.clave);

  for v_res in
    select x.user_id, x.email, min(x.rol) as rol,
           jsonb_agg(x.item order by (x.item ->> 'dias_vencido')::int desc, x.item ->> 'nombre') as items,
           jsonb_agg(x.clave order by x.clave) as claves,
           count(*)::int as n
    from (select distinct on (coalesce(c.user_id::text, c.email), c.clave) c.*
          from _notif_vencidos_correo c
          order by coalesce(c.user_id::text, c.email), c.clave, c.rol) x
    group by x.user_id, x.email
  loop
    v_clave_dig := 'contratos_vencidos:diario:' || v_hoy::text;
    select string_agg((i ->> 'nombre') || ' (' || to_char((i ->> 'fecha_vencimiento')::date, 'DD/MM') || ')', ', ')
      into v_lista
    from (select t.i from jsonb_array_elements(v_res.items) as t(i) limit 5) s;
    v_mensaje := v_res.n::text || case when v_res.n = 1 then ' contrato vencido sin renovar: ' else ' contratos vencidos sin renovar: ' end
                 || v_lista || case when v_res.n > 5 then ' y ' || (v_res.n - 5)::text || ' más.' else '.' end;
    v_payload := jsonb_build_object('resumen', true, 'fecha', v_hoy, 'total', v_res.n, 'items', v_res.items, 'claves', v_res.claves);
    if v_res.user_id is not null then
      if public.notif_emitir(p_empresa_id, 'contrato_vencido', 'correo', v_res.rol, v_res.user_id, v_clave_dig,
                             'Contratos vencidos sin renovar', v_mensaje, v_payload, 'contratos_vencidos_resumen', v_hoy::text,
                             'alta') then
        v_total := v_total + 1;
      end if;
    else
      v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'contrato_vencido',
                   jsonb_build_object('correos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Contratos vencidos sin renovar', v_mensaje, v_payload, 'contratos_vencidos_resumen', v_hoy::text);
    end if;
  end loop;
  return v_total;
end;
$$;

create or replace function public.notif_ejecutar_empresa(p_empresa_id text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_n integer; v_res jsonb := '{}'::jsonb; v_ev text;
begin
  foreach v_ev in array array['contrato_por_vencer', 'contrato_vencido', 'documento_por_vencer', 'tardanza_resumen_diario'] loop
    begin
      v_n := case v_ev
        when 'contrato_por_vencer' then public.notif_generar_contratos_por_vencer(p_empresa_id)
        when 'contrato_vencido' then public.notif_generar_contratos_vencidos(p_empresa_id)
        when 'documento_por_vencer' then public.notif_generar_documentos_por_vencer(p_empresa_id)
        when 'tardanza_resumen_diario' then public.notif_generar_tardanzas_resumen(p_empresa_id)
      end;
      insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, generadas) values (p_empresa_id, v_ev, 'ok', v_n);
      v_res := v_res || jsonb_build_object(v_ev, v_n);
    exception when others then
      insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, detalle) values (p_empresa_id, v_ev, 'error', sqlerrm);
      v_res := v_res || jsonb_build_object(v_ev, 'error');
    end;
  end loop;
  return v_res;
end;
$$;

revoke all on function public.notif_generar_documentos_por_vencer(text, date) from public, anon, authenticated;
revoke all on function public.notif_generar_contratos_vencidos(text, date) from public, anon, authenticated;

-- Validación de parámetros al guardar: documento_por_vencer usa la misma regla de días que contratos;
-- contrato_vencido acepta dias_vencido_max entre 1 y 365. Se reconstruye desde la definición vigente.
do $$
declare
  v_def text := pg_get_functiondef('public.notif_config_guardar(text,text,boolean,jsonb,jsonb)'::regprocedure);
  v_a_old text := 'if p_evento = ''contrato_por_vencer'' then';
  v_a_new text := 'if p_evento in (''contrato_por_vencer'', ''documento_por_vencer'') then';
  v_b_old text := 'elsif p_evento = ''tardanza_resumen_diario'' then';
  v_b_new text := 'elsif p_evento = ''contrato_vencido'' then
    v_umbral := case when (p_parametros ->> ''dias_vencido_max'') ~ ''^[0-9]+$'' then (p_parametros ->> ''dias_vencido_max'')::int end;
    if v_umbral is null or v_umbral < 1 or v_umbral > 365 then
      raise exception ''Indica cuántos días atrás avisar contratos vencidos, entre 1 y 365.'';
    end if;
    v_param := jsonb_build_object(''dias_vencido_max'', v_umbral);
  elsif p_evento = ''tardanza_resumen_diario'' then';
begin
  if position('dias_vencido_max' in v_def) > 0 then
    raise exception '648: notif_config_guardar ya tiene la validación de contrato_vencido';
  end if;
  if (length(v_def) - length(replace(v_def, v_a_old, ''))) / length(v_a_old) <> 1
     or (length(v_def) - length(replace(v_def, v_b_old, ''))) / length(v_b_old) <> 1 then
    raise exception '648: notif_config_guardar no tiene la forma esperada';
  end if;
  execute replace(replace(v_def, v_a_old, v_a_new), v_b_old, v_b_new);
end $$;

-- Sistema antiguo (generar_notificaciones_documentarias_base_213): deja de avisar en la campana lo que cubren
-- los eventos nuevos cuando la empresa los tiene activos. Documentos no contractuales por vencer
-- (documento_por_vencer) y contratos vencidos (contrato_vencido). Se reconstruye desde la definición vigente (644).
do $$
declare
  v_def text := pg_get_functiondef('public.generar_notificaciones_documentarias_base_213(text)'::regprocedure);
  v_old text := 'where estado in (''por_vencer'', ''vencido'')';
  v_new text := 'where estado in (''por_vencer'', ''vencido'')
            and not (
              estado = ''por_vencer''
              and exists (
                select 1 from public.notif_reglas_empresa nr
                where nr.empresa_id = v_emp.id and nr.evento_codigo = ''documento_por_vencer'' and nr.activo
              )
              and not exists (
                select 1 from public.tipos_documento_empresa td
                where td.id = tipo_documento_id
                  and (coalesce(td.categoria, '''') = ''Contractual'' or coalesce(td.captura_snapshot_laboral, false) or lower(td.nombre) like ''%contrat%'')
              )
            )
            and not (
              estado = ''vencido''
              and exists (
                select 1 from public.notif_reglas_empresa nr
                where nr.empresa_id = v_emp.id and nr.evento_codigo = ''contrato_vencido'' and nr.activo
              )
              and exists (
                select 1 from public.tipos_documento_empresa td
                where td.id = tipo_documento_id
                  and (td.categoria = ''Contractual'' or coalesce(td.captura_snapshot_laboral, false) or lower(td.nombre) like ''%contrat%'')
                  and td.documento_padre_tipo_id is null
                  and lower(td.nombre) not like ''%adenda%''
              )
            )';
  v_ocurrencias int;
begin
  if position('nr.evento_codigo = ''documento_por_vencer''' in v_def) > 0 then
    raise exception '648: el sistema antiguo ya tiene la exclusión de la fase 3';
  end if;
  v_ocurrencias := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_ocurrencias <> 1 then
    raise exception '648: se esperaba 1 ocurrencia del filtro de estado y hay %', v_ocurrencias;
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

insert into public.notif_eventos_catalogo
  (codigo, modulo, nombre, descripcion, legado, canales_soportados, roles_soportados, parametros_default, destinatarios_default, orden)
values
  ('contrato_vencido', 'rrhh', 'Contrato vencido',
   'Avisa cuando el contrato de un colaborador activo venció y no tiene renovación aprobada. En la campana avisa una vez por contrato; por correo llega una lista diaria con los contratos vencidos de los últimos días configurados.',
   false, array['campana','correo'], array['rrhh','jefe'], '{"dias_vencido_max": 30}'::jsonb,
   '{"rrhh": {"campana": true, "correo": true}, "jefe": {"campana": true, "correo": false}}'::jsonb, 12),
  ('documento_por_vencer', 'rrhh', 'Documento por vencer',
   'Avisa con anticipación cuando un documento del personal que no es contrato está por vencer (por ejemplo, identificación, SCTR o exámenes). En la campana avisa una vez por cada umbral; por correo llega un resumen diario con todos los documentos dentro del rango.',
   false, array['campana','correo'], array['rrhh','jefe','colaborador'], '{"dias_anticipacion": [30, 15, 7]}'::jsonb,
   '{"rrhh": {"campana": true, "correo": true}, "jefe": {"campana": true, "correo": false}, "colaborador": {"campana": false, "correo": false}}'::jsonb, 15)
on conflict (codigo) do nothing;

update public.notif_eventos_catalogo
   set descripcion = 'Aviso en campana de documentos del personal próximos a vencer, según los días de alerta de cada tipo de documento. Si la empresa activa «Contrato por vencer» o «Documento por vencer», esos documentos se avisan solo por el evento nuevo.'
 where codigo = 'doc_por_vencer';
update public.notif_eventos_catalogo
   set descripcion = 'Aviso en campana de documentos del personal ya vencidos. Si la empresa activa «Contrato vencido», los contratos vencidos se avisan solo por ese evento.'
 where codigo = 'doc_vencido';

do $$
declare v_def text;
begin
  if (select count(*) from public.notif_eventos_catalogo where codigo in ('contrato_vencido', 'documento_por_vencer') and not legado) <> 2 then
    raise exception '648: faltan los eventos nuevos en el catálogo';
  end if;
  v_def := pg_get_functiondef('public.notif_ejecutar_empresa(text)'::regprocedure);
  if position('notif_generar_contratos_vencidos' in v_def) = 0 or position('notif_generar_documentos_por_vencer' in v_def) = 0
     or position('notif_generar_tardanzas_resumen' in v_def) = 0 or position('notif_generar_contratos_por_vencer' in v_def) = 0 then
    raise exception '648: la rutina por empresa no llama a los cuatro generadores';
  end if;
  v_def := pg_get_functiondef('public.notif_config_guardar(text,text,boolean,jsonb,jsonb)'::regprocedure);
  if position('dias_vencido_max' in v_def) = 0 or position('''documento_por_vencer''' in v_def) = 0
     or position('correos_adicionales' in v_def) = 0 or position('umbral_minutos' in v_def) = 0 then
    raise exception '648: notif_config_guardar quedó incompleta';
  end if;
  v_def := pg_get_functiondef('public.generar_notificaciones_documentarias_base_213(text)'::regprocedure);
  if position('nr.evento_codigo = ''documento_por_vencer''' in v_def) = 0
     or position('nr.evento_codigo = ''contrato_vencido''' in v_def) = 0
     or position('nr.evento_codigo = ''contrato_por_vencer''' in v_def) = 0
     or position('Solicita la renovacion' in v_def) = 0 then
    raise exception '648: el sistema antiguo quedó incompleto';
  end if;
  v_def := pg_get_functiondef('public.notif_generar_documentos_por_vencer(text,date)'::regprocedure);
  if position('documentos:diario:' in v_def) = 0 or position('not (coalesce(t.categoria' in v_def) = 0 then
    raise exception '648: generador de documentos incompleto';
  end if;
  v_def := pg_get_functiondef('public.notif_generar_contratos_vencidos(text,date)'::regprocedure);
  if position('contratos_vencidos:diario:' in v_def) = 0 or position('dias_vencido_max' in v_def) = 0 then
    raise exception '648: generador de contratos vencidos incompleto';
  end if;
end $$;

commit;
