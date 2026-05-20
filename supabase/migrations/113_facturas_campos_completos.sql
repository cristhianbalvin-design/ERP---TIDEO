  -- Agrega campos necesarios para el flujo completo de facturación.
  alter table public.facturas
    add column if not exists tipo_documento  text default 'factura',
    add column if not exists glosa           text,
    add column if not exists notas           text,
    add column if not exists condicion_pago  text,
    add column if not exists fecha_vencimiento date,
    add column if not exists os_cliente_id   text references public.os_clientes(id),
    add column if not exists items           jsonb default '[]';
