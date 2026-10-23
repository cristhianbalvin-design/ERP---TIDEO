-- 643: El aviso de contrato por vencer reconoce los tipos de contrato aunque su categoría no sea 'Contractual'.
-- Caso: en algunas empresas el tipo 'Contrato Primigenio' o 'Contrato de trabajo' tiene categoría 'Otros' y el
-- generador no los encontraba. Criterio nuevo: categoría 'Contractual', o captura de snapshot laboral, o nombre que
-- contenga 'contrat'; se siguen excluyendo adendas (documento_padre_tipo_id y nombre 'adenda').
-- Parte de pg_get_functiondef vigente (versión 641); único cambio: la condición del tipo de documento.

begin;

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

do $$
begin
  if position('captura_snapshot_laboral' in pg_get_functiondef('public.notif_generar_contratos_por_vencer(text,date)'::regprocedure)) = 0 then
    raise exception '643: el generador no tiene el criterio nuevo de tipo de contrato';
  end if;
  if position('notif_emitir_correos_adicionales' in pg_get_functiondef('public.notif_generar_contratos_por_vencer(text,date)'::regprocedure)) = 0 then
    raise exception '643: se perdió la llamada a correos adicionales';
  end if;
end $$;

commit;
