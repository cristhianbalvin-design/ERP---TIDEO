\set ON_ERROR_STOP on
update public.solpe_interna s
set items = coalesce((
  select jsonb_agg(
    case when jsonb_typeof(x.item) = 'object' then x.item - 'ceco_id' else x.item end
    order by x.item_index
  )
  from jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) with ordinality x(item, item_index)
), '[]'::jsonb)
where s.items is not null;

update public.ordenes_compra o
set items = coalesce((
  select jsonb_agg(
    case when jsonb_typeof(x.item) = 'object' then x.item - 'ceco_id' else x.item end
    order by x.item_index
  )
  from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality x(item, item_index)
), '[]'::jsonb)
where o.items is not null;

set constraints all immediate;

drop trigger if exists trg_cxp_distribucion_after_change on public.cxp;
drop trigger if exists trg_cxp_distribucion_ceco_tenant on public.cxp_distribucion_ceco;
drop trigger if exists trg_cxp_distribucion_ceco_total on public.cxp_distribucion_ceco;
drop trigger if exists trg_cxp_distribucion_cxp_total on public.cxp;

drop function if exists public.cxp_distribucion_after_cxp_change();
drop function if exists public.cxp_reconstruir_distribucion_ceco(text);
drop function if exists public.cxp_validar_distribucion_total();
drop function if exists public.cxp_validar_distribucion_ceco();
drop function if exists public.cxp_lineas_oc_ceco(text);

drop table if exists public.cxp_distribucion_ceco_excepciones;
drop table if exists public.cxp_distribucion_ceco;

drop function if exists public.obtener_lineas_sourcing(text);
\ir 20261005_generar_cxp_centralizado_vigente.sql
\ir 20261005_obtener_lineas_sourcing_vigente.sql

revoke all on function public.generar_cxp_centralizado(jsonb, text, text) from public, anon;
grant execute on function public.generar_cxp_centralizado(jsonb, text, text) to authenticated;
revoke all on function public.obtener_lineas_sourcing(text) from public, anon;
grant execute on function public.obtener_lineas_sourcing(text) to authenticated;
