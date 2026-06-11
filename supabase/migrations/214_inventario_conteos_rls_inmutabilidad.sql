-- WMS conteos fisicos: aislamiento multitenant e inmutabilidad al cerrar.

ALTER TABLE public.inventario_conteos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_conteos_select ON public.inventario_conteos;
CREATE POLICY inv_conteos_select ON public.inventario_conteos
FOR SELECT USING (
  public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id, 'inventario', 'ver')
);

DROP POLICY IF EXISTS inv_conteos_insert ON public.inventario_conteos;
CREATE POLICY inv_conteos_insert ON public.inventario_conteos
FOR INSERT WITH CHECK (
  public.usuario_tiene_empresa(empresa_id)
  AND (
    public.usuario_puede(empresa_id, 'inventario', 'crear')
    OR public.usuario_puede(empresa_id, 'inventario', 'editar')
  )
);

DROP POLICY IF EXISTS inv_conteos_update ON public.inventario_conteos;
CREATE POLICY inv_conteos_update ON public.inventario_conteos
FOR UPDATE USING (
  public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id, 'inventario', 'editar')
) WITH CHECK (
  public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id, 'inventario', 'editar')
);

CREATE OR REPLACE FUNCTION public.bloquear_update_conteo_cerrado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.estado = 'cerrado' THEN
    RAISE EXCEPTION 'Conteo cerrado es inmutable; cree un nuevo conteo para corregir';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_update_conteo_cerrado ON public.inventario_conteos;
CREATE TRIGGER trg_bloquear_update_conteo_cerrado
BEFORE UPDATE ON public.inventario_conteos
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_update_conteo_cerrado();
