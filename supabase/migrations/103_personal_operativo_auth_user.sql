-- Fase 3: Puente entre personal_operativo y auth.users.
-- Permite aplicar aislamiento jerárquico a datos operativos (partes, OTs).
--
-- Flujo:
--   1. Se agrega auth_user_id uuid a personal_operativo
--   2. Al crear/editar un técnico en RRHH, el admin vincula su cuenta de sistema
--   3. Las políticas RLS de partes_diarios usan ese campo para consultar
--      usuario_puede_ver_registro(empresa_id, po.auth_user_id)

-- ─── COLUMNA ─────────────────────────────────────────────────────────────────

alter table public.personal_operativo
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_personal_operativo_auth_user
  on public.personal_operativo(empresa_id, auth_user_id)
  where auth_user_id is not null;

-- ─── RLS PARTES DIARIOS ───────────────────────────────────────────────────────
-- Reemplaza la política SELECT existente.
-- Regla:
--   tecnico sin auth_user_id → solo admin/dirección pueden ver (fallback seguro)
--   tecnico con auth_user_id → usuario_puede_ver_registro evalúa jerarquía completa

drop policy if exists ops_partes_select on public.partes_diarios;
create policy ops_partes_select on public.partes_diarios for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'partes', 'ver')
    and public.usuario_puede_ver_registro(
      empresa_id,
      (
        select po.auth_user_id
        from public.personal_operativo po
        where po.id = tecnico_id
          and po.empresa_id = partes_diarios.empresa_id
        limit 1
      )
    )
  );

-- ─── RLS ORDENES DE TRABAJO ───────────────────────────────────────────────────
-- Las OTs tienen responsable (text) y supervisor (text), no UUIDs.
-- Por ahora se mantiene la política existente (todos con permiso 'operaciones' ven todas las OTs).
-- Esto es intencional: las OTs son documentos de coordinación que el equipo completo necesita ver.
-- El aislamiento a nivel de OT se implementará cuando se agregue responsable_id uuid a ordenes_trabajo.

-- ─── RLS PLANNER_ASIGNACIONES ────────────────────────────────────────────────
-- Un técnico solo debe ver sus propias asignaciones en la vista de campo.
-- El planner completo (backoffice) lo ve quien tenga permiso 'planner'.

drop policy if exists ops_planner_asignaciones_select on public.planner_asignaciones;
create policy ops_planner_asignaciones_select on public.planner_asignaciones for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      -- Vista backoffice: quien tenga permiso de ver planner ve todo
      public.usuario_puede(empresa_id, 'planner', 'ver')
      -- Vista campo: el técnico ve solo sus propias asignaciones
      or exists (
        select 1 from public.personal_operativo po
        where po.id = tecnico_id
          and po.empresa_id = planner_asignaciones.empresa_id
          and po.auth_user_id = auth.uid()
      )
    )
  );
