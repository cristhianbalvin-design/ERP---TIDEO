-- 670: Catálogo canónico de pantallas de OPERA y mapa de cobertura de Aria (F0 de Aria modo consultor/analista).
-- Datos globales del producto (no por empresa). Fuente: catalogo/pantallas.json en el repo; se cargan con catalogo/_sincronizar.sql.
-- Aditiva: no modifica permisos ni tablas existentes. Lectura solo para superadministradores de plataforma.

CREATE TABLE IF NOT EXISTS public.aria_catalogo_pantallas (
  clave text PRIMARY KEY,
  app text NOT NULL CHECK (app IN ('admin','operaciones','movil')),
  modulo text NOT NULL,
  titulo text NOT NULL,
  ruta text NOT NULL,
  alias text[] NOT NULL DEFAULT '{}',
  componente text,
  permiso text,
  tipo text NOT NULL CHECK (tipo IN ('menu','subpantalla')),
  estado text NOT NULL CHECK (estado IN ('activa','puente','placeholder','maqueta','legado')),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app, ruta)
);

CREATE TABLE IF NOT EXISTS public.aria_permisos_equivalencias (
  valor text PRIMARY KEY,
  clave_permiso text NOT NULL,
  origen text NOT NULL CHECK (origen IN ('etiqueta_antigua','adicional')),
  nota text
);

CREATE TABLE IF NOT EXISTS public.aria_cobertura (
  clave text PRIMARY KEY REFERENCES public.aria_catalogo_pantallas(clave) ON DELETE CASCADE,
  fichas text[] NOT NULL DEFAULT '{}',
  procesos text[] NOT NULL DEFAULT '{}',
  herramientas_lectura text[] NOT NULL DEFAULT '{}',
  herramientas_registro text[] NOT NULL DEFAULT '{}',
  nivel text NOT NULL CHECK (nivel IN ('completa','parcial','sin_cobertura')),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aria_catalogo_pantallas_permiso_idx ON public.aria_catalogo_pantallas (permiso);

ALTER TABLE public.aria_catalogo_pantallas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aria_permisos_equivalencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aria_cobertura ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aria_catalogo_pantallas_lectura ON public.aria_catalogo_pantallas;
CREATE POLICY aria_catalogo_pantallas_lectura ON public.aria_catalogo_pantallas FOR SELECT TO authenticated USING (public.usuario_es_superadmin_plataforma());
DROP POLICY IF EXISTS aria_permisos_equivalencias_lectura ON public.aria_permisos_equivalencias;
CREATE POLICY aria_permisos_equivalencias_lectura ON public.aria_permisos_equivalencias FOR SELECT TO authenticated USING (public.usuario_es_superadmin_plataforma());
DROP POLICY IF EXISTS aria_cobertura_lectura ON public.aria_cobertura;
CREATE POLICY aria_cobertura_lectura ON public.aria_cobertura FOR SELECT TO authenticated USING (public.usuario_es_superadmin_plataforma());

REVOKE ALL ON public.aria_catalogo_pantallas, public.aria_permisos_equivalencias, public.aria_cobertura FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.aria_catalogo_pantallas, public.aria_permisos_equivalencias, public.aria_cobertura FROM authenticated;
GRANT SELECT ON public.aria_catalogo_pantallas, public.aria_permisos_equivalencias, public.aria_cobertura TO authenticated;

DO $verificacion$
BEGIN
  IF to_regclass('public.aria_catalogo_pantallas') IS NULL OR to_regclass('public.aria_permisos_equivalencias') IS NULL OR to_regclass('public.aria_cobertura') IS NULL THEN
    RAISE EXCEPTION '670: no se crearon las tablas del catálogo de Aria';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('aria_catalogo_pantallas','aria_permisos_equivalencias','aria_cobertura')) <> 3 THEN
    RAISE EXCEPTION '670: faltan políticas de lectura';
  END IF;
  IF has_table_privilege('anon', 'public.aria_catalogo_pantallas', 'SELECT') THEN
    RAISE EXCEPTION '670: anon no debe leer el catálogo';
  END IF;
END
$verificacion$;
