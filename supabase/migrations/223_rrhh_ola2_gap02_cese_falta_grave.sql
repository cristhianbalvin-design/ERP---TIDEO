-- TIDEO ERP - RRHH Ola 2 / GAP-02
-- Historial de cese, falta grave y lista de no recontratacion.

alter table if exists public.personal_operativo
  drop constraint if exists personal_operativo_tipo_cese_check;

alter table if exists public.personal_operativo
  add constraint personal_operativo_tipo_cese_check
  check (
    tipo_cese is null
    or tipo_cese in (
      'renuncia_voluntaria',
      'despido_arbitrario',
      'mutuo_acuerdo',
      'vencimiento_contrato',
      'fallecimiento',
      'despido_falta_grave'
    )
  );

alter table if exists public.personal_administrativo
  drop constraint if exists personal_administrativo_tipo_cese_check;

alter table if exists public.personal_administrativo
  add constraint personal_administrativo_tipo_cese_check
  check (
    tipo_cese is null
    or tipo_cese in (
      'renuncia_voluntaria',
      'despido_arbitrario',
      'mutuo_acuerdo',
      'vencimiento_contrato',
      'fallecimiento',
      'despido_falta_grave'
    )
  );

alter table if exists public.liquidaciones_cese
  add column if not exists motivo_falta_grave text,
  add column if not exists evidencia_url text;

alter table if exists public.personal_operativo
  add column if not exists no_recontratar boolean default false,
  add column if not exists no_recontratar_motivo text;

alter table if exists public.personal_administrativo
  add column if not exists no_recontratar boolean default false,
  add column if not exists no_recontratar_motivo text;

create index if not exists idx_personal_operativo_documento
  on public.personal_operativo(empresa_id, documento);

create index if not exists idx_personal_administrativo_documento
  on public.personal_administrativo(empresa_id, documento);

