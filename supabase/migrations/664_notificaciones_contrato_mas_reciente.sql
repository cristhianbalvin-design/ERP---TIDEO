-- 664: Avisos de contratos solo por el contrato más reciente de cada persona.
-- (Aplicada en producción el 05/11/2026 con el nombre 656_notificaciones_contrato_mas_reciente.)
-- Problema: con varios tipos de contrato (p. ej. «Contrato Primigenio» y «Contrato de trabajo»), cada tipo se
-- evaluaba por separado: salían personas repetidas en «por vencer» y falsos «vencidos sin renovar» cuando la
-- persona ya tenía otro contrato vigente.
-- Regla: un contrato no se avisa si la misma persona tiene otro contrato (otro tipo contractual, no faltante)
-- que vence después, es indefinido vigente, o vence el mismo día (desempate por tipo_documento_id).
-- Las funciones se modifican a partir de pg_get_functiondef de la versión remota vigente, con reemplazos
-- puntuales verificados (si un fragmento no se encuentra, la migración se revierte).

do $mig$
declare
  v_fn text; v_tmp text; v_def text; v_new text;
  v_hab constant text :=
       chr(10) || '  create temporary table if not exists _notif_hab_contratos ('
    || chr(10) || '    personal_id text, personal_tipo text, tipo_documento_id text, estado text, fecha_vencimiento date'
    || chr(10) || '  ) on commit drop;'
    || chr(10) || '  truncate _notif_hab_contratos;'
    || chr(10) || '  insert into _notif_hab_contratos'
    || chr(10) || '  select h.personal_id, h.personal_tipo, h.tipo_documento_id, h.estado, h.fecha_vencimiento'
    || chr(10) || '  from public.calcular_habilitaciones_personal(p_empresa_id) h'
    || chr(10) || '  join public.tipos_documento_empresa t on t.id = h.tipo_documento_id and t.empresa_id = p_empresa_id'
    || chr(10) || '  where (t.categoria = ''Contractual'' or coalesce(t.captura_snapshot_laboral, false) or lower(t.nombre) like ''%contrat%'')'
    || chr(10) || '    and t.documento_padre_tipo_id is null and lower(t.nombre) not like ''%adenda%'';';
  v_cond constant text :=
       chr(10) || '      and not exists ('
    || chr(10) || '        select 1 from _notif_hab_contratos o'
    || chr(10) || '        where o.personal_tipo = h.personal_tipo and o.personal_id = h.personal_id'
    || chr(10) || '          and o.tipo_documento_id <> h.tipo_documento_id and o.estado <> ''falta'''
    || chr(10) || '          and ((o.fecha_vencimiento is null and o.estado = ''vigente'')'
    || chr(10) || '               or o.fecha_vencimiento > h.fecha_vencimiento'
    || chr(10) || '               or (o.fecha_vencimiento = h.fecha_vencimiento and o.tipo_documento_id < h.tipo_documento_id)))';
  v_anchor constant text := 'and coalesce(pa.estado, po.estado, ''activo'') <> ''inactivo''';
begin
  foreach v_fn in array array['notif_generar_contratos_por_vencer(text,date)', 'notif_generar_contratos_vencidos(text,date)'] loop
    v_tmp := case when v_fn like 'notif_generar_contratos_por_vencer%' then 'truncate _notif_contratos_correo;'
                  else 'truncate _notif_vencidos_correo;' end;
    v_def := pg_get_functiondef(('public.' || v_fn)::regprocedure);
    if position('_notif_hab_contratos' in v_def) > 0 then
      raise exception '664: % ya tiene el ajuste', v_fn;
    end if;
    if (length(v_def) - length(replace(v_def, v_tmp, ''))) / length(v_tmp) <> 1
       or (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception '664: anclas no únicas en %', v_fn;
    end if;
    v_new := replace(v_def, v_tmp, v_tmp || v_hab);
    v_new := replace(v_new, v_anchor, v_anchor || v_cond);
    execute v_new;
  end loop;
end
$mig$;

-- Comprobación final.
do $chk$
declare v_fn text; v_d text;
begin
  foreach v_fn in array array['notif_generar_contratos_por_vencer(text,date)', 'notif_generar_contratos_vencidos(text,date)'] loop
    v_d := pg_get_functiondef(('public.' || v_fn)::regprocedure);
    if position('insert into _notif_hab_contratos' in v_d) = 0 or position('from _notif_hab_contratos o' in v_d) = 0 then
      raise exception '664 chk: % sin ajuste', v_fn;
    end if;
  end loop;
end
$chk$;
