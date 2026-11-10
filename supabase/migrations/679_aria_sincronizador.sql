-- 679: Rol de mínimo privilegio para que GitHub Actions aplique las sincronizaciones del catálogo y del
-- manual de Aria (workflow sincronizar-aria.yml) en cada merge a main. Solo puede autorizar una
-- sincronización y escribir en las 5 tablas que esos archivos modifican; no lee ni escribe nada más.
-- El rol nace sin login: su contraseña se fija aparte en el SQL Editor (nunca en el repositorio):
--   ALTER ROLE aria_sincronizador WITH LOGIN PASSWORD '<contraseña larga y aleatoria>';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aria_sincronizador') THEN
    CREATE ROLE aria_sincronizador NOLOGIN NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO aria_sincronizador;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asistente_manual_fichas, public.asistente_manual_pasos,
  public.aria_catalogo_pantallas, public.aria_permisos_equivalencias, public.aria_cobertura TO aria_sincronizador;
GRANT SELECT, INSERT, UPDATE ON public.aria_sincronizacion_revision TO aria_sincronizador;
GRANT USAGE, SELECT ON SEQUENCE public.asistente_manual_pasos_id_seq TO aria_sincronizador;
GRANT EXECUTE ON FUNCTION public.aria_sincronizacion_autorizar(text, integer, text) TO aria_sincronizador;
ALTER ROLE aria_sincronizador SET statement_timeout = '60s';

-- Las tablas tienen RLS: el rol necesita su propia política. Las escrituras siguen exigiendo
-- aria_sincronizacion_autorizar (trigger aria_sincronizacion_exigir), igual que para cualquier otro rol.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['asistente_manual_fichas', 'asistente_manual_pasos', 'aria_catalogo_pantallas',
                           'aria_permisos_equivalencias', 'aria_cobertura', 'aria_sincronizacion_revision'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS aria_sincronizador_todo ON public.%I', t);
    EXECUTE format('CREATE POLICY aria_sincronizador_todo ON public.%I FOR ALL TO aria_sincronizador USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Comprobación: si algo no quedó como se espera, se revierte toda la migración.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aria_sincronizador') THEN RAISE EXCEPTION '679: falta el rol'; END IF;
  IF (SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = 'aria_sincronizador') THEN RAISE EXCEPTION '679: el rol tiene privilegios de más'; END IF;
  IF NOT has_function_privilege('aria_sincronizador', 'public.aria_sincronizacion_autorizar(text,integer,text)', 'EXECUTE') THEN RAISE EXCEPTION '679: no puede autorizar'; END IF;
  IF has_table_privilege('aria_sincronizador', 'public.empresas', 'SELECT') THEN RAISE EXCEPTION '679: el rol no debe leer otras tablas'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE policyname = 'aria_sincronizador_todo') <> 6 THEN RAISE EXCEPTION '679: faltan políticas'; END IF;
END $$;
