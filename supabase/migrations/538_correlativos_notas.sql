-- Correlativos propios de NC/ND. La semilla se calcula desde facturas existentes.

with destinos as (
  select e.id as empresa_id, s.id as sociedad_id
  from public.empresas e
  join public.sociedades s on s.empresa_id = e.id
  union all
  select e.id as empresa_id, null::uuid as sociedad_id
  from public.empresas e
  where not exists (select 1 from public.sociedades s where s.empresa_id = e.id)
), tipos as (
  select 'nota_credito'::text as tipo_documento, 'NC01'::text as serie
  union all
  select 'nota_debito'::text, 'ND01'::text
)
insert into public.correlativos_documentos
  (id, empresa_id, tipo_documento, serie, ultimo_numero, sociedad_id)
select
  'corr_nota_' || md5(d.empresa_id || '|' || t.tipo_documento || '|' || t.serie || '|' || coalesce(d.sociedad_id::text, 'sin-sociedad')),
  d.empresa_id,
  t.tipo_documento,
  t.serie,
  coalesce(max(
    case
      when f.numero ~ ('^' || t.serie || '-[0-9]+$')
        then substring(f.numero from '[0-9]+$')::integer
      else null
    end
  ), 0),
  d.sociedad_id
from destinos d
cross join tipos t
left join public.facturas f
  on f.empresa_id = d.empresa_id
 and f.tipo_documento = t.tipo_documento
 and f.sociedad_id is not distinct from d.sociedad_id
group by d.empresa_id, d.sociedad_id, t.tipo_documento, t.serie
on conflict do nothing;
