-- TIDEO ERP — Rediseño módulo Ventas + Boleta de Venta en Facturación
-- Migración 174
-- 1. Ajusta la tabla ventas: nuevos estados, nuevos campos, migración de datos.
-- 2. Agrega 'boleta' como tipo válido en facturas.

-- ── 1. Eliminar constraint viejo para poder migrar los datos ─────────────
alter table public.ventas drop constraint if exists ventas_estado_check;

-- ── 2. Migrar datos al nuevo esquema de estados ───────────────────────────
update public.ventas set estado = 'confirmada' where estado = 'emitida';
update public.ventas set estado = 'borrador'   where estado = 'pendiente';
update public.ventas set estado = 'facturada'  where estado = 'cobrada';
update public.ventas set estado = 'confirmada' where estado = 'vencida';

-- ── 3. Crear el nuevo constraint ──────────────────────────────────────────
alter table public.ventas
  add constraint ventas_estado_check
    check (estado in ('borrador', 'confirmada', 'facturada', 'anulada'));

-- ── 4. Agregar campos nuevos (idempotente con IF NOT EXISTS) ──────────────

-- condicion_pago ya puede existir (migración 173); dejamos solo si no está.
alter table public.ventas
  add column if not exists condicion_pago text not null default 'contado'
    check (condicion_pago in ('contado', 'credito'));

alter table public.ventas
  add column if not exists dias_credito integer;

-- Usamos fecha_vencimiento_pago para no colisionar con fecha_vencimiento (migr. 173).
alter table public.ventas
  add column if not exists fecha_vencimiento_pago date;

-- factura_id: text — FK a facturas (id es text en esta tabla)
alter table public.ventas
  add column if not exists factura_id text references public.facturas(id) on delete set null;

-- cxc_id para ventas: text en migr. 173; aquí garantizamos que exista como u     uid si no existe.
-- Si la migración 173 ya lo creó como text, lo dejamos (FK tolerante).
-- Si no existe, lo creamos como uuid con FK.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ventas' and column_name = 'cxc_id'
  ) then
    alter table public.ventas
      add column cxc_id uuid references public.cxc(id) on delete set null;
  end if;
end$$;

-- ── 5. Índice útil para buscar ventas por factura_id ─────────────────────
create index if not exists ventas_factura_id_idx on public.ventas (factura_id)
  where factura_id is not null;

-- ── 6. Boleta de Venta en facturas ────────────────────────────────────────
-- Verificamos si el constraint ya permite 'boleta' antes de modificarlo.
do $$
declare
  v_constraint text;
begin
  select pg_get_constraintdef(oid) into v_constraint
  from pg_constraint
  where conrelid = 'public.facturas'::regclass
    and conname = 'facturas_tipo_documento_check';

  if v_constraint is null or v_constraint not like '%boleta%' then
    -- Eliminar el constraint viejo si existe
    alter table public.facturas drop constraint if exists facturas_tipo_documento_check;
    -- Crear el nuevo incluyendo boleta
    alter table public.facturas
      add constraint facturas_tipo_documento_check
        check (tipo_documento in ('factura', 'nota_credito', 'nota_debito', 'boleta'));
  end if;
end$$;

select pg_notify('pgrst', 'reload schema');
