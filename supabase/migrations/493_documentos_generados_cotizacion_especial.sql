-- 493 · Permite documentos generados vinculados a Cotización Especial.
-- Nota: 485 versionado no contiene la constraint ni la firma efectiva de tres
-- parámetros que existen en producción; esta migración opera sobre esa realidad.

alter table public.documentos_generados
  drop constraint documentos_generados_entidad_tipo_check;

alter table public.documentos_generados
  add constraint documentos_generados_entidad_tipo_check
  check (
    entidad_tipo = any (
      array[
        'personal_administrativo'::text,
        'personal_operativo'::text,
        'cotizacion_especial'::text
      ]
    )
  );

create or replace function public.usuario_puede_documento_generado(
  p_empresa_id text,
  p_entidad_tipo text,
  p_accion text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_entidad_tipo = 'personal_administrativo'
      then public.usuario_puede(p_empresa_id, 'rrhh_admin', p_accion)
    when p_entidad_tipo = 'personal_operativo'
      then public.usuario_puede(p_empresa_id, 'rrhh_operativo', p_accion)
        or public.usuario_puede(p_empresa_id, 'personal_operativo', p_accion)
    when p_entidad_tipo = 'cotizacion_especial' then
      coalesce(public.usuario_puede(p_empresa_id, 'cotizaciones', p_accion), false)
    else false
  end;
$$;

select pg_notify('pgrst', 'reload schema');
