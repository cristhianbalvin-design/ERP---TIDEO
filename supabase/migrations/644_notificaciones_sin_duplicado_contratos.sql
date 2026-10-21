-- 644: Evita el aviso duplicado de contratos en la campana.
-- El generador antiguo (generar_notificaciones_documentarias_base_213) avisa 'doc_por_vencer' de todos los documentos,
-- incluidos contratos. Cuando la empresa tiene activo el evento 'contrato_por_vencer' del motor nuevo, el antiguo deja
-- de avisar los contratos POR VENCER (el nuevo los cubre). Se mantienen: avisos de contratos VENCIDOS (el nuevo no los
-- cubre), todos los demás documentos y el comportamiento de las empresas sin el evento nuevo activo.
-- La función se reconstruye desde pg_get_functiondef vigente con un único reemplazo verificado.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.generar_notificaciones_documentarias_base_213(text)'::regprocedure);
  v_old text := 'where estado in (''por_vencer'', ''vencido'')';
  v_new text := 'where estado in (''por_vencer'', ''vencido'')
            and not (
              estado = ''por_vencer''
              and exists (
                select 1 from public.notif_reglas_empresa nr
                where nr.empresa_id = v_emp.id and nr.evento_codigo = ''contrato_por_vencer'' and nr.activo
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
  if position('nr.evento_codigo = ''contrato_por_vencer''' in v_def) > 0 then
    raise exception '644: la función ya tiene la exclusión aplicada';
  end if;
  v_ocurrencias := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_ocurrencias <> 1 then
    raise exception '644: se esperaba 1 ocurrencia del filtro de estado y hay %', v_ocurrencias;
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

update public.notif_eventos_catalogo
   set descripcion = 'Aviso en campana de documentos del personal próximos a vencer, según los días de alerta de cada tipo de documento. Si la empresa activa «Contrato por vencer», los contratos se avisan solo por ese evento.'
 where codigo = 'doc_por_vencer';

do $$
declare
  v_def text := pg_get_functiondef('public.generar_notificaciones_documentarias_base_213(text)'::regprocedure);
begin
  if position('nr.evento_codigo = ''contrato_por_vencer''' in v_def) = 0 then
    raise exception '644: no quedó aplicada la exclusión de contratos';
  end if;
  if position('Solicita la renovacion' in v_def) = 0 or position('notificaciones_documentarias_log' in v_def) = 0 then
    raise exception '644: la función perdió partes de su definición original';
  end if;
end $$;

commit;
