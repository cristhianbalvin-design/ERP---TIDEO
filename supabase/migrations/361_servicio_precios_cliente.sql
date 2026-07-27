-- Precios comerciales específicos por cliente para el catálogo de servicios.
-- btree_gist ya está habilitada en el proyecto remoto; es necesaria para el
-- EXCLUDE de rangos de vigencia.

create table if not exists public.servicio_precios_cliente (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  servicio_id text not null references public.servicios(id) on delete restrict,
  cuenta_id text not null references public.cuentas(id) on delete restrict,
  precio numeric(14,4) not null check (precio >= 0),
  moneda text not null check (moneda in ('PEN', 'USD')),
  fecha_inicio date null,
  fecha_fin date null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint servicio_precios_cliente_rango_valido_check
    check (fecha_inicio is null or fecha_fin is null or fecha_fin >= fecha_inicio)
);

create index if not exists idx_servicio_precios_cliente_resolucion
  on public.servicio_precios_cliente (empresa_id, cuenta_id, servicio_id, activo);

-- Una fila inactiva constituye historial y no participa en la resolución ni
-- bloquea una nueva configuración. Entre filas activas no se admiten rangos
-- superpuestos para la misma combinación servicio/cliente/tenant.
alter table public.servicio_precios_cliente
  drop constraint if exists servicio_precios_cliente_sin_solapamiento;

alter table public.servicio_precios_cliente
  add constraint servicio_precios_cliente_sin_solapamiento
  exclude using gist (
    empresa_id with =,
    servicio_id with =,
    cuenta_id with =,
    daterange(
      coalesce(fecha_inicio, '-infinity'::date),
      coalesce(fecha_fin, 'infinity'::date),
      '[]'
    ) with &&
  ) where (activo = true);

create or replace function public.validar_servicio_precio_cliente_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.servicios s
    where s.id = new.servicio_id
      and s.empresa_id = new.empresa_id
  ) then
    raise exception 'SERVICIO_PRECIO_CLIENTE_SERVICIO_TENANT_INVALIDO';
  end if;

  if not exists (
    select 1
    from public.cuentas c
    where c.id = new.cuenta_id
      and c.empresa_id = new.empresa_id
  ) then
    raise exception 'SERVICIO_PRECIO_CLIENTE_CUENTA_TENANT_INVALIDO';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validar_servicio_precio_cliente_tenant
  on public.servicio_precios_cliente;

create trigger trg_validar_servicio_precio_cliente_tenant
before insert or update on public.servicio_precios_cliente
for each row execute function public.validar_servicio_precio_cliente_tenant();

-- Resuelve la tarifa aplicable a una fecha: primero el acuerdo del cliente;
-- en ausencia de este, el precio general del servicio.
create or replace function public.resolver_precio_servicio_cliente(
  p_empresa_id text,
  p_cuenta_id text,
  p_servicio_id text,
  p_fecha date
)
returns table (
  precio numeric,
  moneda text,
  origen text,
  precio_cliente_id text
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  if p_fecha is null then
    raise exception 'Fecha de emisión obligatoria para resolver el precio.';
  end if;

  return query
  select spc.precio, spc.moneda, 'cliente'::text, spc.id
  from public.servicio_precios_cliente spc
  where spc.empresa_id = p_empresa_id
    and spc.cuenta_id = p_cuenta_id
    and spc.servicio_id = p_servicio_id
    and spc.activo = true
    and (spc.fecha_inicio is null or p_fecha >= spc.fecha_inicio)
    and (spc.fecha_fin is null or p_fecha <= spc.fecha_fin)
  limit 1;

  if found then
    return;
  end if;

  return query
  select s.precio, s.moneda, 'general'::text, null::text
  from public.servicios s
  where s.id = p_servicio_id
    and s.empresa_id = p_empresa_id;
end;
$$;

alter table public.servicio_precios_cliente enable row level security;

drop policy if exists tenant_servicio_precios_cliente_isolation
  on public.servicio_precios_cliente;

create policy tenant_servicio_precios_cliente_isolation
on public.servicio_precios_cliente
for all
using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

grant execute on function public.resolver_precio_servicio_cliente(text, text, text, date)
  to authenticated;

select pg_notify('pgrst', 'reload schema');
