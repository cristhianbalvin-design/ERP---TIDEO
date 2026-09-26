-- Agrega la clasificación opcional del activo para Recepción de Activos de Cliente.
-- Las filas existentes permanecen con NULL; no se realiza backfill.

alter table public.activos
  add column if not exists tipo_activo text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activos'::regclass
      and conname = 'activos_tipo_activo_check'
  ) then
    alter table public.activos
      add constraint activos_tipo_activo_check
      check (tipo_activo is null or tipo_activo in ('componente', 'maquinaria_completa'));
  end if;
end
$$;
