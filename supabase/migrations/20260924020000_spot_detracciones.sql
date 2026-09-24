-- Paso 3 SPOT: obligación trazable y vínculos unidireccionales.

create table public.detracciones (
  id uuid primary key default gen_random_uuid(),
  direccion text not null,
  factura_id text,
  cxc_id text,
  cxp_id text,
  documento_ajuste_id text,
  empresa_id text not null,
  sociedad_id uuid not null,
  spot_catalogo_id uuid,
  codigo_spot text,
  porcentaje numeric(7,4),
  base_soles numeric(18,2) not null default 0,
  monto_detraccion_soles numeric(18,2) not null,
  monto_detraccion_origen numeric(18,2) not null,
  moneda_origen text not null default 'PEN',
  tipo_cambio numeric(18,6),
  tipo_cambio_fuente text,
  origen text not null default 'emision',
  estado text not null default 'pendiente',
  numero_constancia text,
  fecha_constancia date,
  cuenta_destino_id text,
  fecha_limite_deposito date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint detracciones_direccion_documento_ck check (
    (direccion = 'venta' and factura_id is not null and cxc_id is not null and cxp_id is null)
    or (direccion = 'compra' and cxp_id is not null and factura_id is null and cxc_id is null)
  ),
  constraint detracciones_origen_catalogo_ck check (
    origen = 'importacion' or (origen = 'emision' and spot_catalogo_id is not null)
  ),
  constraint detracciones_origen_ck check (origen in ('emision', 'importacion')),
  constraint detracciones_estado_ck check (estado in ('pendiente', 'depositada', 'autodetraida', 'ajustada', 'anulada')),
  constraint detracciones_porcentaje_ck check (porcentaje is null or (porcentaje >= 0 and porcentaje <= 100)),
  constraint detracciones_montos_ck check (base_soles >= 0 and monto_detraccion_soles >= 0 and monto_detraccion_origen >= 0),
  constraint detracciones_tipo_cambio_ck check (
    (moneda_origen = 'PEN' and tipo_cambio is null and tipo_cambio_fuente is null)
    or (moneda_origen <> 'PEN' and tipo_cambio > 0 and tipo_cambio_fuente in ('manual', 'referencial'))
  ),
  constraint detracciones_constancia_numero_ck check (
    numero_constancia is null or length(btrim(numero_constancia)) > 0
  ),
  constraint detracciones_empresa_id_fkey foreign key (empresa_id) references public.empresas(id),
  constraint detracciones_sociedad_id_fkey foreign key (sociedad_id) references public.sociedades(id),
  constraint detracciones_factura_id_fkey foreign key (factura_id) references public.facturas(id),
  constraint detracciones_cxc_id_fkey foreign key (cxc_id) references public.cxc(id),
  constraint detracciones_cxp_id_fkey foreign key (cxp_id) references public.cxp(id),
  constraint detracciones_documento_ajuste_id_fkey foreign key (documento_ajuste_id) references public.facturas(id),
  constraint detracciones_spot_catalogo_id_fkey foreign key (spot_catalogo_id) references public.spot_catalogo(id)
);

create or replace function public.derivar_contexto_detraccion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
  v_sociedad_id uuid;
begin
  if new.direccion = 'venta' then
    select f.empresa_id, f.sociedad_id
      into v_empresa_id, v_sociedad_id
    from public.facturas f
    where f.id = new.factura_id;
  elsif new.direccion = 'compra' then
    select c.empresa_id, c.sociedad_id
      into v_empresa_id, v_sociedad_id
    from public.cxp c
    where c.id = new.cxp_id;
  end if;

  if v_empresa_id is null or v_sociedad_id is null then
    raise exception 'DETRACCION_CONTEXTO_ORIGEN_INVALIDO: el documento debe tener empresa y sociedad';
  end if;

  if new.empresa_id is not null and new.empresa_id is distinct from v_empresa_id then
    raise exception 'DETRACCION_CONTEXTO_EMPRESA_RECHAZADO: empresa_id no coincide con el documento';
  end if;
  if new.sociedad_id is not null and new.sociedad_id is distinct from v_sociedad_id then
    raise exception 'DETRACCION_CONTEXTO_SOCIEDAD_RECHAZADO: sociedad_id no coincide con el documento';
  end if;

  new.empresa_id := v_empresa_id;
  new.sociedad_id := v_sociedad_id;
  return new;
end;
$$;

revoke all on function public.derivar_contexto_detraccion() from public;

create trigger detracciones_derivar_contexto_trg
before insert or update of direccion, factura_id, cxc_id, cxp_id, empresa_id, sociedad_id
on public.detracciones
for each row execute function public.derivar_contexto_detraccion();

alter table public.detracciones enable row level security;

revoke all on public.detracciones from public;
grant select, insert, update on public.detracciones to authenticated;

create policy detracciones_select
on public.detracciones
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any (alcance_usuario.alcance)
  )
);

create policy detracciones_insert
on public.detracciones
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any (alcance_usuario.alcance)
  )
);

create policy detracciones_update
on public.detracciones
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any (alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any (alcance_usuario.alcance)
  )
);

create index detracciones_empresa_sociedad_idx
  on public.detracciones (empresa_id, sociedad_id);

create index detracciones_cxc_idx
  on public.detracciones (cxc_id)
  where cxc_id is not null;

create index detracciones_cxp_idx
  on public.detracciones (cxp_id)
  where cxp_id is not null;

create unique index detracciones_venta_factura_unq
  on public.detracciones (factura_id)
  where direccion = 'venta'
    and documento_ajuste_id is null
    and estado <> 'anulada';

alter table public.cobros_cxc
  add column detraccion_id uuid;

alter table public.cobros_cxc
  add constraint cobros_cxc_detraccion_id_fkey
  foreign key (detraccion_id)
  references public.detracciones(id);

alter table public.movimientos_tesoreria
  add column detraccion_id uuid;

alter table public.movimientos_tesoreria
  add constraint movimientos_tesoreria_detraccion_id_fkey
  foreign key (detraccion_id)
  references public.detracciones(id);

create index cobros_cxc_detraccion_id_idx
  on public.cobros_cxc (detraccion_id)
  where detraccion_id is not null;

create index movimientos_tesoreria_detraccion_id_idx
  on public.movimientos_tesoreria (detraccion_id)
  where detraccion_id is not null;

comment on column public.detracciones.tipo_cambio is
  'Tipo de cambio expresado en soles por dólar (PEN por USD). PEN usa NULL.';

comment on column public.detracciones.tipo_cambio_fuente is
  'Origen del tipo de cambio: manual o referencial.';

comment on column public.detracciones.monto_detraccion_origen is
  'Monto de la detracción en la moneda de origen del documento.';

comment on column public.detracciones.spot_catalogo_id is
  'Versión del código SPOT resuelta por código y vigencia a la fecha del documento.';
