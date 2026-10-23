-- 649: Fase 2 del motor de notificaciones — WhatsApp como tercer canal (campana, correo, whatsapp).
-- * notif_envios admite canal 'whatsapp', guarda destinatario_telefono y el estado 'simulado' (sin credenciales de Meta).
-- * Teléfonos: el de cada usuario interno vive en public.usuarios.telefono (normalizado a formato internacional, p. ej. 51987654321);
--   por evento se pueden agregar hasta 10 "teléfonos adicionales" (destinatarios.telefonos_adicionales), igual que correos.
-- * Los generadores de contratos por vencer, contratos vencidos, documentos por vencer y tardanzas emiten también por WhatsApp
--   el mismo resumen diario (un mensaje por destinatario y por día) cuando el rol tiene el canal activo.
-- * Cola: notif_reclamar_whatsapp / notif_marcar_whatsapp (solo service_role); el cron dispara el dispatcher si hay correos o
--   WhatsApp pendientes. Alcance: solo destinatarios internos (RRHH, jefe directo, teléfonos adicionales).
-- * Todo nace apagado: ningún rol tiene WhatsApp activo hasta que el administrador lo marque en Configuración › Notificaciones.
-- Funciones existentes reconstruidas desde pg_get_functiondef vigente (646/648) con cambios verificados.

begin;

-- 1. Teléfonos ---------------------------------------------------------------------------------------------------------
create or replace function public.notif_normalizar_telefono(p_telefono text)
returns text
language plpgsql immutable set search_path to 'public'
as $$
declare v_raw text := trim(coalesce(p_telefono, '')); v_dig text;
begin
  v_dig := regexp_replace(v_raw, '[^0-9]', '', 'g');
  if v_dig = '' then return null; end if;
  if length(v_dig) = 9 and left(v_dig, 1) = '9' then return '51' || v_dig; end if;
  if length(v_dig) = 11 and left(v_dig, 3) = '519' then return v_dig; end if;
  if left(v_raw, 1) = '+' and length(v_dig) between 10 and 15 then return v_dig; end if;
  return null;
end;
$$;

create or replace function public.notif_telefonos_adicionales(p_destinatarios jsonb)
returns setof text
language sql immutable set search_path to 'public'
as $$
  select distinct public.notif_normalizar_telefono(x)
  from jsonb_array_elements_text(
         case when jsonb_typeof(p_destinatarios -> 'telefonos_adicionales') = 'array'
              then p_destinatarios -> 'telefonos_adicionales' else '[]'::jsonb end) x
  where public.notif_normalizar_telefono(x) is not null
$$;

-- 2. Cola: canal whatsapp ----------------------------------------------------------------------------------------------
alter table public.notif_envios add column if not exists destinatario_telefono text;
alter table public.notif_envios drop constraint if exists notif_envios_canal_check;
alter table public.notif_envios add constraint notif_envios_canal_check check (canal = any (array['campana', 'correo', 'whatsapp']));
alter table public.notif_envios drop constraint if exists notif_envios_destinatario_chk;
alter table public.notif_envios add constraint notif_envios_destinatario_chk check (
  destinatario_user_id is not null
  or nullif(trim(coalesce(destinatario_email, '')), '') is not null
  or nullif(trim(coalesce(destinatario_telefono, '')), '') is not null);
alter table public.notif_envios drop constraint if exists notif_envios_estado_check;
alter table public.notif_envios add constraint notif_envios_estado_check check (
  estado = any (array['pendiente', 'enviando', 'enviado', 'error', 'omitido', 'simulado']));
create unique index if not exists notif_envios_telefono_adicional_uidx
  on public.notif_envios (empresa_id, evento_codigo, canal, destinatario_telefono, clave_dedupe)
  where destinatario_user_id is null and canal = 'whatsapp';
create index if not exists notif_envios_cola_whatsapp_idx
  on public.notif_envios (proximo_intento_en)
  where canal = 'whatsapp' and estado = any (array['pendiente', 'enviando']);

-- 3. Emisión -----------------------------------------------------------------------------------------------------------
create or replace function public.notif_emitir(p_empresa_id text, p_evento text, p_canal text, p_rol text, p_user_id uuid, p_clave text, p_titulo text, p_mensaje text, p_payload jsonb, p_referencia_tipo text, p_referencia_id text, p_prioridad text default 'media'::text)
returns boolean
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_envio uuid; v_notif uuid; v_email text; v_tel text;
begin
  if p_user_id is null then return false; end if;
  if p_canal = 'correo' then
    select u.email into v_email from auth.users u where u.id = p_user_id;
  elsif p_canal = 'whatsapp' then
    select public.notif_normalizar_telefono(us.telefono) into v_tel from public.usuarios us where us.id = p_user_id::text;
  end if;
  insert into public.notif_envios
    (empresa_id, evento_codigo, canal, rol_destinatario, destinatario_user_id, destinatario_email, destinatario_telefono, clave_dedupe,
     titulo, mensaje, payload, referencia_tipo, referencia_id, estado, ultimo_error)
  values
    (p_empresa_id, p_evento, p_canal, p_rol, p_user_id, v_email, v_tel, p_clave,
     p_titulo, p_mensaje, coalesce(p_payload, '{}'::jsonb), p_referencia_tipo, p_referencia_id,
     case when p_canal = 'campana' then 'enviado'
          when p_canal = 'correo' and nullif(trim(coalesce(v_email, '')), '') is null then 'omitido'
          when p_canal = 'whatsapp' and v_tel is null then 'omitido'
          else 'pendiente' end,
     case when p_canal = 'correo' and nullif(trim(coalesce(v_email, '')), '') is null then 'sin_correo'
          when p_canal = 'whatsapp' and v_tel is null then 'sin_telefono' end)
  on conflict (empresa_id, evento_codigo, canal, destinatario_user_id, clave_dedupe) do nothing
  returning id into v_envio;
  if v_envio is null then return false; end if;
  if p_canal = 'campana' then
    insert into public.notificaciones_sistema
      (empresa_id, user_id, texto, tipo, titulo, mensaje, referencia_tipo, referencia_id, referencia_payload, prioridad, leida)
    values
      (p_empresa_id, p_user_id, p_mensaje, p_evento, p_titulo, p_mensaje, p_referencia_tipo, p_referencia_id,
       coalesce(p_payload, '{}'::jsonb), coalesce(p_prioridad, 'media'), false)
    returning id into v_notif;
    update public.notif_envios set notificacion_id = v_notif, enviado_en = now() where id = v_envio;
  end if;
  return true;
end;
$$;

create or replace function public.notif_emitir_telefonos_adicionales(p_empresa_id text, p_evento text, p_destinatarios jsonb, p_clave text, p_titulo text, p_mensaje text, p_payload jsonb, p_referencia_tipo text, p_referencia_id text)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_tel text; v_id uuid; v_total integer := 0;
begin
  for v_tel in select * from public.notif_telefonos_adicionales(p_destinatarios) limit 10 loop
    v_id := null;
    insert into public.notif_envios
      (empresa_id, evento_codigo, canal, rol_destinatario, destinatario_user_id, destinatario_telefono, clave_dedupe,
       titulo, mensaje, payload, referencia_tipo, referencia_id, estado)
    values
      (p_empresa_id, p_evento, 'whatsapp', 'telefono_adicional', null, v_tel, p_clave,
       p_titulo, p_mensaje, coalesce(p_payload, '{}'::jsonb), p_referencia_tipo, p_referencia_id, 'pendiente')
    on conflict (empresa_id, evento_codigo, canal, destinatario_telefono, clave_dedupe)
      where destinatario_user_id is null and canal = 'whatsapp' do nothing
    returning id into v_id;
    if v_id is not null then v_total := v_total + 1; end if;
  end loop;
  return v_total;
end;
$$;

-- 4. Generadores (resúmenes diarios por correo y WhatsApp) -------------------------------------------------------------
create or replace function public.notif_generar_contratos_por_vencer(p_empresa_id text, p_hoy date default null)
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
  where empresa_id = p_empresa_id and evento_codigo = 'contrato_por_vencer' and activo;
  if not found then return 0; end if;
  select coalesce(array_agg(distinct x::int order by x::int), array[30,15,7]) into v_dias
  from jsonb_array_elements_text(coalesce(v_regla.parametros -> 'dias_anticipacion', '[]'::jsonb)) x
  where x ~ '^[0-9]+$' and x::int between 1 and 180;
  if v_dias is null or cardinality(v_dias) = 0 then v_dias := array[30,15,7]; end if;
  v_max := (select max(d) from unnest(v_dias) d);
  create temporary table if not exists _notif_contratos_correo (
    canal text, rol text, user_id uuid, email text, clave text, item jsonb
  ) on commit drop;
  truncate _notif_contratos_correo;
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
    where (t.categoria = 'Contractual' or coalesce(t.captura_snapshot_laboral, false) or lower(t.nombre) like '%contrat%')
      and t.exige_vencimiento and t.documento_padre_tipo_id is null
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
    v_item := jsonb_build_object('nombre', r.nombre, 'tipo_documento', r.tipo_doc_nombre,
      'fecha_vencimiento', r.fecha_vencimiento, 'dias_restantes', r.fecha_vencimiento - v_hoy,
      'clave', v_clave, 'documento_id', r.documento_id);
    -- Campana: un aviso por contrato (sin cambios).
    foreach v_canal in array array['campana'] loop
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
    -- Correo y WhatsApp: se acumula por canal y destinatario; se envía un resumen diario al final.
    foreach v_canal in array array['correo','whatsapp'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', v_canal) then
        insert into _notif_contratos_correo (canal, rol, user_id, clave, item)
        select v_canal, 'rrhh', u.user_id, v_clave, v_item from public.notif_usuarios_rrhh(p_empresa_id) u;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
        if v_u is not null then
          insert into _notif_contratos_correo (canal, rol, user_id, clave, item) values (v_canal, 'jefe', v_u, v_clave, v_item);
        end if;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'colaborador', v_canal) then
        v_u := public.notif_usuario_colaborador(p_empresa_id, r.personal_tipo, r.personal_id);
        if v_u is not null then
          insert into _notif_contratos_correo (canal, rol, user_id, clave, item) values (v_canal, 'colaborador', v_u, v_clave, v_item);
        end if;
      end if;
    end loop;
    insert into _notif_contratos_correo (canal, rol, email, clave, item)
    select 'correo', 'correo_adicional', e, v_clave, v_item
    from (select * from public.notif_correos_adicionales(v_regla.destinatarios) limit 10) a(e);
    insert into _notif_contratos_correo (canal, rol, email, clave, item)
    select 'whatsapp', 'telefono_adicional', e, v_clave, v_item
    from (select * from public.notif_telefonos_adicionales(v_regla.destinatarios) limit 10) a(e);
  end loop;

  -- Resumen diario por correo: un envío por destinatario y por día con todos los contratos dentro del rango.
  update _notif_contratos_correo c set email = lower(u.email)
  from auth.users u where c.user_id is not null and u.id = c.user_id;
  delete from _notif_contratos_correo a
  where a.user_id is null and exists (
    select 1 from _notif_contratos_correo b where b.user_id is not null and b.canal = a.canal and b.email = a.email and b.clave = a.clave);

  for v_res in
    select x.canal, x.user_id, x.email, min(x.rol) as rol,
           jsonb_agg(x.item order by (x.item ->> 'dias_restantes')::int, x.item ->> 'nombre') as items,
           jsonb_agg(x.clave order by x.clave) as claves,
           count(*)::int as n,
           min((x.item ->> 'dias_restantes')::int) as min_dias
    from (select distinct on (c.canal, coalesce(c.user_id::text, c.email), c.clave) c.*
          from _notif_contratos_correo c
          order by c.canal, coalesce(c.user_id::text, c.email), c.clave, c.rol) x
    group by x.canal, x.user_id, x.email
  loop
    v_clave_dig := 'contratos:diario:' || v_hoy::text;
    select string_agg((i ->> 'nombre') || ' (' || to_char((i ->> 'fecha_vencimiento')::date, 'DD/MM') || ')', ', ')
      into v_lista
    from (select t.i from jsonb_array_elements(v_res.items) as t(i) limit 5) s;
    v_mensaje := v_res.n::text || case when v_res.n = 1 then ' contrato vence pronto: ' else ' contratos vencen pronto: ' end
                 || v_lista || case when v_res.n > 5 then ' y ' || (v_res.n - 5)::text || ' más.' else '.' end;
    v_payload := jsonb_build_object('resumen', true, 'fecha', v_hoy, 'total', v_res.n, 'items', v_res.items, 'claves', v_res.claves);
    if v_res.user_id is not null then
      if public.notif_emitir(p_empresa_id, 'contrato_por_vencer', v_res.canal, v_res.rol, v_res.user_id, v_clave_dig,
                             'Contratos por vencer', v_mensaje, v_payload, 'contratos_resumen', v_hoy::text,
                             case when v_res.min_dias <= 7 then 'alta' else 'media' end) then
        v_total := v_total + 1;
      end if;
    elsif v_res.canal = 'whatsapp' then
      v_total := v_total + public.notif_emitir_telefonos_adicionales(p_empresa_id, 'contrato_por_vencer',
                   jsonb_build_object('telefonos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Contratos por vencer', v_mensaje, v_payload, 'contratos_resumen', v_hoy::text);
    else
      v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'contrato_por_vencer',
                   jsonb_build_object('correos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Contratos por vencer', v_mensaje, v_payload, 'contratos_resumen', v_hoy::text);
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
  v_total integer := 0; v_u uuid; v_canal text;
  v_item jsonb; v_res record; v_clave_dig text; v_lista text;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'contrato_vencido' and activo;
  if not found then return 0; end if;
  v_max := case when (v_regla.parametros ->> 'dias_vencido_max') ~ '^[0-9]+$'
                then least(greatest((v_regla.parametros ->> 'dias_vencido_max')::int, 1), 365) else 30 end;
  create temporary table if not exists _notif_vencidos_correo (
    canal text, rol text, user_id uuid, email text, clave text, item jsonb
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
    -- Correo y WhatsApp: se acumula por canal y destinatario; se envía un resumen diario al final.
    foreach v_canal in array array['correo','whatsapp'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', v_canal) then
        insert into _notif_vencidos_correo (canal, rol, user_id, clave, item)
        select v_canal, 'rrhh', u.user_id, v_clave, v_item from public.notif_usuarios_rrhh(p_empresa_id) u;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
        if v_u is not null then
          insert into _notif_vencidos_correo (canal, rol, user_id, clave, item) values (v_canal, 'jefe', v_u, v_clave, v_item);
        end if;
      end if;
    end loop;
    insert into _notif_vencidos_correo (canal, rol, email, clave, item)
    select 'correo', 'correo_adicional', e, v_clave, v_item
    from (select * from public.notif_correos_adicionales(v_regla.destinatarios) limit 10) a(e);
    insert into _notif_vencidos_correo (canal, rol, email, clave, item)
    select 'whatsapp', 'telefono_adicional', e, v_clave, v_item
    from (select * from public.notif_telefonos_adicionales(v_regla.destinatarios) limit 10) a(e);
  end loop;

  -- Lista diaria por correo: un envío por destinatario y por día con todos los contratos vencidos del rango.
  update _notif_vencidos_correo c set email = lower(u.email)
  from auth.users u where c.user_id is not null and u.id = c.user_id;
  delete from _notif_vencidos_correo a
  where a.user_id is null and exists (
    select 1 from _notif_vencidos_correo b where b.user_id is not null and b.canal = a.canal and b.email = a.email and b.clave = a.clave);

  for v_res in
    select x.canal, x.user_id, x.email, min(x.rol) as rol,
           jsonb_agg(x.item order by (x.item ->> 'dias_vencido')::int desc, x.item ->> 'nombre') as items,
           jsonb_agg(x.clave order by x.clave) as claves,
           count(*)::int as n
    from (select distinct on (c.canal, coalesce(c.user_id::text, c.email), c.clave) c.*
          from _notif_vencidos_correo c
          order by c.canal, coalesce(c.user_id::text, c.email), c.clave, c.rol) x
    group by x.canal, x.user_id, x.email
  loop
    v_clave_dig := 'contratos_vencidos:diario:' || v_hoy::text;
    select string_agg((i ->> 'nombre') || ' (' || to_char((i ->> 'fecha_vencimiento')::date, 'DD/MM') || ')', ', ')
      into v_lista
    from (select t.i from jsonb_array_elements(v_res.items) as t(i) limit 5) s;
    v_mensaje := v_res.n::text || case when v_res.n = 1 then ' contrato vencido sin renovar: ' else ' contratos vencidos sin renovar: ' end
                 || v_lista || case when v_res.n > 5 then ' y ' || (v_res.n - 5)::text || ' más.' else '.' end;
    v_payload := jsonb_build_object('resumen', true, 'fecha', v_hoy, 'total', v_res.n, 'items', v_res.items, 'claves', v_res.claves);
    if v_res.user_id is not null then
      if public.notif_emitir(p_empresa_id, 'contrato_vencido', v_res.canal, v_res.rol, v_res.user_id, v_clave_dig,
                             'Contratos vencidos sin renovar', v_mensaje, v_payload, 'contratos_vencidos_resumen', v_hoy::text,
                             'alta') then
        v_total := v_total + 1;
      end if;
    elsif v_res.canal = 'whatsapp' then
      v_total := v_total + public.notif_emitir_telefonos_adicionales(p_empresa_id, 'contrato_vencido',
                   jsonb_build_object('telefonos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Contratos vencidos sin renovar', v_mensaje, v_payload, 'contratos_vencidos_resumen', v_hoy::text);
    else
      v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'contrato_vencido',
                   jsonb_build_object('correos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Contratos vencidos sin renovar', v_mensaje, v_payload, 'contratos_vencidos_resumen', v_hoy::text);
    end if;
  end loop;
  return v_total;
end;
$$;

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
    canal text, rol text, user_id uuid, email text, clave text, item jsonb
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
    -- Correo y WhatsApp: se acumula por canal y destinatario; se envía un resumen diario al final.
    foreach v_canal in array array['correo','whatsapp'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', v_canal) then
        insert into _notif_documentos_correo (canal, rol, user_id, clave, item)
        select v_canal, 'rrhh', u.user_id, v_clave, v_item from public.notif_usuarios_rrhh(p_empresa_id) u;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
        if v_u is not null then
          insert into _notif_documentos_correo (canal, rol, user_id, clave, item) values (v_canal, 'jefe', v_u, v_clave, v_item);
        end if;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'colaborador', v_canal) then
        v_u := public.notif_usuario_colaborador(p_empresa_id, r.personal_tipo, r.personal_id);
        if v_u is not null then
          insert into _notif_documentos_correo (canal, rol, user_id, clave, item) values (v_canal, 'colaborador', v_u, v_clave, v_item);
        end if;
      end if;
    end loop;
    insert into _notif_documentos_correo (canal, rol, email, clave, item)
    select 'correo', 'correo_adicional', e, v_clave, v_item
    from (select * from public.notif_correos_adicionales(v_regla.destinatarios) limit 10) a(e);
    insert into _notif_documentos_correo (canal, rol, email, clave, item)
    select 'whatsapp', 'telefono_adicional', e, v_clave, v_item
    from (select * from public.notif_telefonos_adicionales(v_regla.destinatarios) limit 10) a(e);
  end loop;

  -- Resumen diario por correo: un envío por destinatario y por día con todos los documentos dentro del rango.
  update _notif_documentos_correo c set email = lower(u.email)
  from auth.users u where c.user_id is not null and u.id = c.user_id;
  delete from _notif_documentos_correo a
  where a.user_id is null and exists (
    select 1 from _notif_documentos_correo b where b.user_id is not null and b.canal = a.canal and b.email = a.email and b.clave = a.clave);

  for v_res in
    select x.canal, x.user_id, x.email, min(x.rol) as rol,
           jsonb_agg(x.item order by (x.item ->> 'dias_restantes')::int, x.item ->> 'nombre') as items,
           jsonb_agg(x.clave order by x.clave) as claves,
           count(*)::int as n,
           min((x.item ->> 'dias_restantes')::int) as min_dias
    from (select distinct on (c.canal, coalesce(c.user_id::text, c.email), c.clave) c.*
          from _notif_documentos_correo c
          order by c.canal, coalesce(c.user_id::text, c.email), c.clave, c.rol) x
    group by x.canal, x.user_id, x.email
  loop
    v_clave_dig := 'documentos:diario:' || v_hoy::text;
    select string_agg((i ->> 'nombre') || ' (' || to_char((i ->> 'fecha_vencimiento')::date, 'DD/MM') || ')', ', ')
      into v_lista
    from (select t.i from jsonb_array_elements(v_res.items) as t(i) limit 5) s;
    v_mensaje := v_res.n::text || case when v_res.n = 1 then ' documento vence pronto: ' else ' documentos vencen pronto: ' end
                 || v_lista || case when v_res.n > 5 then ' y ' || (v_res.n - 5)::text || ' más.' else '.' end;
    v_payload := jsonb_build_object('resumen', true, 'fecha', v_hoy, 'total', v_res.n, 'items', v_res.items, 'claves', v_res.claves);
    if v_res.user_id is not null then
      if public.notif_emitir(p_empresa_id, 'documento_por_vencer', v_res.canal, v_res.rol, v_res.user_id, v_clave_dig,
                             'Documentos por vencer', v_mensaje, v_payload, 'documentos_resumen', v_hoy::text,
                             case when v_res.min_dias <= 7 then 'alta' else 'media' end) then
        v_total := v_total + 1;
      end if;
    elsif v_res.canal = 'whatsapp' then
      v_total := v_total + public.notif_emitir_telefonos_adicionales(p_empresa_id, 'documento_por_vencer',
                   jsonb_build_object('telefonos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Documentos por vencer', v_mensaje, v_payload, 'documentos_resumen', v_hoy::text);
    else
      v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'documento_por_vencer',
                   jsonb_build_object('correos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Documentos por vencer', v_mensaje, v_payload, 'documentos_resumen', v_hoy::text);
    end if;
  end loop;
  return v_total;
end;
$$;

-- Tardanzas: agrega el canal whatsapp y los teléfonos adicionales (reconstruida desde la definición vigente).
do $$
declare
  v_def text := pg_get_functiondef('public.notif_generar_tardanzas_resumen(text,date)'::regprocedure);
  v_a_old text := 'foreach v_canal in array array[''campana'',''correo''] loop';
  v_a_new text := 'foreach v_canal in array array[''campana'',''correo'',''whatsapp''] loop';
  v_b_old text := '''asistencia_fecha'', v_fecha::text);';
  v_b_new text := '''asistencia_fecha'', v_fecha::text);
  v_total := v_total + public.notif_emitir_telefonos_adicionales(p_empresa_id, ''tardanza_resumen_diario'', v_regla.destinatarios,
               v_clave, v_titulo, v_mensaje,
               jsonb_build_object(''fecha'', v_fecha, ''umbral_minutos'', v_umbral, ''total'', v_n, ''alcance'', ''empresa'', ''items'', v_items),
               ''asistencia_fecha'', v_fecha::text);';
begin
  if position('notif_emitir_telefonos_adicionales' in v_def) > 0 then
    raise exception '649: tardanzas ya tiene WhatsApp';
  end if;
  if (length(v_def) - length(replace(v_def, v_a_old, ''))) / length(v_a_old) <> 2
     or (length(v_def) - length(replace(v_def, v_b_old, ''))) / length(v_b_old) <> 1 then
    raise exception '649: el generador de tardanzas no tiene la forma esperada';
  end if;
  execute replace(replace(v_def, v_a_old, v_a_new), v_b_old, v_b_new);
end $$;

-- 5. Configuración: guarda y valida teléfonos adicionales ---------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.notif_config_guardar(text,text,boolean,jsonb,jsonb)'::regprocedure);
  v_a_old text := 'v_correos text[]; v_invalidos text[];';
  v_a_new text := 'v_correos text[]; v_invalidos text[]; v_telefonos text[]; v_tel_invalidos text[];';
  v_b_old text := 'if p_evento in (''contrato_por_vencer'', ''documento_por_vencer'') then';
  v_b_new text := 'if jsonb_typeof(p_destinatarios -> ''telefonos_adicionales'') = ''array'' then
    select array_agg(distinct public.notif_normalizar_telefono(x)) filter (where public.notif_normalizar_telefono(x) is not null),
           array_agg(distinct trim(x)) filter (where nullif(trim(x), '''') is not null and public.notif_normalizar_telefono(x) is null)
      into v_telefonos, v_tel_invalidos
    from jsonb_array_elements_text(p_destinatarios -> ''telefonos_adicionales'') x;
    if v_tel_invalidos is not null and cardinality(v_tel_invalidos) > 0 then
      raise exception ''Teléfono no válido: %. Usa un celular de 9 dígitos o el formato internacional con +.'', array_to_string(v_tel_invalidos, '', '');
    end if;
    if v_telefonos is not null and cardinality(v_telefonos) > 10 then
      raise exception ''Puedes agregar hasta 10 teléfonos adicionales por evento.'';
    end if;
  end if;
  v_dest := v_dest || jsonb_build_object(''telefonos_adicionales'',
              coalesce(to_jsonb((select array_agg(t order by t) from unnest(v_telefonos) t)), ''[]''::jsonb));

  if p_evento in (''contrato_por_vencer'', ''documento_por_vencer'') then';
begin
  if position('telefonos_adicionales' in v_def) > 0 then
    raise exception '649: notif_config_guardar ya tiene teléfonos adicionales';
  end if;
  if (length(v_def) - length(replace(v_def, v_a_old, ''))) / length(v_a_old) <> 1
     or (length(v_def) - length(replace(v_def, v_b_old, ''))) / length(v_b_old) <> 1 then
    raise exception '649: notif_config_guardar no tiene la forma esperada';
  end if;
  execute replace(replace(v_def, v_a_old, v_a_new), v_b_old, v_b_new);
end $$;

-- Historial: muestra el teléfono cuando el envío es por WhatsApp.
do $$
declare
  v_def text := pg_get_functiondef('public.notif_envios_listar(text,integer)'::regprocedure);
  v_old text := 'e.destinatario_email, e.titulo, e.mensaje';
  v_new text := 'coalesce(e.destinatario_email, e.destinatario_telefono), e.titulo, e.mensaje';
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception '649: notif_envios_listar no tiene la forma esperada';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- 6. Despacho -----------------------------------------------------------------------------------------------------------
create or replace function public.notif_reclamar_whatsapp(p_limite integer default 25)
returns setof public.notif_envios
language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.notif_envios set estado = 'pendiente'
  where canal = 'whatsapp' and estado = 'enviando' and proximo_intento_en < now() - interval '15 minutes';
  return query
  with cola as (
    select e.id from public.notif_envios e
    where e.canal = 'whatsapp' and e.estado = 'pendiente' and e.proximo_intento_en <= now()
    order by e.proximo_intento_en, e.creado_en
    limit least(greatest(coalesce(p_limite, 25), 1), 100)
    for update skip locked
  )
  update public.notif_envios e
     set estado = 'enviando', intentos = e.intentos + 1, proximo_intento_en = now()
  from cola where e.id = cola.id
  returning e.*;
end;
$$;

-- p_resultado: 'enviado' (aceptado por Meta), 'simulado' (sin credenciales; no sale) o 'fallo' (reintenta hasta 3 veces).
create or replace function public.notif_marcar_whatsapp(p_id uuid, p_resultado text, p_error text default null, p_proveedor_id text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if p_resultado not in ('enviado', 'simulado', 'fallo') then
    raise exception 'Resultado de envío no válido: %', p_resultado;
  end if;
  update public.notif_envios e set
    estado = case when p_resultado = 'enviado' then 'enviado'
                  when p_resultado = 'simulado' then 'simulado'
                  when e.intentos >= 3 then 'error' else 'pendiente' end,
    enviado_en = case when p_resultado in ('enviado', 'simulado') then now() else e.enviado_en end,
    proveedor_id = coalesce(p_proveedor_id, e.proveedor_id),
    ultimo_error = case when p_resultado = 'enviado' then null
                        when p_resultado = 'simulado' then 'whatsapp_simulado'
                        else left(coalesce(p_error, 'error_desconocido'), 500) end,
    proximo_intento_en = case when p_resultado = 'fallo'
                              then now() + (power(4, greatest(e.intentos - 1, 0)) * interval '15 minutes')
                              else e.proximo_intento_en end
  where e.id = p_id and e.canal = 'whatsapp' and e.estado = 'enviando';
end;
$$;

create or replace function public.notif_disparar_dispatch()
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_key text;
begin
  if not exists (
    select 1 from public.notif_envios
    where canal in ('correo', 'whatsapp') and estado = 'pendiente' and proximo_intento_en <= now()
  ) then
    return;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'notif_dispatch_key' limit 1;
  if nullif(v_key, '') is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://atqwyjfidfoepthygfoo.supabase.co/functions/v1/notificaciones-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('limit', 50),
    timeout_milliseconds := 30000
  );
end;
$$;

-- 7. Teléfono de los usuarios internos (lo gestiona el administrador desde Configuración › Notificaciones) ----------------
create or replace function public.notif_telefonos_usuarios(p_empresa_id text)
returns table(user_id uuid, nombre text, email text, rol text, telefono text)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  return query
  select distinct on (ue.user_id) ue.user_id,
         coalesce(nullif(us.nombre, ''), nullif(au.raw_user_meta_data ->> 'nombre', ''), au.email)::text,
         au.email::text, coalesce(r.nombre, r.id::text)::text, us.telefono::text
  from public.usuarios_empresas ue
  left join public.roles r on r.id = ue.rol_id
  left join public.usuarios us on us.id = ue.user_id::text
  left join auth.users au on au.id = ue.user_id
  where ue.empresa_id = p_empresa_id and ue.estado = 'activo'
  order by ue.user_id;
end;
$$;

create or replace function public.notif_telefono_usuario_guardar(p_empresa_id text, p_user_id uuid, p_telefono text)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v_tel text;
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.usuarios_empresas ue
                 where ue.empresa_id = p_empresa_id and ue.user_id = p_user_id and ue.estado = 'activo') then
    raise exception 'El usuario no pertenece a esta empresa.';
  end if;
  v_tel := public.notif_normalizar_telefono(p_telefono);
  if nullif(trim(coalesce(p_telefono, '')), '') is not null and v_tel is null then
    raise exception 'Teléfono no válido. Usa un celular de 9 dígitos o el formato internacional con +.';
  end if;
  update public.usuarios set telefono = v_tel, updated_at = now() where id = p_user_id::text;
  if not found then
    raise exception 'El usuario no tiene ficha en la tabla de usuarios.';
  end if;
  return v_tel;
end;
$$;

-- 8. Catálogo: WhatsApp disponible (apagado) en los 4 eventos configurables ---------------------------------------------
update public.notif_eventos_catalogo c
   set canales_soportados = array_append(c.canales_soportados, 'whatsapp'),
       destinatarios_default = (
         select jsonb_object_agg(k, case when jsonb_typeof(v) = 'object' then v || '{"whatsapp": false}'::jsonb else v end)
         from jsonb_each(c.destinatarios_default) d(k, v))
 where c.codigo in ('contrato_por_vencer', 'contrato_vencido', 'documento_por_vencer', 'tardanza_resumen_diario')
   and not ('whatsapp' = any(c.canales_soportados));

-- 9. Permisos -----------------------------------------------------------------------------------------------------------
revoke all on function public.notif_normalizar_telefono(text) from public, anon, authenticated;
revoke all on function public.notif_telefonos_adicionales(jsonb) from public, anon, authenticated;
revoke all on function public.notif_emitir_telefonos_adicionales(text, text, jsonb, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.notif_reclamar_whatsapp(integer) from public, anon, authenticated;
revoke all on function public.notif_marcar_whatsapp(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.notif_telefonos_usuarios(text) from public, anon;
revoke all on function public.notif_telefono_usuario_guardar(text, uuid, text) from public, anon;
grant execute on function public.notif_normalizar_telefono(text) to service_role;
grant execute on function public.notif_telefonos_adicionales(jsonb) to service_role;
grant execute on function public.notif_emitir_telefonos_adicionales(text, text, jsonb, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.notif_reclamar_whatsapp(integer) to service_role;
grant execute on function public.notif_marcar_whatsapp(uuid, text, text, text) to service_role;
grant execute on function public.notif_telefonos_usuarios(text) to authenticated, service_role;
grant execute on function public.notif_telefono_usuario_guardar(text, uuid, text) to authenticated, service_role;

-- 10. Comprobación ------------------------------------------------------------------------------------------------------
do $$
declare v_def text;
begin
  if public.notif_normalizar_telefono('987 654 321') is distinct from '51987654321'
     or public.notif_normalizar_telefono('+51 987654321') is distinct from '51987654321'
     or public.notif_normalizar_telefono('12345') is not null then
    raise exception '649: la normalización de teléfonos no funciona';
  end if;
  if (select count(*) from public.notif_eventos_catalogo
      where codigo in ('contrato_por_vencer', 'contrato_vencido', 'documento_por_vencer', 'tardanza_resumen_diario')
        and 'whatsapp' = any(canales_soportados)) <> 4 then
    raise exception '649: faltan eventos con canal whatsapp en el catálogo';
  end if;
  foreach v_def in array array[
    pg_get_functiondef('public.notif_generar_contratos_por_vencer(text,date)'::regprocedure),
    pg_get_functiondef('public.notif_generar_contratos_vencidos(text,date)'::regprocedure),
    pg_get_functiondef('public.notif_generar_documentos_por_vencer(text,date)'::regprocedure)] loop
    if position('array[''correo'',''whatsapp'']' in v_def) = 0 or position('notif_emitir_telefonos_adicionales' in v_def) = 0
       or position('v_res.canal' in v_def) = 0 or position('notif_emitir_correos_adicionales' in v_def) = 0 then
      raise exception '649: un generador de resúmenes no quedó con WhatsApp';
    end if;
  end loop;
  if position('captura_snapshot_laboral' in pg_get_functiondef('public.notif_generar_contratos_por_vencer(text,date)'::regprocedure)) = 0
     or position('dias_vencido_max' in pg_get_functiondef('public.notif_generar_contratos_vencidos(text,date)'::regprocedure)) = 0
     or position('documentos:diario:' in pg_get_functiondef('public.notif_generar_documentos_por_vencer(text,date)'::regprocedure)) = 0 then
    raise exception '649: se perdió lógica de las migraciones 643/646/648';
  end if;
  v_def := pg_get_functiondef('public.notif_generar_tardanzas_resumen(text,date)'::regprocedure);
  if position('''whatsapp''' in v_def) = 0 or position('notif_emitir_telefonos_adicionales' in v_def) = 0 then
    raise exception '649: tardanzas no quedó con WhatsApp';
  end if;
  v_def := pg_get_functiondef('public.notif_config_guardar(text,text,boolean,jsonb,jsonb)'::regprocedure);
  if position('telefonos_adicionales' in v_def) = 0 or position('dias_vencido_max' in v_def) = 0 or position('correos_adicionales' in v_def) = 0 then
    raise exception '649: notif_config_guardar quedó incompleta';
  end if;
  if position('destinatario_telefono' in pg_get_functiondef('public.notif_envios_listar(text,integer)'::regprocedure)) = 0 then
    raise exception '649: el historial no muestra teléfonos';
  end if;
  if position('''whatsapp''' in pg_get_functiondef('public.notif_disparar_dispatch()'::regprocedure)) = 0 then
    raise exception '649: el disparador del cron no considera WhatsApp';
  end if;
end $$;

commit;
