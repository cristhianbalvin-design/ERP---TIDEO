-- Regresión fase (a). Ejecutar en producción únicamente dentro de:
-- BEGIN;
-- \\i supabase/migrations/20261005150000_ceco_linea_cxp_distribucion.sql
-- ROLLBACK;

select count(*) as solpes_lineas_sin_ceco
from public.solpe_interna s
cross join lateral jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) item
where nullif(btrim(item ->> 'ceco_id'), '') is null;

select count(*) as oc_lineas_sin_ceco
from public.ordenes_compra o
cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) item
where nullif(btrim(item ->> 'ceco_id'), '') is null;

select count(*) as oc_lineas_ceco_invalido
from public.ordenes_compra o
cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) item
left join public.centros_costo cc
  on cc.id = nullif(btrim(item ->> 'ceco_id'), '')
 and cc.empresa_id = o.empresa_id
where nullif(btrim(item ->> 'ceco_id'), '') is not null
  and cc.id is null;

select count(*) as distribuciones_con_suma_incorrecta
from public.cxp c
join (
  select cxp_id, round(sum(monto), 2) as suma
  from public.cxp_distribucion_ceco
  group by cxp_id
) d on d.cxp_id = c.id
where d.suma <> round(c.monto_total, 2);

select count(*) as cxp_historicas_con_ceco_sin_distribucion
from public.cxp c
left join public.cxp_distribucion_ceco d on d.cxp_id = c.id
where c.centro_costo_id is not null
  and d.id is null;

select p.oid::regprocedure as signature,
       position('cxp_reconstruir_distribucion_ceco' in pg_get_functiondef(p.oid)) as derivacion_server_side,
       position('ceco_id text' in pg_get_functiondef(p.oid)) as sourcing_ceco_output
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('generar_cxp_centralizado', 'obtener_lineas_sourcing')
order by p.proname;

do $$
declare
  v_cxp_id text;
  v_sum numeric;
  v_total numeric;
begin
  select c.id
    into v_cxp_id
  from public.cxp c
  join public.ordenes_compra o on o.id = c.orden_compra_id
  where c.orden_compra_id is not null
    and not exists (
      select 1
      from public.cxp_lineas_oc_ceco(o.id) x
      where x.ceco_id is null
         or x.ceco_empresa_id is distinct from c.empresa_id
         or x.base_subtotal is null
         or x.base_subtotal < 0
    )
  order by c.id
  limit 1;

  if v_cxp_id is not null then
    perform public.cxp_reconstruir_distribucion_ceco(v_cxp_id);
    select round(sum(d.monto), 2), round(c.monto_total, 2)
      into v_sum, v_total
    from public.cxp c
    join public.cxp_distribucion_ceco d on d.cxp_id = c.id
    where c.id = v_cxp_id
    group by c.id;
    if v_sum <> v_total then
      raise exception 'Regresión fallida: CxP % suma % <> total %', v_cxp_id, v_sum, v_total;
    end if;
  end if;
end;
$$;
