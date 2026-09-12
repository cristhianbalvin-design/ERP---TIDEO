-- Trazabilidad opcional: una Hoja de Costeo puede nacer desde un activo
-- recibido en taller. No altera RLS ni cambia el estado de la recepción.

alter table public.hojas_costeo
  add column if not exists activo_id text,
  add column if not exists recepcion_id text;

do $$
declare
  v_tipo_activo text;
  v_tipo_recepcion text;
begin
  select data_type into v_tipo_activo
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'hojas_costeo'
    and column_name = 'activo_id';

  select data_type into v_tipo_recepcion
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'hojas_costeo'
    and column_name = 'recepcion_id';

  if v_tipo_activo is distinct from 'text' then
    raise exception 'HOJAS_COSTEO_ACTIVO_RECEPCION: hojas_costeo.activo_id debe ser text; se encontró %.', v_tipo_activo;
  end if;
  if v_tipo_recepcion is distinct from 'text' then
    raise exception 'HOJAS_COSTEO_ACTIVO_RECEPCION: hojas_costeo.recepcion_id debe ser text; se encontró %.', v_tipo_recepcion;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hojas_costeo'::regclass
      and conname = 'hojas_costeo_activo_id_fkey'
  ) then
    alter table public.hojas_costeo
      add constraint hojas_costeo_activo_id_fkey
      foreign key (activo_id) references public.activos(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hojas_costeo'::regclass
      and conname = 'hojas_costeo_recepcion_id_fkey'
  ) then
    alter table public.hojas_costeo
      add constraint hojas_costeo_recepcion_id_fkey
      foreign key (recepcion_id) references public.recepciones_activos_cliente(id);
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
