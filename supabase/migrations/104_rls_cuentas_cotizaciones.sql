-- Fase 2 (completar): Aislamiento jerárquico de cuentas y cotizaciones.
--
-- Problemas que resuelve:
--   1. cuentas — política solo verificaba empresa+permiso, sin jerarquía.
--      Ya tiene responsable_id uuid (backfill en migración 072).
--   2. cotizaciones — no tenía responsable_id propio; heredaba de la oportunidad.
--      Si la oportunidad tiene responsable_id=null → cotización visible a todos.

-- ─── CUENTAS ─────────────────────────────────────────────────────────────────

drop policy if exists crm_cuentas_select on public.cuentas;
create policy crm_cuentas_select on public.cuentas for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'cuentas', 'ver')
    and (
      responsable_id is null
      or public.usuario_puede_ver_registro(empresa_id, responsable_id)
    )
  );

-- ─── COTIZACIONES — columna propia ───────────────────────────────────────────

alter table public.cotizaciones
  add column if not exists responsable_id uuid references auth.users(id) on delete set null;

-- Backfill: copiar responsable_id de la oportunidad vinculada
update public.cotizaciones c
set responsable_id = o.responsable_id
from public.oportunidades o
where o.id = c.oportunidad_id
  and c.responsable_id is null
  and o.responsable_id is not null;

-- ─── COTIZACIONES — política ─────────────────────────────────────────────────
-- Usa el responsable_id propio de la cotización.
-- NULL = cotización no asignada → visible a todos con permiso (libre captación / creación directa).

drop policy if exists crm_cotizaciones_select on public.cotizaciones;
create policy crm_cotizaciones_select on public.cotizaciones for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'cotizaciones', 'ver')
    and (
      responsable_id is null
      or public.usuario_puede_ver_registro(empresa_id, responsable_id)
    )
  );

select pg_notify('pgrst', 'reload schema');
