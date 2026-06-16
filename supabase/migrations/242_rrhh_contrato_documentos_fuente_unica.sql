-- Fuente unica de verdad para vigencia contractual: personal_documentos.
-- La ficha conserva fecha_ingreso y tipo_contrato; las fechas del contrato viven
-- en personal_documentos.fecha_emision / fecha_vencimiento del documento activo.

drop function if exists public.resolver_mi_personal_rrhh();

alter table if exists public.personal_operativo
  drop column if exists fecha_inicio_contrato,
  drop column if exists fecha_fin_contrato;

alter table if exists public.personal_administrativo
  drop column if exists fecha_inicio_contrato,
  drop column if exists fecha_fin_contrato;

create or replace function public.resolver_mi_personal_rrhh()
returns table (
  empresa_id text,
  personal_id text,
  personal_tipo text,
  nombre text,
  documento text,
  email text,
  telefono text,
  email_personal text,
  celular_personal text,
  telefono_personal text,
  cargo text,
  area text,
  sede text,
  fecha_ingreso date,
  regimen_jornada text,
  dias_ciclo_trabajo integer,
  dias_ciclo_descanso integer,
  dias_vacaciones_disponibles numeric
)
language sql
security definer
set search_path = public
as $$
  select p.empresa_id, p.id, 'operativo', p.nombre, p.documento, p.email, p.telefono,
         p.email_personal, p.celular_personal, p.telefono_personal,
         p.cargo, p.area, p.sede, p.fecha_ingreso, p.regimen_jornada,
         p.dias_ciclo_trabajo, p.dias_ciclo_descanso, p.dias_vacaciones_disponibles
    from public.personal_operativo p
   where p.auth_user_id::text = auth.uid()::text
      or lower(coalesce(p.email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  union all
  select p.empresa_id, p.id, 'administrativo', p.nombre, coalesce(p.documento, p.dni), p.email, p.telefono,
         p.email_personal, p.celular_personal, p.telefono_personal,
         p.cargo, p.area, p.sede, p.fecha_ingreso, p.regimen_jornada,
         p.dias_ciclo_trabajo, p.dias_ciclo_descanso, p.dias_vacaciones_disponibles
    from public.personal_administrativo p
   where p.auth_user_id::text = auth.uid()::text
      or lower(coalesce(p.email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  limit 1;
$$;

comment on function public.resolver_mi_personal_rrhh() is
  'Autoservicio RRHH: resuelve ficha propia. Las fechas de contrato se consultan en personal_documentos.';
