-- Cotizaciones: normaliza moneda legada '$' a 'USD' (decisión del usuario 2026-10-19).
-- 10 cotizaciones de emp_20541435833 (COT-2026-0001..0006, 3896, 3897, 3901, 3903) se guardaron
-- con '$'; el frontend ya las trata como USD (normalizeCurrencyCode / biComercialMetrics).
-- Respaldo en public.respaldo_cotizaciones_moneda_20261020 para poder revertir.

create table if not exists public.respaldo_cotizaciones_moneda_20261020 (
  cotizacion_id text primary key,
  empresa_id text not null,
  numero text,
  moneda text,
  respaldado_en timestamptz not null default now()
);
alter table public.respaldo_cotizaciones_moneda_20261020 enable row level security;
revoke all on public.respaldo_cotizaciones_moneda_20261020 from anon, authenticated;

insert into public.respaldo_cotizaciones_moneda_20261020 (cotizacion_id, empresa_id, numero, moneda)
select id::text, empresa_id, numero, moneda
  from public.cotizaciones
 where moneda = '$'
on conflict (cotizacion_id) do nothing;

update public.cotizaciones
   set moneda = 'USD'
 where moneda = '$'
   and empresa_id = 'emp_20541435833';

do $$
declare v_resto int; v_resp int; v_usd int;
begin
  select count(*) into v_resto from public.cotizaciones where moneda = '$';
  select count(*) into v_resp from public.respaldo_cotizaciones_moneda_20261020;
  select count(*) into v_usd
    from public.cotizaciones c
    join public.respaldo_cotizaciones_moneda_20261020 r on r.cotizacion_id = c.id::text
   where c.moneda = 'USD';
  if v_resto > 0 then
    raise exception 'Quedan % cotizaciones con moneda $', v_resto;
  end if;
  if v_resp <> 10 or v_usd <> 10 then
    raise exception 'Se esperaban 10 respaldadas y normalizadas: respaldo %, USD %', v_resp, v_usd;
  end if;
end $$;
