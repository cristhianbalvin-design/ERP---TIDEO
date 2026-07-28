-- Verifica que PRUEBA y un tenant de control devuelvan sus usuarios TIDEO
-- conforme al mismo criterio canonico de cuenta + membresia activas.

BEGIN;

SELECT set_config(
  'request.jwt.claim.sub',
  (
    SELECT u.id
    FROM public.usuarios u
    JOIN public.usuarios_empresas ue ON ue.user_id::text = u.id
    JOIN public.roles r ON r.id = ue.rol_id
    WHERE lower(btrim(u.email)) = 'cristhian@tideo.tech'
      AND ue.empresa_id = 'emp_2000000000'
      AND ue.estado = 'activo'
      AND r.es_admin_empresa = true
    LIMIT 1
  ),
  true
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant_id TEXT;
  v_rpc BIGINT;
  v_directo BIGINT;
BEGIN
  FOREACH v_tenant_id IN ARRAY ARRAY['emp_2000000000', 'emp_20541435833']
  LOOP
    SELECT count(*) INTO v_rpc
    FROM public.get_salud_implementacion_usuarios(v_tenant_id)
    WHERE tipo_usuario = 'tideo';

    SELECT count(DISTINCT u.id) INTO v_directo
    FROM public.usuarios u
    JOIN public.usuarios_empresas ue ON ue.user_id::text = u.id
    WHERE ue.empresa_id = v_tenant_id
      AND ue.estado = 'activo'
      AND lower(u.estado) = 'activo'
      AND lower(btrim(u.email)) LIKE '%@tideo.tech';

    IF v_rpc <> v_directo THEN
      RAISE EXCEPTION
        'Usuarios TIDEO no coinciden para %: RPC %, directo %',
        v_tenant_id,
        v_rpc,
        v_directo;
    END IF;

    IF v_rpc = 0 THEN
      RAISE EXCEPTION
        'El selector TIDEO quedo vacio para %',
        v_tenant_id;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;

