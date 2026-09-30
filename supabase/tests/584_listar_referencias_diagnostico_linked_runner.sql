-- Runner exacto usado con: supabase db query --linked --file <este archivo>
-- Todas las escrituras de prueba quedan revertidas por la excepcion final.

begin;

create temporary table dry_results (
  case_name text primary key,
  ok boolean not null,
  expected text not null,
  actual text,
  sqlerrm text,
  statement text not null
) on commit drop;

grant select, insert on dry_results to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',
  true
);

do $$
declare
  v_count bigint;
  v_error text;
  v_state text;
  v_result text;
begin
  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', '0002'
    );
    insert into dry_results values (
      'busqueda_fragmento_numero', v_count > 0,
      'filas > 0 para fragmento 0002',
      format('filas=%s', v_count), null,
      'select count(*) from listar_referencias_diagnostico(''emp_20513453711'',''mantenimiento'',''0002'')'
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values (
      'busqueda_fragmento_numero', false,
      'consulta sin error y filas > 0', null,
      format('[%s] %s', v_state, v_error),
      'select count(*) from listar_referencias_diagnostico(...,''0002'')'
    );
  end;

  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', 'OROPEZA'
    );
    insert into dry_results values (
      'busqueda_cliente', v_count > 0,
      'filas > 0 para cliente FABRICACION INDUSTRIAL OROPEZA DEXTRE SRL',
      format('filas=%s', v_count), null,
      'select count(*) from listar_referencias_diagnostico(''emp_20513453711'',''mantenimiento'',''OROPEZA'')'
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values (
      'busqueda_cliente', false,
      'consulta sin error y filas > 0', null,
      format('[%s] %s', v_state, v_error),
      'select count(*) from listar_referencias_diagnostico(...,''OROPEZA'')'
    );
  end;

  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'fabricacion', 'UNIDAD HIDRAULICA'
    );
    insert into dry_results values (
      'busqueda_nombre_oportunidad', v_count > 0,
      'filas > 0 para fragmento del nombre de oportunidad',
      format('filas=%s', v_count), null,
      'select count(*) from listar_referencias_diagnostico(''emp_20513453711'',''fabricacion'',''UNIDAD HIDRAULICA'')'
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values (
      'busqueda_nombre_oportunidad', false,
      'consulta sin error y filas > 0', null,
      format('[%s] %s', v_state, v_error),
      'select count(*) from listar_referencias_diagnostico(...,''UNIDAD HIDRAULICA'')'
    );
  end;

  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', 'NO_EXISTE_584'
    );
    insert into dry_results values (
      'busqueda_sin_coincidencias', v_count = 0,
      '0 filas', format('filas=%s', v_count), null,
      'select count(*) from listar_referencias_diagnostico(''emp_20513453711'',''mantenimiento'',''NO_EXISTE_584'')'
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values (
      'busqueda_sin_coincidencias', false,
      'consulta sin error y 0 filas', null,
      format('[%s] %s', v_state, v_error),
      'select count(*) from listar_referencias_diagnostico(...,''NO_EXISTE_584'')'
    );
  end;

  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'fabricacion', 'Sandro Calizaya Taco'
    );
    insert into dry_results values (
      'oportunidad_perdida_excluida', v_count = 0,
      '0 filas para oportunidad perdida opp_455772',
      format('filas=%s', v_count), null,
      'select count(*) from listar_referencias_diagnostico(''emp_20513453711'',''fabricacion'',''Sandro Calizaya Taco'')'
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values (
      'oportunidad_perdida_excluida', false,
      'consulta sin error y 0 filas', null,
      format('[%s] %s', v_state, v_error),
      'select count(*) from listar_referencias_diagnostico(...,''Sandro Calizaya Taco'')'
    );
  end;

  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'fabricacion', 'whynco'
    );
    insert into dry_results values (
      'oportunidad_ganada_excluida', v_count = 0,
      '0 filas para oportunidad ganada opp_864773',
      format('filas=%s', v_count), null,
      'select count(*) from listar_referencias_diagnostico(''emp_20513453711'',''fabricacion'',''whynco'')'
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values (
      'oportunidad_ganada_excluida', false,
      'consulta sin error y 0 filas', null,
      format('[%s] %s', v_state, v_error),
      'select count(*) from listar_referencias_diagnostico(...,''whynco'')'
    );
  end;

  begin
    select pg_get_function_result(
      'public.listar_referencias_diagnostico(text,text,text)'::regprocedure
    ) into v_result;
    insert into dry_results values (
      'tipo_resultado',
      v_result = 'TABLE(id text, numero text, cliente text, activo text, sociedad_id uuid)',
      'TABLE(id text, numero text, cliente text, activo text, sociedad_id uuid)',
      v_result, null,
      'select pg_get_function_result(''public.listar_referencias_diagnostico(text,text,text)'')'
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values (
      'tipo_resultado', false,
      'resultado TABLE exacto', null,
      format('[%s] %s', v_state, v_error),
      'select pg_get_function_result(...)'
    );
  end;
end
$$;

reset role;

create temporary table permission_probe (
  antes bigint,
  despues bigint
) on commit drop;
grant select, insert, update on permission_probe to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',
  true
);
insert into permission_probe
select
  (select count(*)
   from public.listar_referencias_diagnostico(
     'emp_20513453711', 'mantenimiento', null
   )),
  0;

reset role;
update public.permisos_roles
set puede_ver = false
where rol_id = 'rol_emp_20513453711_ops_tecnico'
  and pantalla = 'diagnostico_tecnico';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',
  true
);
update permission_probe
set despues = (
  select count(*)
  from public.listar_referencias_diagnostico(
    'emp_20513453711', 'mantenimiento', null
  )
);

reset role;
insert into dry_results
select
  'permiso_03cb_antes_despues',
  antes > 0 and despues = 0,
  'N filas antes (>0) y 0 despues de puede_ver=false',
  format('antes=%s despues=%s', antes, despues),
  null,
  '03cb9bb6: contar con diagnostico.ver=true; update permisos_roles puede_ver=false; volver a contar'
from permission_probe;

do $$
declare
  v_json text;
begin
  select coalesce(json_agg(x)::text, '[]') into v_json
  from (
    select case_name, ok, expected, actual, sqlerrm, statement
    from dry_results
    order by case_name
  ) x;
  raise exception 'LINKED_TEST_RESULTS:%', v_json;
end
$$;
