-- 509 · Permite referenciar la biblioteca publicada de condiciones generales
-- desde una plantilla del Constructor de Bloques.
-- Ejecutar con el rol propietario del esquema (SET ROLE postgres).
-- El COMMIT de producción queda bajo control manual.

alter table public.documento_bloques
  drop constraint if exists documento_bloques_tipo_bloque_check;

alter table public.documento_bloques
  add constraint documento_bloques_tipo_bloque_check
  check (tipo_bloque in ('texto_rico', 'tabla', 'grupo_repetible', 'condiciones_generales'));
