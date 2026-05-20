-- Fase 2: Aislamiento jerárquico de datos CRM.
-- Reemplaza las políticas SELECT de leads y oportunidades para que
-- un asesor solo vea sus propios registros (o los de su equipo si es jefe/supervisor).
-- Usa usuario_puede_ver_registro() de migración 070 — CTE recursivo sobre jefe_user_id.
--
-- Regla:
--   responsable_id IS NULL  → visible para todos con permiso 'ver' (lead sin asignar, de libre captación)
--   responsable_id no null  → solo si usuario_puede_ver_registro() devuelve true
--     que cubre: admin/dirección ve todo, jefatura ve su árbol, operativo solo lo propio

-- ─── LEADS ───────────────────────────────────────────────────────────────────

drop policy if exists crm_leads_select on public.leads;
create policy crm_leads_select on public.leads for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'leads', 'ver')
    and (
      responsable_id is null
      or public.usuario_puede_ver_registro(empresa_id, responsable_id)
    )
  );

-- ─── OPORTUNIDADES ───────────────────────────────────────────────────────────

drop policy if exists crm_oportunidades_select on public.oportunidades;
create policy crm_oportunidades_select on public.oportunidades for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'pipeline', 'ver')
    and (
      responsable_id is null
      or public.usuario_puede_ver_registro(empresa_id, responsable_id)
    )
  );

-- ─── COTIZACIONES (filtro por oportunidad visible) ───────────────────────────
-- Una cotización es visible si la oportunidad asociada es visible para el usuario.
-- Si cotizacion_id no tiene oportunidad (creada directamente), la ve quien tenga permiso.

drop policy if exists crm_cotizaciones_select on public.cotizaciones;
create policy crm_cotizaciones_select on public.cotizaciones for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'cotizaciones', 'ver')
    and (
      oportunidad_id is null
      or exists (
        select 1 from public.oportunidades o
        where o.id = oportunidad_id
          and (
            o.responsable_id is null
            or public.usuario_puede_ver_registro(empresa_id, o.responsable_id)
          )
      )
    )
  );
