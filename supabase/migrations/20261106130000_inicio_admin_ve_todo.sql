-- Administradores: Mi área muestra todo lo que sus permisos permiten, aunque su ficha tenga un área.
CREATE OR REPLACE FUNCTION public.inicio_mi_contexto(p_empresa_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_personal text[]; v_area text; v_nombre text; v_dominio text; n text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sesión o empresa no autorizada' USING errcode='42501';
  END IF;
  SELECT array_agg(x.id), max(x.area) INTO v_personal, v_area FROM (
    SELECT po.id::text id, coalesce(ae.nombre, nullif(btrim(po.area),'')) area
    FROM public.personal_operativo po
    LEFT JOIN public.areas_empresa ae ON ae.id=po.area_id::text AND ae.empresa_id=po.empresa_id
    WHERE po.empresa_id=p_empresa_id AND po.auth_user_id=auth.uid()
    UNION ALL
    SELECT pa.id::text, coalesce(ae.nombre, nullif(btrim(pa.area),''))
    FROM public.personal_administrativo pa
    LEFT JOIN public.areas_empresa ae ON ae.id=pa.area_id::text AND ae.empresa_id=pa.empresa_id
    WHERE pa.empresa_id=p_empresa_id AND pa.auth_user_id=auth.uid()
  ) x;
  SELECT coalesce(v_area, nullif(btrim(u.area),'')), u.nombre INTO v_area, v_nombre
  FROM public.usuarios u WHERE u.id=auth.uid()::text LIMIT 1;
  n:=translate(lower(coalesce(v_area,'')),'áéíóú','aeiou');
  v_dominio:=CASE
    WHEN n ~ '(finanz|contab|tesorer|administraci)' THEN 'finanzas'
    WHEN n ~ '(talento|recursos humanos|rrhh)' THEN 'rrhh'
    WHEN n ~ '(logist|almacen|compras|abastec)' THEN 'compras'
    WHEN n ~ '(comercial|marketing|ventas)' THEN 'comercial'
    WHEN n ~ '(operac|operativ|produccion|mantenimiento|planeamiento|supervision|proyectos|ingenieria|calidad)' THEN 'operaciones'
    ELSE NULL END;
  IF public.usuario_es_superadmin_plataforma() OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue JOIN public.roles r ON r.id=ue.rol_id
    WHERE ue.user_id=auth.uid() AND ue.empresa_id=p_empresa_id AND ue.estado='activo' AND r.es_admin_empresa
  ) THEN v_dominio:=NULL; END IF;
  RETURN jsonb_build_object('personal_ids',to_jsonb(coalesce(v_personal,ARRAY[]::text[])),
    'area',v_area,'dominio',v_dominio,'nombre',v_nombre);
END $function$;

DO $check$
BEGIN
  IF pg_get_functiondef('public.inicio_mi_contexto(text)'::regprocedure) NOT LIKE '%es_admin_empresa%' THEN
    RAISE EXCEPTION 'inicio_mi_contexto sin regla de administrador';
  END IF;
  IF has_function_privilege('anon','public.inicio_mi_contexto(text)','execute') THEN
    RAISE EXCEPTION 'anon no debe ejecutar inicio_mi_contexto';
  END IF;
END $check$;
