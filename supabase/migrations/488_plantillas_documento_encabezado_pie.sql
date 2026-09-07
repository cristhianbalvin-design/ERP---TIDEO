-- 488 · Encabezado y pie versionados para plantillas del constructor documental.
-- Ejecutar con el rol propietario del esquema (SET ROLE postgres).
-- El COMMIT de producción queda bajo control manual.

alter table public.plantillas_documento_bloques
  add column encabezado_json jsonb,
  add column encabezado_texto_plano text not null default '',
  add column pie_json jsonb,
  add column pie_texto_plano text not null default '';

select pg_notify('pgrst', 'reload schema');
