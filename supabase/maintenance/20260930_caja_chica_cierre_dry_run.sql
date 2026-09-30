-- Dry run de 583_caja_chica_cierre_atomico.sql.
-- Ejecutar con psql/Supabase CLI contra el tenant de PRUEBA y nunca contra
-- DIFESMAQ. Todo termina en ROLLBACK.

\encoding UTF8
\echo '--- Caja chica cierre atómico: dry run ---'

begin;
set local role postgres;
set local lock_timeout = '15s';
set local statement_timeout = '5min';

create temp table caja_chica_cierre_old_541 as
select p.oid,
       pg_get_function_identity_arguments(p.oid) as firma,
       pg_get_functiondef(p.oid) as definicion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'registrar_egreso_caja_chica_atomico'
  and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

do $$
begin
  if not exists (select 1 from caja_chica_cierre_old_541) then
    raise exception 'DRY_OLD_541_NO_ENCONTRADA: No se encontró la RPC remota 541 antes de aplicar la migración.';
  end if;
end;
$$;

\ir ../migrations/583_caja_chica_cierre_atomico.sql

\echo '--- Diff de pg_get_functiondef remoto para 541 ---'
with old_lines as (
  select line_no::integer, line
  from regexp_split_to_table(
    (select definicion from caja_chica_cierre_old_541), E'\n'
  ) with ordinality as t(line, line_no)
),
new_lines as (
  select line_no::integer, line
  from regexp_split_to_table(
    (select pg_get_functiondef(p.oid)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'registrar_egreso_caja_chica_atomico'
       and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb'), E'\n'
  ) with ordinality as t(line, line_no)
)
select coalesce(o.line_no, n.line_no) as line_no,
       o.line as remoto_antes,
       n.line as migracion_despues
from old_lines o
full join new_lines n using (line_no)
where o.line is distinct from n.line
order by coalesce(o.line_no, n.line_no);

select
  md5((select definicion from caja_chica_cierre_old_541)) as hash_541_antes,
  md5((select pg_get_functiondef(p.oid)
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'registrar_egreso_caja_chica_atomico'
         and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb')
  ) as hash_541_despues;

\echo '--- Sociedades y fondos sin sociedad del tenant de prueba ---'
select e.id as empresa_id,
       e.multisociedad_habilitado,
       count(s.id) as sociedades,
       count(f.id) filter (where f.sociedad_id is null and f.estado <> 'cerrado') as fondos_abiertos_sin_sociedad
from public.empresas e
left join public.sociedades s on s.empresa_id = e.id
left join public.caja_chica_fondos f on f.empresa_id = e.id
where e.id = 'emp_2000000000'
group by e.id, e.multisociedad_habilitado;

do $$
declare
  v_empresa text := 'emp_2000000000';
  v_sociedad uuid;
  v_sociedad_2 uuid;
  v_cuenta_pen text := 'cb_dry_cc_583_pen';
  v_cuenta_usd text := 'cb_dry_cc_583_usd';
  v_fondo_zero text := 'ccf_dry_cc_583_zero';
  v_fondo_positive text := 'ccf_dry_cc_583_positive';
  v_fondo_destino text := 'ccf_dry_cc_583_destino';
  v_fondo_negative text := 'ccf_dry_cc_583_negative';
  v_fondo_refund text := 'ccf_dry_cc_583_refund';
  v_fondo_currency text := 'ccf_dry_cc_583_currency';
  v_fondo_society text := 'ccf_dry_cc_583_society';
  v_fondo_usd text := 'ccf_dry_cc_583_usd';
  v_result jsonb;
  v_before numeric(14,2);
  v_after numeric(14,2);
  v_count integer;
  v_error text;
begin
  select s.id into v_sociedad
  from public.sociedades s
  where s.empresa_id = v_empresa
  order by s.id
  limit 1;

  if v_sociedad is null then
    v_sociedad := gen_random_uuid();
    insert into public.sociedades(id, empresa_id, codigo, nombre)
    values (v_sociedad, v_empresa, 'DRY-CCC-583-A', 'Dry run caja chica 583 A');
  end if;

  select s.id into v_sociedad_2
  from public.sociedades s
  where s.empresa_id = v_empresa
    and s.id <> v_sociedad
  order by s.id
  limit 1;

  if v_sociedad_2 is null then
    v_sociedad_2 := gen_random_uuid();
    insert into public.sociedades(id, empresa_id, codigo, nombre)
    values (v_sociedad_2, v_empresa, 'DRY-CCC-583-B', 'Dry run caja chica 583 B');
  end if;

  insert into public.cuentas_bancarias(
    id, empresa_id, nombre, banco, moneda, tipo, estado, saldo_inicial, sociedad_id
  ) values
    (v_cuenta_pen, v_empresa, 'Dry run CCC 583 PEN', 'Dry run', 'PEN', 'corriente', 'activo', 0, v_sociedad),
    (v_cuenta_usd, v_empresa, 'Dry run CCC 583 USD', 'Dry run', 'USD', 'corriente', 'activo', 0, v_sociedad)
  on conflict (id) do nothing;

  insert into public.caja_chica_fondos(
    id, empresa_id, nombre, monto_asignado, monto_minimo, cuenta_bancaria_id,
    moneda, estado, fecha_apertura, sociedad_id, tipo_origen
  ) values
    (v_fondo_zero, v_empresa, 'DRY CCC 583 saldo cero', 100, 0, v_cuenta_pen, 'PEN', 'activo', current_date, v_sociedad, 'cuenta_bancaria'),
    (v_fondo_positive, v_empresa, 'DRY CCC 583 origen transferencia', 100, 0, v_cuenta_pen, 'PEN', 'activo', current_date, v_sociedad, 'cuenta_bancaria'),
    (v_fondo_destino, v_empresa, 'DRY CCC 583 destino transferencia', 10, 0, v_cuenta_pen, 'PEN', 'activo', current_date, v_sociedad, 'cuenta_bancaria'),
    (v_fondo_negative, v_empresa, 'DRY CCC 583 saldo negativo', 100, 0, v_cuenta_pen, 'PEN', 'activo', current_date, v_sociedad, 'cuenta_bancaria'),
    (v_fondo_refund, v_empresa, 'DRY CCC 583 devolución bancaria', 80, 0, v_cuenta_pen, 'PEN', 'activo', current_date, v_sociedad, 'cuenta_bancaria'),
    (v_fondo_currency, v_empresa, 'DRY CCC 583 moneda origen', 25, 0, v_cuenta_pen, 'PEN', 'activo', current_date, v_sociedad, 'cuenta_bancaria'),
    (v_fondo_usd, v_empresa, 'DRY CCC 583 moneda destino', 1, 0, v_cuenta_usd, 'USD', 'activo', current_date, v_sociedad, 'cuenta_bancaria'),
    (v_fondo_society, v_empresa, 'DRY CCC 583 sociedad origen', 25, 0, v_cuenta_pen, 'PEN', 'activo', current_date, v_sociedad, 'cuenta_bancaria')
  on conflict (id) do nothing;

  insert into public.caja_chica_fondos(
    id, empresa_id, nombre, monto_asignado, monto_minimo, cuenta_bancaria_id,
    moneda, estado, fecha_apertura, sociedad_id, tipo_origen
  ) values
    ('ccf_dry_cc_583_society_dest', v_empresa, 'DRY CCC 583 sociedad destino', 1, 0, v_cuenta_pen, 'PEN', 'activo', current_date, v_sociedad_2, 'cuenta_bancaria')
  on conflict (id) do nothing;

  insert into public.caja_chica(
    id, empresa_id, fondo_id, sociedad_id, fecha, concepto, monto, moneda, categoria, estado
  ) values
    ('cc_dry_cc_583_zero_expense', v_empresa, v_fondo_zero, v_sociedad, current_date, 'Dry run saldo cero', 100, 'PEN', 'Administrativos', 'registrado'),
    ('cc_dry_cc_583_negative_expense', v_empresa, v_fondo_negative, v_sociedad, current_date, 'Dry run saldo negativo', 120, 'PEN', 'Administrativos', 'registrado');

  -- Saldo cero: cierre directo y saldo persistente recalculado igual a cero.
  v_result := public.cerrar_fondo_caja_chica_atomico(v_fondo_zero);
  if (v_result ->> 'saldo_cerrado')::numeric <> 0
     or (select estado from public.caja_chica_fondos where id = v_fondo_zero) <> 'cerrado'
     or public.calcular_saldo_fondo_caja_chica(v_fondo_zero) <> 0 then
    raise exception 'ASSERT_SALDO_CERO: El fondo de saldo cero no cerró en cero.';
  end if;

  -- Saldo positivo sin destino: rechazo y fondo aún activo.
  begin
    perform public.cerrar_fondo_caja_chica_atomico(v_fondo_positive);
    raise exception 'ASSERT_DESTINO_REQUERIDO: Se aceptó cierre positivo sin destino.';
  exception when others then
    if sqlerrm not like 'DESTINO_REQUERIDO:%' then raise; end if;
  end;
  if (select estado from public.caja_chica_fondos where id = v_fondo_positive) <> 'activo' then
    raise exception 'ASSERT_ATOMICIDAD_DESTINO: El rechazo modificó el estado del fondo.';
  end if;

  -- Transferencia: sin Tesorería, origen cero y destino incrementado exactamente.
  v_before := public.calcular_saldo_fondo_caja_chica(v_fondo_destino);
  v_result := public.cerrar_fondo_caja_chica_atomico(v_fondo_positive, 'transferencia', v_fondo_destino, 'DRY-CCC-583-TRANSFER');
  v_after := public.calcular_saldo_fondo_caja_chica(v_fondo_destino);
  select count(*) into v_count
  from public.movimientos_tesoreria
  where empresa_id = v_empresa
    and vinculo_tipo = 'caja_chica_fondo_cierre'
    and vinculo_id = v_fondo_positive;
  if public.calcular_saldo_fondo_caja_chica(v_fondo_positive) <> 0
     or v_after <> v_before + 100
     or v_count <> 0 then
    raise exception 'ASSERT_TRANSFERENCIA: La transferencia no cuadró sin Tesorería.';
  end if;

  -- Saldo negativo: rechazo y fondo aún activo.
  begin
    perform public.cerrar_fondo_caja_chica_atomico(v_fondo_negative);
    raise exception 'ASSERT_SALDO_NEGATIVO: Se aceptó cierre con saldo negativo.';
  exception when others then
    if sqlerrm not like 'SALDO_NEGATIVO_CIERRE:%' then raise; end if;
  end;
  if (select estado from public.caja_chica_fondos where id = v_fondo_negative) <> 'activo' then
    raise exception 'ASSERT_ATOMICIDAD_NEGATIVO: El rechazo modificó el estado del fondo.';
  end if;

  -- Devolución bancaria: exactamente un ingreso y saldo recalculado cero.
  v_result := public.cerrar_fondo_caja_chica_atomico(v_fondo_refund, 'cuenta_bancaria', v_cuenta_pen, 'DRY-CCC-583-REFUND');
  select count(*) into v_count
  from public.movimientos_tesoreria
  where empresa_id = v_empresa
    and vinculo_tipo = 'caja_chica_fondo_cierre'
    and vinculo_id = v_fondo_refund
    and tipo = 'ingreso';
  if v_count <> 1
     or public.calcular_saldo_fondo_caja_chica(v_fondo_refund) <> 0
     or (select monto_devuelto from public.caja_chica_fondos where id = v_fondo_refund) <> 80 then
    raise exception 'ASSERT_DEVOLUCION: La devolución no creó un único ingreso o no dejó saldo cero.';
  end if;

  -- Moneda distinta: transferencia rechazada.
  begin
    perform public.cerrar_fondo_caja_chica_atomico(v_fondo_currency, 'transferencia', v_fondo_usd, 'DRY-CCC-583-CURRENCY');
    raise exception 'ASSERT_MONEDA: Se aceptó una transferencia entre monedas distintas.';
  exception when others then
    if sqlerrm not like 'MONEDA_NO_COINCIDE:%' then raise; end if;
  end;

  -- Sociedad distinta: transferencia rechazada.
  begin
    perform public.cerrar_fondo_caja_chica_atomico(v_fondo_society, 'transferencia', 'ccf_dry_cc_583_society_dest', 'DRY-CCC-583-SOCIETY');
    raise exception 'ASSERT_SOCIEDAD: Se aceptó una transferencia entre sociedades distintas.';
  exception when others then
    if sqlerrm not like 'SOCIEDAD_NO_COINCIDE:%' then raise; end if;
  end;

  raise notice 'CCC583_OK|saldo_cero=ok|sin_destino=rechazado|negativo=rechazado|transferencia=ok|devolucion=ok|moneda=rechazada|sociedad=rechazada';
end;
$$;

rollback;
\echo 'CCC583_DRY_RUN_ROLLBACK_COMPLETED'
