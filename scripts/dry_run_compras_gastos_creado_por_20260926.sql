\set ON_ERROR_STOP on
\encoding UTF8
set client_encoding = 'UTF8';
set lock_timeout = '5s';
set statement_timeout = '120s';
begin;
\ir ../supabase/migrations/20260926204220_compras_gastos_creado_por.sql

select empresa_id,
       count(*) filter (where orden_compra_id is not null and creado_por is not null) as via_oc,
       count(*) filter (where orden_compra_id is null and creado_por is not null) as via_cxp,
       count(*) filter (where creado_por is null) as autor_null
from public.compras_gastos
group by empresa_id
order by empresa_id;

do $$
declare
  v_empresa text := 'emp_2000000000';
  v_user uuid := '67b0e438-8712-40c0-ae60-006fbdd3c577';
  v_result jsonb;
  v_gasto_autor uuid;
  v_backoffice_autor uuid;
begin
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  v_result := public.registrar_compra_campo(jsonb_build_object(
    'empresa_id', v_empresa,
    'crear_cxp', false,
    'gasto', jsonb_build_object(
      'id', 'gasto_autorrpc20260926abcdefghijkl',
      'descripcion', 'Dry run autor RPC',
      'monto', 1,
      'fecha', current_date,
      'centro_costo_id', 'ceco_03ee8fb3d1db45f49d',
      'ruc_proveedor', '20999990006',
      'num_comprobante', 'AUTOR-RPC-001',
      'metodo_pago', 'Efectivo'
    ),
    'adjunto', jsonb_build_object(
      'bucket', 'documentos-generales',
      'storage_path', v_empresa || '/compras_gastos/gasto_autorrpc20260926abcdefghijkl/a.jpg',
      'url', 'https://example.test/a.jpg',
      'nombre_original', 'a.jpg'
    )
  ));

  select creado_por into v_gasto_autor
  from public.compras_gastos
  where id = 'gasto_autorrpc20260926abcdefghijkl';

  insert into public.compras_gastos(
    id, empresa_id, tipo, descripcion, categoria, monto, moneda, fecha,
    origen_registro, estado, estado_pago, es_activo_fijo, sociedad_id
  )
  values(
    'gasto_autor_backoffice20260926', v_empresa, 'gasto',
    'Dry run autor backoffice', 'Regresion', 1, 'PEN', current_date,
    'backoffice', 'registrado', 'pendiente', false,
    '609a2f33-d057-411f-a001-4e3e83f700d0'
  );

  select creado_por into v_backoffice_autor
  from public.compras_gastos
  where id = 'gasto_autor_backoffice20260926';

  raise notice 'autor RPC: esperado=% actual=% resultado=%', v_user, v_gasto_autor, case when v_gasto_autor = v_user then 'OK' else 'FALLO' end;
  raise notice 'autor backoffice: esperado=% actual=% resultado=%', v_user, v_backoffice_autor, case when v_backoffice_autor = v_user then 'OK' else 'FALLO' end;
  if v_gasto_autor is distinct from v_user or v_backoffice_autor is distinct from v_user then
    raise exception 'El default auth.uid() no persistio el autor esperado';
  end if;
end;
$$;

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'compras_gastos'
  and column_name = 'creado_por';

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'compras_gastos'
  and indexname = 'idx_compras_gastos_empresa_creado_por';

rollback;
