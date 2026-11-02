-- Aditiva: guarda el tipo de gasto elegido en el wizard Nuevo Egreso para egresos pendientes de pago (CxP).
-- generar_cxp_centralizado no se modifica: usa jsonb_populate_record sobre public.cxp y toma la columna nueva del payload.
alter table public.cxp add column if not exists tipo_gasto text;
comment on column public.cxp.tipo_gasto is 'Tipo de gasto (tipos_gasto_empresa.nombre) elegido en el wizard Nuevo Egreso; nivel de detalle bajo categoria_er en el Estado de Resultados.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cxp' and column_name = 'tipo_gasto' and data_type = 'text'
  ) then
    raise exception 'cxp.tipo_gasto no se creo';
  end if;
  if exists (select 1 from public.cxp where tipo_gasto is not null) then
    raise exception 'cxp.tipo_gasto deberia iniciar vacia';
  end if;
end $$;
