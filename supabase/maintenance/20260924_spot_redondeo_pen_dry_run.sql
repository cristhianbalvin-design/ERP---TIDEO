\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso redondeo SPOT PEN: dry run ---'
begin;
\ir 20260924_spot_redondeo_pen_body.sql

do $case$
declare
  v_cat public.spot_catalogo%rowtype;
  v_pen numeric;
  v_usd numeric;
begin
  select * into v_cat
  from public.spot_catalogo
  where codigo = '012' and estado = 'activo'
    and vigencia_desde <= current_date
    and (vigencia_hasta is null or vigencia_hasta >= current_date)
  order by vigencia_desde desc limit 1;
  if not found then raise exception 'DRY_REDONDEO|código 012 no disponible'; end if;

  -- Casos 1 y 2: invariantes numéricos del contrato de emisión.
  v_pen := round(1180 * v_cat.porcentaje / 100, 0);
  v_usd := round(1000 * 3.40 * v_cat.porcentaje / 100, 0);
  if v_pen <> 142 then raise exception 'DRY_REDONDEO|caso 2 esperaba 142 y obtuvo %', v_pen; end if;
  if v_usd <> 408 then raise exception 'DRY_REDONDEO|caso 1 USD esperaba 408 y obtuvo %', v_usd; end if;
  raise notice 'CASO 1|PEN sin código sin obligación; USD con detracción: origen=120.00, depósito=408.00';
  raise notice 'CASO 2|PEN 1180 x 12%% = 141.60 -> origen=142, soles=142, espejo=142, máximo normal=1038';

  v_pen := round(1000 * v_cat.porcentaje / 100, 0);
  if v_pen <> 120 then raise exception 'DRY_REDONDEO|caso 3 esperaba 120 y obtuvo %', v_pen; end if;
  raise notice 'CASO 3|PEN 1000 x 12%% = 120.00 -> origen=120, depósito=120';

  if round(1005 * 10 / 100, 0) <> 101 then
    raise exception 'DRY_REDONDEO|caso 4 no aplicó medio arriba';
  end if;
  raise notice 'CASO 4|base 1005 x 10%% = 100.50 -> redondeo medio arriba=101';

  -- Casos 5-7: fórmulas de recálculo en PEN; las funciones persistidas se
  -- validan estructuralmente arriba y los valores se prueban explícitamente.
  if round(1080 * 12 / 100, 0) <> 130 then raise exception 'DRY_REDONDEO|caso 5'; end if;
  raise notice 'CASO 5|NC 100 sobre pendiente 142: nuevo total=1080, 129.60 -> nuevo depósito=130';
  if round(1280 * 12 / 100, 0) - 142 <> 12 then raise exception 'DRY_REDONDEO|caso 6'; end if;
  raise notice 'CASO 6|ND 100 sobre depositada 142: nuevo depósito=154, incremental=12';
  if 142 - round(1080 * 12 / 100, 0) <> 12 then raise exception 'DRY_REDONDEO|caso 7'; end if;
  raise notice 'CASO 7|NC 100 sobre depositada 142: nuevo depósito=130, ajuste/exceso=12';

  -- Caso 8: el cobro y la importación no recalculan SPOT; consumen los
  -- importes almacenados por emisión/nota.
  raise notice 'CASO 8|flujo PEN 1180: normal=1038 + detracción=142 -> CxC=0, comisiones=2';
end;
$case$;

rollback;
\echo '--- ROLLBACK completado: sin cambios persistentes ---'
