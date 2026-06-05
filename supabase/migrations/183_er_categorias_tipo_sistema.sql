-- TIDEO ERP - Migracion 183: tipo_sistema para categorias ER
-- Desacopla el nombre visible de la categoria del codigo interno usado por reglas automaticas.

alter table public.er_categorias
  add column if not exists tipo_sistema text;

alter table public.er_categorias
  drop constraint if exists er_categorias_tipo_sistema_chk,
  add constraint er_categorias_tipo_sistema_chk
    check (
      tipo_sistema is null
      or tipo_sistema in (
        'mano_obra',
        'materiales',
        'servicios_terceros',
        'logistica',
        'administrativos',
        'comerciales',
        'gastos_financieros',
        'planilla',
        'cargas_sociales',
        'intereses_financiamiento'
      )
    );

create index if not exists er_categorias_empresa_tipo_sistema_idx
  on public.er_categorias (empresa_id, tipo_sistema)
  where tipo_sistema is not null;

update public.er_categorias
set tipo_sistema = case
  when lower(nombre) like '%mano de obra%' or lower(nombre) like '%mo operativa%' then 'mano_obra'
  when lower(nombre) like '%material%' then 'materiales'
  when lower(nombre) like '%servicio%tercero%' or lower(nombre) like '%tercero%' then 'servicios_terceros'
  when lower(nombre) like '%logistica%' or lower(nombre) like '%logística%' or lower(nombre) like '%logã%stica%' or lower(nombre) like '%transporte%' then 'logistica'
  when lower(nombre) like '%administrativ%' then 'administrativos'
  when lower(nombre) like '%comercial%' then 'comerciales'
  when lower(nombre) like '%gasto%financier%' then 'gastos_financieros'
  when lower(nombre) like '%planilla%' then 'planilla'
  when lower(nombre) like '%carga%social%' or lower(nombre) like '%essalud%' or lower(nombre) like '%cts%' then 'cargas_sociales'
  when lower(nombre) like '%interes%financ%' or lower(nombre) like '%interés%financ%' or lower(nombre) like '%interes%prestamo%' or lower(nombre) like '%interés%préstamo%' then 'intereses_financiamiento'
  else tipo_sistema
end
where tipo_sistema is null;

create or replace function public.crear_categorias_base(p_empresa_id text)
returns void language plpgsql security definer as $$
begin
  insert into public.er_categorias (empresa_id, nombre, seccion, regla_ot, tipo_sistema, es_base, orden)
  values
    (p_empresa_id, 'Mano de obra',       'costo_ventas',       'con_ot',  'mano_obra',           true, 0),
    (p_empresa_id, 'Materiales',         'costo_ventas',       'con_ot',  'materiales',          true, 1),
    (p_empresa_id, 'Servicios terceros', 'costo_ventas',       'con_ot',  'servicios_terceros',  true, 2),
    (p_empresa_id, 'Logistica',          'costo_ventas',       'con_ot',  'logistica',           true, 3),
    (p_empresa_id, 'Administrativos',    'gastos_operativos',  'siempre', 'administrativos',     true, 4),
    (p_empresa_id, 'Comerciales',        'gastos_operativos',  'siempre', 'comerciales',         true, 5),
    (p_empresa_id, 'Gastos financieros', 'gastos_financieros', 'siempre', 'gastos_financieros',  true, 6)
  on conflict (empresa_id, nombre) do update
    set tipo_sistema = excluded.tipo_sistema
    where public.er_categorias.tipo_sistema is null;
end;
$$;

select pg_notify('pgrst', 'reload schema');
