-- Hace idempotente la importación de materiales por tenant.
-- La clave es opcional para no afectar materiales creados antes de esta mejora.
alter table public.materiales
  add column if not exists clave_importacion text;

create unique index if not exists materiales_empresa_id_clave_importacion_key
  on public.materiales (empresa_id, clave_importacion)
  where clave_importacion is not null;

comment on column public.materiales.clave_importacion is
  'Huella estable de una fila de importación. Permite reintentos idempotentes sin cambiar el código generado del material.';
