-- Cierra las politicas FOR ALL abiertas creadas por las migraciones 211 y 220.
-- El aislamiento es exclusivamente por membresia activa de empresa; los permisos
-- funcionales y el alcance por sociedad quedan fuera de esta migracion.

DROP POLICY IF EXISTS "tenant_correlativos"
  ON public.correlativos_documentos;
CREATE POLICY "tenant_correlativos"
  ON public.correlativos_documentos
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_ov"
  ON public.ordenes_venta;
CREATE POLICY "tenant_ov"
  ON public.ordenes_venta
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_ov_lineas"
  ON public.ordenes_venta_lineas;
CREATE POLICY "tenant_ov_lineas"
  ON public.ordenes_venta_lineas
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_guias"
  ON public.guias_remision;
CREATE POLICY "tenant_guias"
  ON public.guias_remision
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_guias_lineas"
  ON public.guias_remision_lineas;
CREATE POLICY "tenant_guias_lineas"
  ON public.guias_remision_lineas
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_catalogo_venta"
  ON public.catalogo_venta;
CREATE POLICY "tenant_catalogo_venta"
  ON public.catalogo_venta
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_transportistas"
  ON public.transportistas;
CREATE POLICY "tenant_transportistas"
  ON public.transportistas
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_vehiculos"
  ON public.vehiculos_transporte;
CREATE POLICY "tenant_vehiculos"
  ON public.vehiculos_transporte
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_conductores"
  ON public.conductores_transporte;
CREATE POLICY "tenant_conductores"
  ON public.conductores_transporte
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_devoluciones_proveedor"
  ON public.devoluciones_proveedor;
CREATE POLICY "tenant_devoluciones_proveedor"
  ON public.devoluciones_proveedor
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS "tenant_devoluciones_proveedor_lineas"
  ON public.devoluciones_proveedor_lineas;
CREATE POLICY "tenant_devoluciones_proveedor_lineas"
  ON public.devoluciones_proveedor_lineas
  FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));
