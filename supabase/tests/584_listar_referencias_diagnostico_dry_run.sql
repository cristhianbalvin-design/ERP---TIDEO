\set ON_ERROR_STOP on
\pset pager off
\pset null 'NULL'
\set VERBOSITY verbose

begin;

\echo '=== MIGRACION EJECUTADA DESDE EL ARCHIVO ==='
\ir ../migrations/584_listar_referencias_diagnostico.sql

create temporary table dry_results (
  case_name text primary key,
  ok boolean not null,
  expected text not null,
  actual text,
  sqlerrm text,
  statement text not null
) on commit drop;

grant select, insert, update on dry_results to authenticated, anon;

insert into public.recepciones_activos_cliente
  (id, empresa_id, numero, activo_id, sociedad_id, estado, estado_custodia)
values
  ('rac_dry_adminin_20260930', 'emp_20541435833', 'DRY-ADMININ-20260930',
   'act_d99478317a5c448db5', 'c13395ae-55ba-49b3-89c4-c1c1c96223fe',
   'pendiente_cotizar', 'recibido'),
  ('rac_dry_null_20260930', 'emp_20541435833', 'DRY-NULL-20260930',
   'act_d99478317a5c448db5', null, 'pendiente_cotizar', 'recibido');

\echo '=== COLUMNAS VERIFICADAS ==='
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'cuentas' and column_name in ('razon_social','nombre_comercial'))
    or (table_name = 'activos' and column_name in ('codigo','nombre','marca','modelo','placa_serie','cliente_propietario_id'))
  )
order by table_name, ordinal_position;

\echo '=== OPORTUNIDADES: ESTADOS Y ETAPAS ==='
select e.nombre_comercial, o.empresa_id, o.estado, o.etapa, count(*) as conteo
from public.oportunidades o
join public.empresas e on e.id = o.empresa_id
group by e.nombre_comercial, o.empresa_id, o.estado, o.etapa
order by e.nombre_comercial, o.estado, o.etapa;

\echo '=== USUARIO WHYNCO Y ROL ==='
select ue.user_id, ue.empresa_id, e.nombre_comercial, r.id as rol_id, r.nombre as rol_nombre,
       ue.estado
from public.usuarios_empresas ue
join public.empresas e on e.id = ue.empresa_id
join public.roles r on r.id = ue.rol_id
where ue.user_id = '03cb9bb6-cd70-4463-81a0-a97b3bb7efae';

\echo '=== CATALOGO DE PERMISOS DEL TECNICO ==='
select pantalla, puede_ver, puede_crear, puede_editar, puede_aprobar,
       puede_anular, puede_exportar, puede_ver_costos, puede_ver_finanzas
from public.permisos_roles
where rol_id = 'rol_emp_20513453711_ops_tecnico'
  and pantalla in ('diagnostico_tecnico','maestros','inventario','ot','partes')
order by pantalla;

\echo '=== POLICIES DE CATALOGOS SI ALGUN CONTEO DA CERO ==='
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'tipos_servicio_interno',
    'familia_trabajo',
    'cargos_empresa',
    'materiales',
    'activos'
  )
order by tablename, policyname;

\echo '=== CATALOGO: TECNICO WHYNCO ==='
savepoint catalogos_whynco;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',
  true
);
do $$
declare
  v_tipos bigint;
  v_familias bigint;
  v_cargos bigint;
  v_materiales bigint;
  v_activos_propios bigint;
  v_error text;
  v_statement text := 'select count(*) from tipos_servicio_interno, familia_trabajo, cargos_empresa, materiales y activos propios';
begin
  begin
    select count(*) into v_tipos from public.tipos_servicio_interno
      where empresa_id = 'emp_20513453711';
    select count(*) into v_familias from public.familia_trabajo
      where empresa_id = 'emp_20513453711';
    select count(*) into v_cargos from public.cargos_empresa
      where empresa_id = 'emp_20513453711';
    select count(*) into v_materiales from public.materiales
      where empresa_id = 'emp_20513453711';
    select count(*) into v_activos_propios from public.activos
      where empresa_id = 'emp_20513453711'
        and propietario_tipo = 'propio'
        and cliente_propietario_id is null;

    insert into dry_results values (
      'catalogos_whynco',
      v_tipos > 0 and v_familias > 0 and v_cargos > 0
        and v_materiales = 0 and v_activos_propios > 0,
      'tipos>0, familias>0, cargos>0, materiales=0 (opcion A), activos_propios>0',
      format(
        'tipos=%s familias=%s cargos=%s materiales=%s activos_propios=%s',
        v_tipos, v_familias, v_cargos, v_materiales, v_activos_propios
      ),
      null,
      v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into dry_results values (
      'catalogos_whynco', false,
      'consultas sin error; materiales=0 es esperado (opcion A)',
      null, v_error, v_statement
    );
  end;
end
$$;
reset role;
release savepoint catalogos_whynco;

\echo '=== CASO A: TECNICO WHYNCO LISTA MANTENIMIENTO ==='
savepoint caso_a;
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
  v_statement text := 'select * from public.listar_referencias_diagnostico(''emp_20513453711'',''mantenimiento'',null)';
begin
  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', null
    );
    insert into dry_results values (
      'a_tecnico_whynco_mantenimiento',
      v_count > 0,
      'filas > 0; la función filtra empresa_id=emp_20513453711',
      format('filas=%s', v_count),
      null,
      v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into dry_results values (
      'a_tecnico_whynco_mantenimiento', false,
      'filas > 0 y sin error', null, v_error, v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_a;

\echo '=== CASO B: SOCIEDAD RESTRINGIDA 3752e906 ==='
savepoint caso_b;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"3752e906-ded9-4f6a-8845-286fe5215356","role":"authenticated"}',
  true
);
do $$
declare
  v_count bigint;
  v_adminin bigint;
  v_fuera bigint;
  v_nulos bigint;
  v_existente bigint;
  v_error text;
  v_statement text := 'select * from listar_referencias_diagnostico(''emp_20541435833'',''mantenimiento'',null) con alcance c13395ae-55ba-49b3-89c4-c1c1c96223fe';
begin
  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20541435833', 'mantenimiento', null
    );
    select count(*) into v_fuera
    from public.listar_referencias_diagnostico(
      'emp_20541435833', 'mantenimiento', null
    )
    where sociedad_id is distinct from 'c13395ae-55ba-49b3-89c4-c1c1c96223fe'::uuid;
    select count(*) into v_nulos
    from public.listar_referencias_diagnostico(
      'emp_20541435833', 'mantenimiento', null
    )
      where sociedad_id is null;
    select count(*) into v_adminin
    from public.listar_referencias_diagnostico(
      'emp_20541435833', 'mantenimiento', null
    )
    where id = 'rac_dry_adminin_20260930';
    select count(*) into v_existente
    from public.listar_referencias_diagnostico(
      'emp_20541435833', 'mantenimiento', null
    )
    where id = 'rac_2c60dea53f2e44558f930a6884590715';

    insert into dry_results values (
      'b_sociedad_restringida_3752',
      v_count = 1 and v_adminin = 1 and v_fuera = 0
        and v_nulos = 0 and v_existente = 0,
      'exactamente rac_dry_adminin_20260930; no NULL ni recepcion b737',
      format('filas=%s adminin=%s fuera_sociedad=%s sociedad_null=%s b737=%s',
        v_count, v_adminin, v_fuera, v_nulos, v_existente),
      null,
      v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into dry_results values (
      'b_sociedad_restringida_3752', false,
      'consulta sin error y ningún resultado fuera de alcance', null, v_error, v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_b;

\echo '=== CASO B2: SOCIEDAD SIN RESTRICCION ==='
savepoint caso_b2;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"252f6a3c-a62d-443c-acf7-a36c22c89763","role":"authenticated"}',
  true
);
do $$
declare
  v_count bigint;
  v_adminin bigint;
  v_nulos bigint;
  v_existente bigint;
  v_error text;
  v_statement text := 'usuario ZAHORY sin restriccion lista las tres RAC';
begin
  begin
    select count(*),
      count(*) filter (where id = 'rac_dry_adminin_20260930'),
      count(*) filter (where id = 'rac_dry_null_20260930'),
      count(*) filter (where id = 'rac_2c60dea53f2e44558f930a6884590715')
    into v_count, v_adminin, v_nulos, v_existente
    from public.listar_referencias_diagnostico(
      'emp_20541435833', 'mantenimiento', null
    );
    insert into dry_results values (
      'b2_sociedad_sin_restriccion',
      v_count = 3 and v_adminin = 1 and v_nulos = 1 and v_existente = 1,
      'exactamente tres RAC: ADMININ, NULL y b737',
      format('filas=%s adminin=%s null=%s b737=%s',
        v_count, v_adminin, v_nulos, v_existente),
      null, v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into dry_results values (
      'b2_sociedad_sin_restriccion', false,
      'consulta sin error y tres RAC exactas', null, v_error, v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_b2;

\echo '=== CASO C: OTRO TENANT ==='
savepoint caso_c;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"3752e906-ded9-4f6a-8845-286fe5215356","role":"authenticated"}',
  true
);
do $$
declare
  v_count bigint;
  v_error text;
  v_statement text := 'select * from listar_referencias_diagnostico(''emp_20513453711'',''mantenimiento'',null) con usuario ZAHORY';
begin
  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', null
    );
    insert into dry_results values (
      'c_otro_tenant',
      v_count = 0,
      '0 filas',
      format('filas=%s', v_count),
      null,
      v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into dry_results values (
      'c_otro_tenant', false, '0 filas y sin error', null, v_error, v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_c;

\echo '=== CASO D: SIN DIAGNOSTICO VER ==='
savepoint caso_d;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"cd005a45-7031-4027-a3cb-e023c89470a8","role":"authenticated"}',
  true
);
do $$
declare
  v_count bigint;
  v_error text;
  v_statement text := 'select * from listar_referencias_diagnostico(''emp_20513453711'',''mantenimiento'',null) con usuario WHYNCO sin diagnostico.ver';
begin
  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', null
    );
    insert into dry_results values (
      'd_sin_diagnostico_ver',
      v_count = 0,
      '0 filas',
      format('filas=%s', v_count),
      null,
      v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into dry_results values (
      'd_sin_diagnostico_ver', false, '0 filas y sin error', null, v_error, v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_d;

\echo '=== CASO E: FABRICACION SOLO ABIERTAS Y NUMERO=NOMBRE ==='
savepoint caso_e;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',
  true
);
select id, numero, cliente, activo, sociedad_id
from public.listar_referencias_diagnostico(
  'emp_20513453711', 'fabricacion', null
)
order by numero;
do $$
declare
  v_count bigint;
  v_invalid bigint;
  v_error text;
  v_statement text := 'select id,numero,cliente,activo,sociedad_id from listar_referencias_diagnostico(''emp_20513453711'',''fabricacion'',null)';
begin
  begin
    select count(*) into v_count
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'fabricacion', null
    );
    select count(*) into v_invalid
    from public.listar_referencias_diagnostico(
      'emp_20513453711', 'fabricacion', null
    )
    where numero is null or btrim(numero) = ''
       or activo is not null or sociedad_id is not null
       or numero = id;

    insert into dry_results values (
      'e_fabricacion_abiertas_nombre',
      v_count > 0 and v_invalid = 0,
      'filas > 0; numero no vacío, distinto de id, activo/sociedad NULL',
      format('filas=%s filas_invalidas=%s', v_count, v_invalid),
      null,
      v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into dry_results values (
      'e_fabricacion_abiertas_nombre', false,
      'consulta sin error y filas válidas', null, v_error, v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_e;

\echo '=== CASO F: ANONIMO SIN EXECUTE ==='
savepoint caso_f;
set local role anon;
select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
do $$
declare
  v_error text;
  v_state text;
  v_statement text := 'select * from public.listar_referencias_diagnostico(''emp_20513453711'',''mantenimiento'',null) como anon';
begin
  begin
    perform * from public.listar_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', null
    );
    insert into dry_results values (
      'f_anon', false,
      'permission denied for function listar_referencias_diagnostico',
      'la llamada no falló', null, v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    get stacked diagnostics v_state = returned_sqlstate;
    insert into dry_results values (
      'f_anon',
      v_error like 'permission denied for function listar_referencias_diagnostico%',
      'permission denied for function listar_referencias_diagnostico',
      format('sqlstate=%s', v_state),
      v_error,
      v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_f;

\echo '=== CASO G: TIPO INVALIDO ==='
savepoint caso_g;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',
  true
);
do $$
declare
  v_error text;
  v_state text;
  v_statement text := 'select * from public.listar_referencias_diagnostico(''emp_20513453711'',''otro'',null)';
begin
  begin
    perform * from public.listar_referencias_diagnostico(
      'emp_20513453711', 'otro', null
    );
    insert into dry_results values (
      'g_tipo_invalido', false,
      'SQLSTATE 22023 y mensaje Tipo de referencia no válido',
      'la llamada no falló', null, v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    get stacked diagnostics v_state = returned_sqlstate;
    insert into dry_results values (
      'g_tipo_invalido',
      v_state = '22023' and v_error like 'Tipo de referencia no válido:%',
      'SQLSTATE 22023 y mensaje Tipo de referencia no válido',
      format('sqlstate=%s', v_state),
      v_error,
      v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_g;

\echo '=== CASO H: SIN DATOS MONETARIOS ==='
savepoint caso_h;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',
  true
);
do $$
declare
  v_rows bigint;
  v_monetarios bigint;
  v_error text;
  v_statement text := 'jsonb_object_keys(to_jsonb(f)) sobre las filas de ambos tipos';
begin
  begin
    select count(*) into v_rows
    from (
      select * from public.listar_referencias_diagnostico(
        'emp_20513453711', 'mantenimiento', null
      )
      union all
      select * from public.listar_referencias_diagnostico(
        'emp_20513453711', 'fabricacion', null
      )
    ) f;

    select count(*) into v_monetarios
    from (
      select * from public.listar_referencias_diagnostico(
        'emp_20513453711', 'mantenimiento', null
      )
      union all
      select * from public.listar_referencias_diagnostico(
        'emp_20513453711', 'fabricacion', null
      )
    ) f
    cross join lateral jsonb_object_keys(to_jsonb(f)) k
    where k like any(array[
      '%costo%', '%precio%', '%monto%', '%tarifa%', '%subtotal%',
      '%total%', '%moneda%', '%margen%'
    ]);

    insert into dry_results values (
      'h_sin_datos_monetarios',
      v_monetarios = 0,
      '0 claves monetarias en la fila devuelta',
      format('filas=%s claves_monetarias=%s', v_rows, v_monetarios),
      null,
      v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into dry_results values (
      'h_sin_datos_monetarios', false,
      'consulta sin error y 0 claves monetarias', null, v_error, v_statement
    );
  end;
end
$$;
reset role;
release savepoint caso_h;

\echo '=== CONTROL DE EXECUTE ==='
select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'listar_referencias_diagnostico'
order by grantee, privilege_type;

\echo '=== RESULTADOS CALCULADOS ==='
select case_name, ok, expected, actual, sqlerrm, statement
from dry_results
order by case_name;

\echo '=== ESTADO DE LA TRANSACCION ANTES DE ROLLBACK ==='
select current_user, session_user, current_setting('transaction_isolation'), txid_current();

select set_config(
  'app.fase3a_dry_results',
  coalesce((select json_agg(x)::text from (select case_name, ok, expected, actual, sqlerrm, statement from dry_results order by case_name) x), '[]'),
  false
);

rollback;
\echo '=== ROLLBACK EJECUTADO; LA FUNCION NO QUEDA APLICADA ==='
select current_setting('app.fase3a_dry_results');
