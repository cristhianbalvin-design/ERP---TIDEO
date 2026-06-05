-- TIDEO ERP — Migración 184: corregir constraints en tabla cxp
-- Problema 1: personal_id puede tener FK a personal_administrativo (migración 136),
--   bloqueando inserts de colaboradores que están en personal_operativo.
-- Problema 2: cxp_tipo_beneficiario_check solo permite 'proveedor' y 'personal',
--   pero el frontend envía 'colectivo' (tributos) y 'socio_accionista' (dividendos).

-- ─── 1. Eliminar FK de personal_id → personal_administrativo (si existe) ────────
alter table public.cxp
  drop constraint if exists cxp_personal_id_fkey;

-- ─── 2. Ampliar check de tipo_beneficiario para incluir todos los valores válidos ─
alter table public.cxp
  drop constraint if exists cxp_tipo_beneficiario_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cxp'::regclass
      and conname = 'cxp_tipo_beneficiario_check'
  ) then
    alter table public.cxp
      add constraint cxp_tipo_beneficiario_check
        check (tipo_beneficiario in ('proveedor', 'personal', 'colectivo', 'socio_accionista'));
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');
