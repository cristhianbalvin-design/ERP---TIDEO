begin;

create temporary table dry_rpc_results (
  case_name text primary key,
  usuario uuid not null,
  ok boolean not null,
  actual text,
  sqlerrm text,
  sqlstate text,
  statement text not null
) on commit drop;

grant insert, select on dry_rpc_results to authenticated;
set local role authenticated;

create function pg_temp.probar_tecnico(p_marker text)
returns void language plpgsql as $test$
declare
  v_familia_id uuid;
  v_familia_id_2 uuid;
  v_tipo_id text;
  v_tipo_id_2 text;
  v_familias bigint;
  v_tipos bigint;
  v_error text;
  v_state text;
  v_familia_nombre text := p_marker || '-familia';
  v_tipo_nombre text := p_marker || '-tipo';
begin
  perform set_config('request.jwt.claims', '{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}', true);
  begin
    select (public.buscar_o_crear_familia_trabajo('emp_20513453711', v_familia_nombre)).id into v_familia_id;
    select (public.buscar_o_crear_familia_trabajo('emp_20513453711', v_familia_nombre)).id into v_familia_id_2;
    select (public.buscar_o_crear_tipo_servicio_interno('emp_20513453711', v_tipo_nombre)).id into v_tipo_id;
    select (public.buscar_o_crear_tipo_servicio_interno('emp_20513453711', v_tipo_nombre)).id into v_tipo_id_2;
    select count(*) into v_familias from public.familia_trabajo where empresa_id='emp_20513453711' and nombre=v_familia_nombre;
    select count(*) into v_tipos from public.tipos_servicio_interno where empresa_id='emp_20513453711' and nombre=v_tipo_nombre;
    insert into dry_rpc_results values ('tecnico_buscar_crear','03cb9bb6-cd70-4463-81a0-a97b3bb7efae',v_familia_id=v_familia_id_2 and v_tipo_id=v_tipo_id_2 and v_familias=1 and v_tipos=1,format('familia_1=%s familia_2=%s tipos_1=%s tipos_2=%s familias=%s tipos=%s',v_familia_id,v_familia_id_2,v_tipo_id,v_tipo_id_2,v_familias,v_tipos),null,null,'RPC familia nuevo/repetido; RPC tipo nuevo/repetido; conteos');
  exception when others then
    get stacked diagnostics v_error=message_text,v_state=returned_sqlstate;
    insert into dry_rpc_results values ('tecnico_buscar_crear','03cb9bb6-cd70-4463-81a0-a97b3bb7efae',false,null,v_error,v_state,'RPC familia nuevo/repetido; RPC tipo nuevo/repetido; conteos');
  end;
end
$test$;

create function pg_temp.probar_solo_ver(p_marker text)
returns void language plpgsql as $test$
declare
  v_familia_error text;
  v_familia_state text;
  v_tipo_error text;
  v_tipo_state text;
  v_familias bigint;
  v_tipos bigint;
  v_familia_nombre text := p_marker || '-solo-ver-familia';
  v_tipo_nombre text := p_marker || '-solo-ver-tipo';
begin
  perform set_config('request.jwt.claims', '{"sub":"31808675-a2ad-4248-8ec3-ba09f7059b8c","role":"authenticated"}', true);
  begin
    perform public.buscar_o_crear_familia_trabajo('emp_20513453711', v_familia_nombre);
  exception when others then
    get stacked diagnostics v_familia_error=message_text,v_familia_state=returned_sqlstate;
  end;
  begin
    perform public.buscar_o_crear_tipo_servicio_interno('emp_20513453711', v_tipo_nombre);
  exception when others then
    get stacked diagnostics v_tipo_error=message_text,v_tipo_state=returned_sqlstate;
  end;
  select count(*) into v_familias from public.familia_trabajo where empresa_id='emp_20513453711' and nombre=v_familia_nombre;
  select count(*) into v_tipos from public.tipos_servicio_interno where empresa_id='emp_20513453711' and nombre=v_tipo_nombre;
  insert into dry_rpc_results values ('solo_ver_familia','31808675-a2ad-4248-8ec3-ba09f7059b8c',v_familia_state='42501' and v_familias=0,format('sqlstate=%s familias=%s',v_familia_state,v_familias),v_familia_error,v_familia_state,'RPC familia sin crear; conteo');
  insert into dry_rpc_results values ('solo_ver_tipo','31808675-a2ad-4248-8ec3-ba09f7059b8c',v_tipo_state='42501' and v_tipos=0,format('sqlstate=%s tipos=%s',v_tipo_state,v_tipos),v_tipo_error,v_tipo_state,'RPC tipo sin crear; conteo');
end
$test$;

do $$
declare v_marker text := 'DRY-FASE3B2-RPC-' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
begin
  perform pg_temp.probar_tecnico(v_marker);
  perform pg_temp.probar_solo_ver(v_marker);
  raise exception 'CAPTURA_RPC_RESULTS:%',(select json_agg(to_jsonb(r) order by r.case_name) from dry_rpc_results r);
end
$$;

rollback;
