-- Permitir CRUD de turnos usando permisos separados de crear/editar.
DROP POLICY IF EXISTS hr_turnos_all ON public.turnos;
DROP POLICY IF EXISTS turnos_select ON public.turnos;
DROP POLICY IF EXISTS turnos_insert ON public.turnos;
DROP POLICY IF EXISTS turnos_update ON public.turnos;

CREATE POLICY turnos_select ON public.turnos
  FOR SELECT USING (
    public.usuario_tiene_empresa(empresa_id)
    AND public.usuario_puede(empresa_id, 'turnos', 'ver')
  );

CREATE POLICY turnos_insert ON public.turnos
  FOR INSERT WITH CHECK (
    public.usuario_tiene_empresa(empresa_id)
    AND public.usuario_puede(empresa_id, 'turnos', 'crear')
  );

CREATE POLICY turnos_update ON public.turnos
  FOR UPDATE USING (
    public.usuario_tiene_empresa(empresa_id)
    AND public.usuario_puede(empresa_id, 'turnos', 'editar')
  )
  WITH CHECK (
    public.usuario_tiene_empresa(empresa_id)
    AND public.usuario_puede(empresa_id, 'turnos', 'editar')
  );
