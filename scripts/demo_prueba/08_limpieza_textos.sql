-- Demo PRUEBA · 08 Quita restos de pruebas internas (E2E, QA, nombres reales) en todos los textos de PRUEBA.
create or replace function demo_seed.limpiar_textos() returns int language plpgsql as $$
declare r record; total int := 0; n int;
  reglas text[][] := array[
    ['Cristhian Cesar Balvin Cardenas|Cristhian Balvin|\mCristhian\M','Andrea Molina'],
    ['cristhian[a-z.]*@[a-z.]+|test-admin@tideo\.com','admin@andesindustrial-demo.pe'],
    ['^test$','Administración'],
    ['Cliente Prueba [A-Za-z]+','Agregados Lima Norte S.A.C.'],
    ['Av\. Prueba [0-9]+','Av. Industrial 1450'],
    ['Prueba encoding, Lima','Av. Industrial 1450, Ate'],
    ['Prueba de encoding:? ?',''],
    ['QA prueba V1: ?',''],
    ['Prueba funcional( WMS)?:? ?',''],
    ['Cierre de prueba funcional WMS: ?',''],
    ['Prueba E2E WMS punto 4','Entrega parcial de repuestos'],
    ['Prueba UI 2b-C','Jefe de taller'],
    ['Prueba de etapa 3: verificar versión 2 de la ficha','Actualización de la ficha técnica'],
    ['Descanso prueba','Descanso compensatorio'],
    ['PRUEBA-QA-','GR-'],
    ['Conductor Prueba','Wilber Ccahuana Poma'],
    ['Servicio de prueba A','Kit de filtros de servicio'],
    ['Geocerca PRUEBA','Geocerca Taller Ate'],
    ['Sede de Prueba','Taller Ate'],
    ['Turno prueba ([0-9])','Turno rotativo \1'],
    ['CAMBIOS PRUEBA','Turno rotativo'],
    ['Prueba importador ',''],
    ['TIDEO Consulting','Servicios de mantenimiento'],
    ['TIDEO Labs','Alquiler de flota'],
    ['TIDEO Academy','Capacitación técnica'],
    ['TIDEO Soluciones SaaS','Venta de repuestos'],
    ['TIDEO Studio','Fabricación metalmecánica'],
    ['TIDEO Corporativo / Común','Corporativo / Común'],
    ['^prueba\s*$','Registro duplicado'],
    ['\mE2E[_ -]?:? ?','']];
  i int;
begin
  for r in select c.table_name::text tb, c.column_name::text col from information_schema.columns c
    join information_schema.columns e on e.table_schema=c.table_schema and e.table_name=c.table_name and e.column_name='empresa_id'
    join information_schema.tables tt on tt.table_schema=c.table_schema and tt.table_name=c.table_name and tt.table_type='BASE TABLE'
    where c.table_schema='public' and c.data_type in ('text','character varying') and c.column_name not in ('id','empresa_id')
      and c.column_name !~ '(url|path|html|sha|token|nodo_id)'
      and c.table_name !~ '^(_|auditoria|notif|superadmin|asistente_hist|tideo_salud|tenant_|.*backup)' loop
    for i in 1..array_length(reglas,1) loop
      begin
        execute format('update public.%I set %I = regexp_replace(%I, %L, %L, %L) where empresa_id=%L and %I ~* %L and not (%L = %L and id::text = %L)',
          r.tb, r.col, r.col, reglas[i][1], reglas[i][2], 'gi', 'emp_2000000000', r.col, reglas[i][1], r.tb, 'rrhh_geocercas', 'geo_7fe550669d92');
        get diagnostics n = row_count; total := total + n;
      exception when others then null;
      end;
    end loop;
  end loop;
  update sociedades set codigo = case when es_principal then 'AIS' else 'ARL' end where empresa_id='emp_2000000000';
  return total;
end $$;
do $$ begin set local session_replication_role = replica; perform demo_seed.limpiar_textos(); end $$;
