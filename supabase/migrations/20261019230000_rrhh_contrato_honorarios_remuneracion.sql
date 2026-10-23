-- RRHH: TEC-0015 EDER MUÑOZ YOVERA (emp_20513453711), contrato por honorarios con remuneración 0.
-- Causa: al subirse el Contrato Primigenio (pdoc_9ceed359-cda, 2026-09-11) la foto laboral tomó
-- sueldo_base, que en honorarios es 0 por convención; el honorario real está en monto_mensual (S/ 3,000).
-- Se corrige solo condiciones_laborales.remuneracion_base de ese documento (valor anterior: 0).
-- El frontend deja de capturar 0 como remuneración (rrhhSnapshotLaboral / rrhhAdminSnapshotLaboral).

update public.personal_documentos d
   set condiciones_laborales = jsonb_set(d.condiciones_laborales, '{remuneracion_base}', to_jsonb(p.monto_mensual))
  from public.personal_operativo p
 where d.id = 'pdoc_9ceed359-cda'
   and d.empresa_id = 'emp_20513453711'
   and p.id = d.personal_id
   and p.codigo = 'TEC-0015'
   and p.modalidad_contrato = 'honorarios'
   and coalesce(nullif(d.condiciones_laborales ->> 'remuneracion_base', '')::numeric, 0) = 0
   and p.monto_mensual > 0;

do $$
declare v_rem numeric; v_monto numeric;
begin
  select (d.condiciones_laborales ->> 'remuneracion_base')::numeric, p.monto_mensual
    into v_rem, v_monto
    from public.personal_documentos d
    join public.personal_operativo p on p.id = d.personal_id
   where d.id = 'pdoc_9ceed359-cda';
  if v_rem is distinct from 3000 or v_monto is distinct from 3000 then
    raise exception 'TEC-0015 no quedó con remuneración 3000 en su contrato (contrato %, ficha %)', v_rem, v_monto;
  end if;
end $$;
