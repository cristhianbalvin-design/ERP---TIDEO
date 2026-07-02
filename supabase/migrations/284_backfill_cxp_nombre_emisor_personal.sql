-- TIDEO ERP — Migración 284: Backfill de nombre_emisor en cxp para beneficiarios tipo 'personal'
-- Corrige filas de CxP (RHE, liquidaciones de cese) que muestran el ID interno
-- (per_/pop_...) en vez del nombre del colaborador porque nombre_emisor quedó vacío.

update public.cxp c
set nombre_emisor = sub.nombre
from (
  select c2.id,
    coalesce(pa.nombre, po.nombre, lc.beneficiario_nombre, lc.personal_nombre) as nombre
  from public.cxp c2
  left join public.personal_administrativo pa on pa.id = c2.personal_id
  left join public.personal_operativo po on po.id = c2.personal_id
  left join public.liquidaciones_cese lc on lc.cxp_id = c2.id
  where c2.tipo_beneficiario = 'personal' and c2.nombre_emisor is null
) sub
where c.id = sub.id and sub.nombre is not null;
