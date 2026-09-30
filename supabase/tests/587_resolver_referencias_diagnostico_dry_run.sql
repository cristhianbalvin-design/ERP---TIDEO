begin;

-- La definición siguiente se ejecuta dentro de esta transacción únicamente.
-- Es la misma definición que supabase/migrations/585_resolver_referencias_diagnostico.sql.
create or replace function public.resolver_referencias_diagnostico(
  p_empresa_id text,
  p_tipo text,
  p_ids text[]
)
returns table (
  id text,
  numero text,
  cliente text,
  activo text,
  sociedad_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sociedades uuid[];
  v_ids text[];
  v_id_count integer;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    return;
  end if;

  if not public.usuario_puede(
    p_empresa_id,
    'diagnostico_tecnico',
    'ver'
  ) then
    return;
  end if;

  select coalesce(array_agg(x.id order by x.primera_posicion), '{}'::text[])
    into v_ids
  from (
    select btrim(u.id) as id, min(u.ord) as primera_posicion
    from unnest(coalesce(p_ids, '{}'::text[])) with ordinality as u(id, ord)
    where nullif(btrim(u.id), '') is not null
    group by btrim(u.id)
  ) x;

  v_id_count := coalesce(cardinality(v_ids), 0);
  if v_id_count > 200 then
    raise exception 'La función admite como máximo 200 ids; se recibieron %.', v_id_count
      using errcode = '22023';
  end if;

  if p_tipo = 'mantenimiento' then
    v_sociedades := public.usuario_alcance_sociedades(p_empresa_id);

    return query
    select
      r.id,
      r.numero,
      coalesce(
        nullif(btrim(c.razon_social), ''),
        nullif(btrim(c.nombre_comercial), ''),
        c.id
      ) as cliente,
      concat_ws(
        ' · ',
        a.codigo,
        a.nombre,
        a.marca,
        a.modelo,
        a.placa_serie
      ) as activo,
      r.sociedad_id
    from public.recepciones_activos_cliente r
    join public.activos a
      on a.id = r.activo_id
     and a.empresa_id = r.empresa_id
    left join public.cuentas c
      on c.id = a.cliente_propietario_id
     and c.empresa_id = r.empresa_id
    where r.empresa_id = p_empresa_id
      and r.id = any(v_ids)
      and (
        v_sociedades is null
        or (
          r.sociedad_id is not null
          and r.sociedad_id = any(v_sociedades)
        )
      )
    order by r.numero, r.id;

    return;
  end if;

  if p_tipo = 'fabricacion' then
    return query
    select
      o.id,
      o.nombre,
      coalesce(
        nullif(btrim(c.razon_social), ''),
        nullif(btrim(c.nombre_comercial), ''),
        c.id
      ) as cliente,
      null::text as activo,
      null::uuid as sociedad_id
    from public.oportunidades o
    left join public.cuentas c
      on c.id = o.cuenta_id
     and c.empresa_id = o.empresa_id
    where o.empresa_id = p_empresa_id
      and o.id = any(v_ids)
    order by o.nombre, o.id;

    return;
  end if;

  raise exception 'Tipo de referencia no válido: %', p_tipo
    using errcode = '22023';
end;
$function$;

revoke all on function public.resolver_referencias_diagnostico(text, text, text[])
  from public, anon, service_role;

grant execute on function public.resolver_referencias_diagnostico(text, text, text[])
  to authenticated;

create temporary table dry_results (
  case_name text primary key,
  ok boolean not null,
  expected text not null,
  actual text,
  sqlerrm text,
  sqlstate text,
  statement text not null
) on commit drop;

grant select, insert on dry_results to authenticated, anon;

insert into public.recepciones_activos_cliente
  (id, empresa_id, numero, activo_id, sociedad_id, estado, estado_custodia)
values
  ('rac_585_propia_20260930', 'emp_20541435833', 'DRY-585-PROPIA-20260930',
   'act_d99478317a5c448db5', 'c13395ae-55ba-49b3-89c4-c1c1c96223fe',
   'pendiente_cotizar', 'recibido'),
  ('rac_585_ajena_20260930', 'emp_20541435833', 'DRY-585-AJENA-20260930',
   'act_d99478317a5c448db5', 'b7379adf-a7bd-4883-ac32-f60271ed7b3b',
   'pendiente_cotizar', 'recibido'),
  ('rac_585_null_20260930', 'emp_20541435833', 'DRY-585-NULL-20260930',
   'act_d99478317a5c448db5', null, 'pendiente_cotizar', 'recibido');

create temporary table dry_context as
select
  (select o.id from public.oportunidades o
   where o.empresa_id = 'emp_20513453711' and lower(o.estado) = 'ganada'
   order by o.id limit 1) as oportunidad_ganada,
  (select o.id from public.oportunidades o
   where o.empresa_id = 'emp_20541435833'
   order by o.id limit 1) as oportunidad_otra_empresa,
  exists(
    select 1 from public.oportunidades o
    where o.empresa_id = 'emp_20541435833'
  ) as oportunidad_otra_empresa_existe,
  (select ue.user_id from public.usuarios_empresas ue
   left join public.permisos_roles pr
     on pr.rol_id = ue.rol_id
    and pr.pantalla = 'diagnostico_tecnico'
   where ue.empresa_id = 'emp_20541435833'
     and ue.estado = 'activo'
     and coalesce(pr.puede_ver, false) = false
   order by ue.user_id limit 1) as usuario_sin_permiso;

grant select on dry_context to authenticated;

select * from dry_context;

savepoint caso_1;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}', true);
do $$
declare
  v_count bigint;
  v_own bigint;
  v_foreign bigint;
  v_null bigint;
  v_id text;
  v_error text;
  v_state text;
  v_statement text := $stmt$select * from public.resolver_referencias_diagnostico('emp_20513453711','mantenimiento',array['rac_9d179189e96042ec8550f5406f16521f'])$stmt$;
begin
  begin
    select count(*), min(id) into v_count, v_id
    from public.resolver_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', array['rac_9d179189e96042ec8550f5406f16521f']
    );
    insert into dry_results values (
      'tecnico_resuelve_recepcion',
      v_count = 1 and v_id = 'rac_9d179189e96042ec8550f5406f16521f',
      'count=1 e id=rac_9d179189e96042ec8550f5406f16521f',
      format('count=%s id=%s', v_count, v_id), null, null, v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('tecnico_resuelve_recepcion', false,
      'count=1 e id de la recepción', null, v_error, v_state, v_statement);
  end;
end
$$;
reset role;
release savepoint caso_1;

savepoint caso_2;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}', true);
do $$
declare
  v_count bigint;
  v_id text;
  v_numero text;
  v_opp text;
  v_error text;
  v_state text;
  v_statement text;
begin
  select oportunidad_ganada into v_opp from dry_context;
  v_statement := format(
    'select * from public.resolver_referencias_diagnostico(''emp_20513453711'',''fabricacion'',array[%L])',
    v_opp
  );
  begin
    select count(*), min(id), min(numero) into v_count, v_id, v_numero
    from public.resolver_referencias_diagnostico(
      'emp_20513453711', 'fabricacion', array[v_opp]
    );
    insert into dry_results values (
      'tecnico_resuelve_oportunidad_ganada',
      v_opp is not null and v_count = 1 and v_id = v_opp and v_numero is not null,
      'count=1, id igual a oportunidad_ganada y numero=nombre',
      format('oportunidad=%s count=%s id=%s numero=%s', v_opp, v_count, v_id, v_numero),
      null, null, v_statement
    );
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('tecnico_resuelve_oportunidad_ganada', false,
      'count=1 e id de la oportunidad ganada', null, v_error, v_state, v_statement);
  end;
end
$$;
reset role;
release savepoint caso_2;

savepoint caso_3;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3752e906-ded9-4f6a-8845-286fe5215356","role":"authenticated"}', true);
do $$
declare
  v_count bigint;
  v_own bigint;
  v_foreign bigint;
  v_null bigint;
  v_error text;
  v_state text;
  v_statement text := $stmt$select * from public.resolver_referencias_diagnostico('emp_20541435833','mantenimiento',array['rac_585_propia_20260930','rac_585_ajena_20260930','rac_585_null_20260930'])$stmt$;
begin
  begin
    select
      count(*),
      count(*) filter (where id = 'rac_585_propia_20260930'),
      count(*) filter (where id = 'rac_585_ajena_20260930'),
      count(*) filter (where id = 'rac_585_null_20260930')
      into v_count, v_own, v_foreign, v_null
    from public.resolver_referencias_diagnostico(
      'emp_20541435833', 'mantenimiento',
      array['rac_585_propia_20260930','rac_585_ajena_20260930','rac_585_null_20260930']
    );
    insert into dry_results values ('sociedad_restringida_exacta',
      v_count = 1 and v_own = 1 and v_foreign = 0 and v_null = 0,
      'count=1, propia=1, ajena=0, null=0',
      format('count=%s propia=%s ajena=%s null=%s', v_count, v_own, v_foreign, v_null),
      null, null, v_statement);
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('sociedad_restringida_exacta', false,
      'count=1, propia=1, ajena=0, null=0', null, v_error, v_state, v_statement);
  end;
end
$$;
reset role;
release savepoint caso_3;

savepoint caso_4;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}', true);
do $$
declare
  v_opp text;
  v_exists boolean;
  v_count bigint;
  v_error text;
  v_state text;
  v_statement text;
begin
  begin
    select oportunidad_otra_empresa, oportunidad_otra_empresa_existe
      into v_opp, v_exists
    from dry_context;
    v_statement := format(
      'select * from public.resolver_referencias_diagnostico(''emp_20541435833'',''fabricacion'',array[%L])',
      v_opp
    );
    select count(*) into v_count
    from public.resolver_referencias_diagnostico('emp_20541435833', 'fabricacion', array[v_opp]);
    insert into dry_results values ('otro_tenant', v_exists and v_count = 0,
      'id real existe en empresa consultada y count=0',
      format('existe=%s count=%s', v_exists, v_count), null, null, v_statement);
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('otro_tenant', false,
      'id real existe en empresa consultada y count=0', null, v_error, v_state, v_statement);
  end;
end
$$;
reset role;
release savepoint caso_4;

savepoint caso_5;
set local role authenticated;
do $$
declare
  v_count bigint;
  v_error text;
  v_state text;
  v_statement text := $stmt$select * from public.resolver_referencias_diagnostico('emp_20513453711','mantenimiento',array['rac_9d179189e96042ec8550f5406f16521f'])$stmt$;
begin
  perform set_config('request.jwt.claims', '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}', true);
  begin
    select count(*) into v_count
    from public.resolver_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', array['rac_9d179189e96042ec8550f5406f16521f']
    );
    insert into dry_results values ('sin_permiso_ver_before', v_count > 0,
      'antes>0', format('antes=%s', v_count), null, null, v_statement);
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('sin_permiso_ver_before', false,
      'antes>0', null, v_error, v_state, v_statement);
  end;
end
$$;
reset role;

update public.permisos_roles
set puede_ver = false
where rol_id = (
  select ue.rol_id
  from public.usuarios_empresas ue
  where ue.user_id = '03cb9bb6-cd70-4463-81a0-a97b3bb7efae'
    and ue.empresa_id = 'emp_20513453711'
    and ue.estado = 'activo'
  limit 1
)
and pantalla = 'diagnostico_tecnico';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}', true);
do $$
declare
  v_before bigint;
  v_after bigint;
  v_error text;
  v_state text;
  v_statement text := $stmt$select * from public.resolver_referencias_diagnostico('emp_20513453711','mantenimiento',array['rac_9d179189e96042ec8550f5406f16521f']) after puede_ver=false$stmt$;
begin
  begin
    select nullif(split_part(actual, '=', 2), '')::bigint
      into v_before
    from dry_results
    where case_name = 'sin_permiso_ver_before';
    select count(*) into v_after
    from public.resolver_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento', array['rac_9d179189e96042ec8550f5406f16521f']
    );
    insert into dry_results values ('sin_permiso_ver', v_before > 0 and v_after = 0,
      'antes>0 y después=0', format('antes=%s después=%s', v_before, v_after),
      null, null, v_statement);
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('sin_permiso_ver', false,
      'antes>0 y después=0', null, v_error, v_state, v_statement);
  end;
end
$$;
reset role;
update public.permisos_roles
set puede_ver = true
where rol_id = (
  select ue.rol_id
  from public.usuarios_empresas ue
  where ue.user_id = '03cb9bb6-cd70-4463-81a0-a97b3bb7efae'
    and ue.empresa_id = 'emp_20513453711'
    and ue.estado = 'activo'
  limit 1
)
and pantalla = 'diagnostico_tecnico';
release savepoint caso_5;

savepoint caso_6;
set local role anon;
do $$
declare
  v_error text;
  v_state text;
  v_statement text := $stmt$select * from public.resolver_referencias_diagnostico('emp_20541435833','mantenimiento',array['rac_2c60dea53f2e44558f930a6884590715'])$stmt$;
begin
  begin
    perform * from public.resolver_referencias_diagnostico(
      'emp_20541435833', 'mantenimiento', array['rac_2c60dea53f2e44558f930a6884590715']
    );
    insert into dry_results values ('anon_42501', false, 'SQLSTATE 42501', 'sin error', null, null, v_statement);
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('anon_42501', v_state = '42501',
      'SQLSTATE 42501', v_state || ' ' || v_error, v_error, v_state, v_statement);
  end;
end
$$;
reset role;
release savepoint caso_6;

savepoint caso_7;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}', true);
do $$
declare
  v_ids text[];
  v_error text;
  v_state text;
  v_statement text := 'select * from public.resolver_referencias_diagnostico(emp_20513453711, fabricacion, 201 ids)';
begin
  select array_agg('dry-id-' || g::text order by g) into v_ids from generate_series(1, 201) g;
  begin
    perform * from public.resolver_referencias_diagnostico('emp_20513453711', 'fabricacion', v_ids);
    insert into dry_results values ('mas_de_200_ids', false, 'SQLSTATE 22023', 'sin error', null, null, v_statement);
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('mas_de_200_ids', v_state = '22023',
      'SQLSTATE 22023', v_state || ' ' || v_error, v_error, v_state, v_statement);
  end;
end
$$;
reset role;
release savepoint caso_7;

savepoint caso_8;
do $$
declare
  v_actual text;
  v_expected text := 'TABLE(id text, numero text, cliente text, activo text, sociedad_id uuid)';
  v_statement text := $stmt$select pg_get_function_result('public.resolver_referencias_diagnostico(text,text,text[])'::regprocedure)$stmt$;
begin
  select pg_get_function_result('public.resolver_referencias_diagnostico(text,text,text[])'::regprocedure) into v_actual;
  insert into dry_results values ('tipo_de_retorno', v_actual = v_expected,
    v_expected, v_actual, null, null, v_statement);
exception when others then
  get stacked diagnostics v_actual = message_text;
  insert into dry_results values ('tipo_de_retorno', false, v_expected, null, v_actual, null, v_statement);
end
$$;
release savepoint caso_8;

savepoint caso_9;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}', true);
do $$
declare
  v_count bigint;
  v_id text;
  v_error text;
  v_state text;
  v_statement text := $stmt$select * from public.resolver_referencias_diagnostico('emp_20513453711','mantenimiento',array[NULL,'','  ','rac_9d179189e96042ec8550f5406f16521f'])$stmt$;
begin
  begin
    select count(*), min(id) into v_count, v_id
    from public.resolver_referencias_diagnostico(
      'emp_20513453711', 'mantenimiento',
      array[null, '', '  ', 'rac_9d179189e96042ec8550f5406f16521f']
    );
    insert into dry_results values ('ids_nulos_vacios_ignorados',
      v_count = 1 and v_id = 'rac_9d179189e96042ec8550f5406f16521f',
      'count=1 e id de la recepción válida', format('count=%s id=%s', v_count, v_id),
      null, null, v_statement);
  exception when others then
    get stacked diagnostics v_error = message_text, v_state = returned_sqlstate;
    insert into dry_results values ('ids_nulos_vacios_ignorados', false,
      'count=1 sin error', null, v_error, v_state, v_statement);
  end;
end
$$;
reset role;
release savepoint caso_9;

select case_name, ok, expected, actual, sqlerrm, sqlstate, statement
from dry_results order by case_name;

do $$
declare
  v_bad text;
begin
  select string_agg(
    format('%s actual=%s sqlerrm=%s', case_name, coalesce(actual, 'NULL'), coalesce(sqlerrm, 'NULL')),
    '; ' order by case_name
  ) into v_bad
  from dry_results where not ok;
  if v_bad is not null then
    raise exception 'Pruebas fallidas: %', v_bad using errcode = 'P0001';
  end if;
exception when others then
  raise;
end
$$;

rollback;

select to_regprocedure('public.resolver_referencias_diagnostico(text,text,text[])');
