-- RRHH: alinear la ficha del colaborador con su contrato vigente aprobado.
-- Decisión del usuario (2026-10-19): el contrato es la fuente de verdad y se corrigen
-- ahora todas las fichas que difieren en sueldo o tipo de contrato (87 en 6 empresas).
-- Solo cambia sueldo_base, monto_mensual (recalcula tarifa_hora por trigger),
-- tipo_contrato y tipo_contrato_catalogo_codigo. No toca modalidad_contrato (inclusión
-- en planilla), salvo Andre TEC-0021 (emp_2000000000), cuya condición real el usuario
-- confirmó como honorarios S/ 1,500.
-- Respaldo previo en public.respaldo_ficha_contrato_20261019 para poder revertir.

create table if not exists public.respaldo_ficha_contrato_20261019 (
  personal_tipo text not null,
  personal_id text not null,
  empresa_id text not null,
  contrato_doc_id text,
  tipo_contrato text,
  tipo_contrato_catalogo_codigo text,
  sueldo_base numeric,
  monto_mensual numeric,
  tarifa_hora numeric,
  modalidad_contrato text,
  respaldado_en timestamptz not null default now(),
  primary key (personal_tipo, personal_id)
);
alter table public.respaldo_ficha_contrato_20261019 enable row level security;
revoke all on public.respaldo_ficha_contrato_20261019 from anon, authenticated;

create temporary table tmp_ficha_objetivo on commit drop as
with c as (
  select d.personal_id, d.personal_tipo, d.id doc_id, d.condiciones_laborales cl,
         row_number() over (partition by d.personal_id order by d.periodo_fecha_inicio desc nulls last, d.creado_en desc) rn
  from public.personal_documentos d
  where d.activo and d.estado_validacion = 'aprobado' and d.contrato_referencia_id is null
    and d.condiciones_laborales ? 'remuneracion_base'
    and coalesce(d.periodo_estado, 'vigente') not in ('archivado', 'anulado', 'rechazado')
), f as (
  select 'operativo'::text t, id, empresa_id, tipo_contrato, tipo_contrato_catalogo_codigo, sueldo_base, monto_mensual
  from public.personal_operativo where coalesce(estado_laboral, 'activo') = 'activo'
  union all
  select 'administrativo', id, empresa_id, tipo_contrato, tipo_contrato_catalogo_codigo, sueldo_base, monto_mensual
  from public.personal_administrativo where coalesce(estado_laboral, 'activo') = 'activo'
), n as (
  select f.*, c.doc_id, c.cl->>'tipo_contrato' tc_snap,
    case when c.cl->>'tipo_contrato' in ('1000','1005','indefinido') then 'indefinido'
         when c.cl->>'tipo_contrato' in ('1001','1002','1003','1004','plazo_fijo') then 'plazo_fijo'
         when c.cl->>'tipo_contrato' in ('honorarios','por_encargo') then 'por_encargo'
         when c.cl->>'tipo_contrato' in ('obra_determinada','por_obra') then 'obra_determinada'
         else null end tipo_obj,
    case when c.cl->>'tipo_contrato' ~ '^[0-9]{4}$' then c.cl->>'tipo_contrato' else null end codigo_obj,
    case when f.tipo_contrato in ('1000','1005','indefinido') then 'indefinido'
         when f.tipo_contrato in ('1001','1002','1003','1004','plazo_fijo') then 'plazo_fijo'
         when f.tipo_contrato in ('honorarios','por_encargo') then 'por_encargo'
         when f.tipo_contrato in ('obra_determinada','por_obra') then 'obra_determinada'
         else f.tipo_contrato end tipo_actual,
    nullif(c.cl->>'remuneracion_base','')::numeric sueldo_obj
  from f join c on c.personal_id = f.id and c.rn = 1
)
select t, id, empresa_id, doc_id, tipo_obj, codigo_obj, sueldo_obj,
  (tipo_obj is not null and tipo_obj is distinct from tipo_actual) cambia_tipo,
  (sueldo_obj > 0 and sueldo_obj is distinct from coalesce(sueldo_base, 0)) cambia_sueldo
from n
where (tipo_obj is not null and tipo_obj is distinct from tipo_actual)
   or (sueldo_obj > 0 and sueldo_obj is distinct from coalesce(sueldo_base, 0));

insert into public.respaldo_ficha_contrato_20261019
  (personal_tipo, personal_id, empresa_id, contrato_doc_id, tipo_contrato, tipo_contrato_catalogo_codigo, sueldo_base, monto_mensual, tarifa_hora, modalidad_contrato)
select o.t, p.id, p.empresa_id, o.doc_id, p.tipo_contrato, p.tipo_contrato_catalogo_codigo, p.sueldo_base, p.monto_mensual, p.tarifa_hora, p.modalidad_contrato
from tmp_ficha_objetivo o join public.personal_operativo p on p.id = o.id and o.t = 'operativo'
union all
select o.t, p.id, p.empresa_id, o.doc_id, p.tipo_contrato, p.tipo_contrato_catalogo_codigo, p.sueldo_base, p.monto_mensual, p.tarifa_hora, p.modalidad_contrato
from tmp_ficha_objetivo o join public.personal_administrativo p on p.id = o.id and o.t = 'administrativo'
on conflict (personal_tipo, personal_id) do nothing;

update public.personal_operativo p set
  sueldo_base   = case when o.cambia_sueldo then o.sueldo_obj else p.sueldo_base end,
  monto_mensual = case when o.cambia_sueldo then o.sueldo_obj else p.monto_mensual end,
  tipo_contrato = case when o.cambia_tipo then o.tipo_obj else p.tipo_contrato end,
  tipo_contrato_catalogo_codigo = case when o.codigo_obj is not null then o.codigo_obj
                                       when o.cambia_tipo then null else p.tipo_contrato_catalogo_codigo end,
  updated_at = now()
from tmp_ficha_objetivo o
where o.t = 'operativo' and p.id = o.id;

update public.personal_administrativo p set
  sueldo_base   = case when o.cambia_sueldo then o.sueldo_obj else p.sueldo_base end,
  monto_mensual = case when o.cambia_sueldo then o.sueldo_obj else p.monto_mensual end,
  tipo_contrato = case when o.cambia_tipo then o.tipo_obj else p.tipo_contrato end,
  tipo_contrato_catalogo_codigo = case when o.codigo_obj is not null then o.codigo_obj
                                       when o.cambia_tipo then null else p.tipo_contrato_catalogo_codigo end,
  updated_at = now()
from tmp_ficha_objetivo o
where o.t = 'administrativo' and p.id = o.id;

-- Andre TEC-0021: honorarios confirmado por el usuario
update public.personal_operativo
   set modalidad_contrato = 'honorarios', updated_at = now()
 where id = 'pop_1787421543684' and empresa_id = 'emp_2000000000';

do $$
declare
  v_obj int; v_resp int; v_restantes int; v_andre record;
begin
  select count(*) into v_obj from tmp_ficha_objetivo;
  select count(*) into v_resp from public.respaldo_ficha_contrato_20261019;
  if v_obj <> 87 then
    raise exception 'Se esperaban 87 fichas a corregir y hay %', v_obj;
  end if;
  if v_resp < v_obj then
    raise exception 'Respaldo incompleto: % de %', v_resp, v_obj;
  end if;

  select count(*) into v_restantes
  from tmp_ficha_objetivo o
  left join public.personal_operativo po on o.t = 'operativo' and po.id = o.id
  left join public.personal_administrativo pa on o.t = 'administrativo' and pa.id = o.id
  where (o.cambia_sueldo and coalesce(po.sueldo_base, pa.sueldo_base) is distinct from o.sueldo_obj)
     or (o.cambia_tipo and coalesce(po.tipo_contrato, pa.tipo_contrato) is distinct from o.tipo_obj);
  if v_restantes > 0 then
    raise exception 'Quedaron % fichas sin alinear con su contrato', v_restantes;
  end if;

  select sueldo_base, monto_mensual, tipo_contrato, modalidad_contrato, tarifa_hora into v_andre
  from public.personal_operativo where id = 'pop_1787421543684';
  if v_andre.sueldo_base <> 1500 or v_andre.tipo_contrato <> 'por_encargo' or v_andre.modalidad_contrato <> 'honorarios' then
    raise exception 'Andre no quedó como honorarios S/ 1,500: %', row_to_json(v_andre);
  end if;
end $$;
