-- Limpieza puntual y transaccional de datos de prueba del tenant WHYNCO.
-- No es una migracion automatica: se ejecuta manualmente contra el proyecto remoto.

begin;

do $cleanup$
declare
  v_empresa_id text := 'emp_20513453711';
  v_razon_social text;
  v_nombre_comercial text;
begin
  select razon_social, nombre_comercial
    into v_razon_social, v_nombre_comercial
  from public.empresas
  where id = v_empresa_id
  for share;

  if not found
     or upper(coalesce(v_razon_social, '')) <> 'WHYNCO PERU EIRL'
     or upper(coalesce(v_nombre_comercial, '')) <> 'WHYNCO' then
    raise exception 'Guard de limpieza rechazado: el tenant no coincide con WHYNCO.';
  end if;

  create temporary table cleanup_cxc on commit drop as
    select id, factura_id from public.cxc where empresa_id = v_empresa_id;
  create temporary table cleanup_cxp on commit drop as
    select id, gasto_id from public.cxp where empresa_id = v_empresa_id;
  create temporary table cleanup_facturas on commit drop as
    select f.id
    from public.facturas f
    join cleanup_cxc c on c.factura_id = f.id
    where f.empresa_id = v_empresa_id;
  create temporary table cleanup_gastos on commit drop as
    select g.id
    from public.compras_gastos g
    join cleanup_cxp c on c.gasto_id = g.id
    where g.empresa_id = v_empresa_id;
  create temporary table cleanup_detracciones on commit drop as
    select d.id
    from public.detracciones d
    where d.empresa_id = v_empresa_id
      and (d.cxc_id in (select id from cleanup_cxc)
        or d.cxp_id in (select id from cleanup_cxp)
        or d.factura_id in (select id from cleanup_facturas)
        or d.documento_ajuste_id in (select id from cleanup_facturas));

  -- Guardas de integridad para no afectar documentos que no pertenezcan al alcance.
  if exists (
    select 1 from cleanup_cxc c
    where c.factura_id is null
       or not exists (select 1 from cleanup_facturas f where f.id = c.factura_id)
  ) then
    raise exception 'Guard de limpieza rechazado: CxC sin factura WHYNCO.';
  end if;

  -- Dependencias con FK NO ACTION, en orden de hojas hacia cabeceras.
  delete from public.comisiones
  where empresa_id = v_empresa_id
    and (cxc_id in (select id from cleanup_cxc)
      or factura_id in (select id from cleanup_facturas)
      or cobro_cxc_id in (select id from public.cobros_cxc where cxc_id in (select id from cleanup_cxc)));

  delete from public.gestion_cobranza
  where empresa_id = v_empresa_id and cxc_id in (select id from cleanup_cxc);

  delete from public.movimientos_tesoreria
  where empresa_id = v_empresa_id
    and (gasto_id in (select id from cleanup_gastos)
      or vinculo_id in (select id from cleanup_cxp)
      or vinculo_id in (select id from cleanup_cxc)
      or vinculo_id in (select id from cleanup_facturas)
      or detraccion_id in (select id from cleanup_detracciones));

  delete from public.cobros_cxc
  where empresa_id = v_empresa_id
    and (cxc_id in (select id from cleanup_cxc)
      or factura_id in (select id from cleanup_facturas)
      or detraccion_id in (select id from cleanup_detracciones));

  delete from public.cxp_pagos
  where empresa_id = v_empresa_id and cxp_id in (select id from cleanup_cxp);

  delete from public.detracciones
  where id in (select id from cleanup_detracciones);

  delete from public.cxp_notas_proveedor
  where empresa_id = v_empresa_id
    and (cxp_origen_id in (select id from cleanup_cxp)
      or cxp_nota_id in (select id from cleanup_cxp));

  delete from public.devoluciones_proveedor
  where empresa_id = v_empresa_id and cxp_ajuste_id in (select id from cleanup_cxp);

  delete from public.operaciones_intercompania
  where empresa_id = v_empresa_id
    and (cxp_id in (select id from cleanup_cxp)
      or factura_id in (select id from cleanup_facturas));

  delete from public.compras_gastos
  where id in (select id from cleanup_gastos);

  delete from public.cxc
  where id in (select id from cleanup_cxc);

  delete from public.cxp
  where id in (select id from cleanup_cxp);

  delete from public.facturas
  where id in (select id from cleanup_facturas);
end;
$cleanup$;

commit;

select 'cxc_restantes' as chequeo, count(*) as filas
from public.cxc where empresa_id = 'emp_20513453711'
union all
select 'facturas_restantes', count(*)
from public.facturas where empresa_id = 'emp_20513453711'
union all
select 'cxp_restantes', count(*)
from public.cxp where empresa_id = 'emp_20513453711'
union all
select 'pagos_cxp_restantes', count(*)
from public.cxp_pagos where empresa_id = 'emp_20513453711'
union all
select 'gastos_vinculados_cxp_restantes', count(*)
from public.compras_gastos g
where g.empresa_id = 'emp_20513453711' and g.cxp_id is not null
union all
select 'movimientos_financieros_vinculados_restantes', count(*)
from public.movimientos_tesoreria m
where m.empresa_id = 'emp_20513453711'
  and (m.vinculo_tipo in ('cxc','cxp','factura','gasto','detraccion')
    or m.gasto_id is not null or m.detraccion_id is not null);
