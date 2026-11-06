alter table public.tipos_gasto_empresa
  add column if not exists es_no_gasto boolean not null default false;

comment on column public.tipos_gasto_empresa.es_no_gasto is
  'Si es true, los egresos de este tipo mueven dinero sin ser gasto y no deben afectar el Estado de Resultados (se marcan excluir_de_er).';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tipos_gasto_empresa'
      and column_name = 'es_no_gasto' and data_type = 'boolean' and is_nullable = 'NO'
  ) then
    raise exception 'es_no_gasto no quedó creada como boolean not null';
  end if;
  if exists (select 1 from public.tipos_gasto_empresa where es_no_gasto) then
    raise exception 'es_no_gasto debe iniciar en false para todos los tipos existentes';
  end if;
end $$;
