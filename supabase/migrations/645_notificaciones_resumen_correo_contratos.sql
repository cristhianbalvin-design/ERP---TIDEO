-- 645: Contratos por vencer — un solo correo resumen por destinatario.
-- Antes: un correo por contrato (en una empresa con 13 contratos, 13 correos por persona).
-- Ahora: la campana sigue con un aviso por contrato; por correo cada destinatario (RRHH, jefe, colaborador o correo
-- adicional) recibe un resumen con la tabla de los contratos que todavía no se le avisaron por correo en ese umbral.
-- Dedupe: el resumen guarda payload.claves; un contrato no se vuelve a incluir si ya salió por correo, ya sea en un
-- resumen (claves) o en un correo individual anterior (clave_dedupe), así que lo enviado hoy no se reenvía.
-- Parte de pg_get_functiondef vigente (versión 643).

begin;

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
    rol text, user_id uuid, email text, clave text, item jsonb
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
    -- Correo: se acumula por destinatario y se envía un resumen al final.
    if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', 'correo') then
      insert into _notif_contratos_correo (rol, user_id, clave, item)
      select 'rrhh', u.user_id, v_clave, v_item from public.notif_usuarios_rrhh(p_empresa_id) u;
    end if;
    if public.notif_destino_activo(v_regla.destinatarios, 'jefe', 'correo') then
      v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
      if v_u is not null then
        insert into _notif_contratos_correo (rol, user_id, clave, item) values ('jefe', v_u, v_clave, v_item);
      end if;
    end if;
    if public.notif_destino_activo(v_regla.destinatarios, 'colaborador', 'correo') then
      v_u := public.notif_usuario_colaborador(p_empresa_id, r.personal_tipo, r.personal_id);
      if v_u is not null then
        insert into _notif_contratos_correo (rol, user_id, clave, item) values ('colaborador', v_u, v_clave, v_item);
      end if;
    end if;
    insert into _notif_contratos_correo (rol, email, clave, item)
    select 'correo_adicional', e, v_clave, v_item
    from (select * from public.notif_correos_adicionales(v_regla.destinatarios) limit 10) a(e);
  end loop;

  -- Resumen por correo: un envío por destinatario con los contratos que aún no se le avisaron.
  update _notif_contratos_correo c set email = lower(u.email)
  from auth.users u where c.user_id is not null and u.id = c.user_id;
  delete from _notif_contratos_correo a
  where a.user_id is null and exists (
    select 1 from _notif_contratos_correo b where b.user_id is not null and b.email = a.email and b.clave = a.clave);
  delete from _notif_contratos_correo c
  where exists (
    select 1 from public.notif_envios e
    where e.empresa_id = p_empresa_id and e.evento_codigo = 'contrato_por_vencer' and e.canal = 'correo'
      and ((c.user_id is not null and e.destinatario_user_id = c.user_id)
           or (c.user_id is null and e.destinatario_user_id is null and lower(e.destinatario_email) = c.email))
      and (e.clave_dedupe = c.clave or coalesce(e.payload -> 'claves', '[]'::jsonb) ? c.clave));

  for v_res in
    select x.user_id, x.email, min(x.rol) as rol,
           jsonb_agg(x.item order by (x.item ->> 'dias_restantes')::int, x.item ->> 'nombre') as items,
           jsonb_agg(x.clave order by x.clave) as claves,
           count(*)::int as n,
           min((x.item ->> 'dias_restantes')::int) as min_dias
    from (select distinct on (coalesce(c.user_id::text, c.email), c.clave) c.*
          from _notif_contratos_correo c
          order by coalesce(c.user_id::text, c.email), c.clave, c.rol) x
    group by x.user_id, x.email
  loop
    v_clave_dig := 'contratos:' || v_hoy::text || ':' || md5(v_res.claves::text);
    select string_agg((i ->> 'nombre') || ' (' || to_char((i ->> 'fecha_vencimiento')::date, 'DD/MM') || ')', ', ')
      into v_lista
    from (select t.i from jsonb_array_elements(v_res.items) as t(i) limit 5) s;
    v_mensaje := v_res.n::text || case when v_res.n = 1 then ' contrato vence pronto: ' else ' contratos vencen pronto: ' end
                 || v_lista || case when v_res.n > 5 then ' y ' || (v_res.n - 5)::text || ' más.' else '.' end;
    v_payload := jsonb_build_object('resumen', true, 'fecha', v_hoy, 'total', v_res.n, 'items', v_res.items, 'claves', v_res.claves);
    if v_res.user_id is not null then
      if public.notif_emitir(p_empresa_id, 'contrato_por_vencer', 'correo', v_res.rol, v_res.user_id, v_clave_dig,
                             'Contratos por vencer', v_mensaje, v_payload, 'contratos_resumen', v_hoy::text,
                             case when v_res.min_dias <= 7 then 'alta' else 'media' end) then
        v_total := v_total + 1;
      end if;
    else
      v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'contrato_por_vencer',
                   jsonb_build_object('correos_adicionales', jsonb_build_array(v_res.email)), v_clave_dig,
                   'Contratos por vencer', v_mensaje, v_payload, 'contratos_resumen', v_hoy::text);
    end if;
  end loop;
  return v_total;
end;
$$;

do $$
declare v_def text := pg_get_functiondef('public.notif_generar_contratos_por_vencer(text,date)'::regprocedure);
begin
  if position('_notif_contratos_correo' in v_def) = 0 or position('contratos_resumen' in v_def) = 0 then
    raise exception '645: el generador no tiene el resumen por correo';
  end if;
  if position('captura_snapshot_laboral' in v_def) = 0 then
    raise exception '645: se perdió el criterio de tipo de contrato de la 643';
  end if;
  if position('array[''campana'']' in v_def) = 0 then
    raise exception '645: la campana debía seguir avisando por contrato';
  end if;
end $$;

commit;
