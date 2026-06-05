-- Corrige CxC historica anulada por Nota de Credito total.
-- Caso TIDEO Tech & Strategy: E001-14 anulada por NC01-0001.
update public.cxc cx
set
  estado = 'cancelada',
  saldo = 0,
  updated_at = now()
from public.facturas f
where cx.factura_id = f.id
  and f.numero = 'E001-14'
  and exists (
    select 1
    from public.empresas e
    where e.id = cx.empresa_id
      and (
        e.nombre_comercial ilike '%TIDEO Tech%Strategy%'
        or e.razon_social ilike '%TIDEO Tech%Strategy%'
      )
  )
  and exists (
    select 1
    from public.facturas nc
    where nc.empresa_id = f.empresa_id
      and nc.tipo_documento = 'nota_credito'
      and nc.numero = 'NC01-0001'
      and (
        nc.factura_origen_id = f.id
        or (
          nc.cuenta_id = f.cuenta_id
          and coalesce(nc.os_cliente_id, '') = coalesce(f.os_cliente_id, '')
          and coalesce(nc.moneda, '') = coalesce(f.moneda, '')
          and abs(coalesce(nc.total, 0) - coalesce(f.total, 0)) <= 0.01
        )
      )
  );
