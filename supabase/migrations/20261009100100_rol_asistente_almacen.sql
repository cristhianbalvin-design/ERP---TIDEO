-- Rol "Asistente de Almacén" sembrado en todos los tenants (inventario y recepciones:
-- ver/crear/editar). Idempotente; se omite si la empresa ya tiene un rol con ese nombre.
-- Tenants nuevos: trigger AFTER INSERT en empresas.
-- APLICADA EN PRODUCCIÓN el 2026-10-09 desde el SQL Editor; registrar con
-- `supabase migration repair --status applied <versión>`.

CREATE OR REPLACE FUNCTION public.sembrar_rol_asistente_almacen(p_empresa_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_rol_id text;
BEGIN
  IF p_empresa_id IS NULL OR btrim(p_empresa_id) = '' THEN
    RAISE EXCEPTION 'empresa_id requerido';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.empresa_id = p_empresa_id
      AND regexp_replace(
            translate(lower(btrim(r.nombre)), 'áéíóúüñ', 'aeiouun'),
            '\s+', ' ', 'g'
          ) = 'asistente de almacen'
  ) THEN
    RETURN false;
  END IF;

  v_rol_id := 'rol_' || p_empresa_id || '_asistente_almacen_' ||
              substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.roles (id, empresa_id, nombre, descripcion, categoria,
                            es_superadmin, es_admin_empresa, activo)
  VALUES (v_rol_id, p_empresa_id, 'Asistente de Almacén',
          'Rol operativo para inventario y recepciones.',
          'operaciones', false, false, true);

  INSERT INTO public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar,
                                     puede_anular, puede_aprobar, puede_exportar,
                                     puede_ver_costos, puede_ver_finanzas)
  VALUES
    (v_rol_id, 'inventario',  true, true, true, false, false, false, false, false),
    (v_rol_id, 'recepciones', true, true, true, false, false, false, false, false);

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.sembrar_rol_asistente_almacen(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_sembrar_rol_asistente_almacen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.sembrar_rol_asistente_almacen(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_sembrar_rol_asistente_almacen()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_empresas_rol_asistente_almacen ON public.empresas;
CREATE TRIGGER trg_empresas_rol_asistente_almacen
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.trg_sembrar_rol_asistente_almacen();

-- Siembra del rol en las empresas existentes (idempotente)
SELECT public.sembrar_rol_asistente_almacen(e.id) FROM public.empresas e ORDER BY e.id;
