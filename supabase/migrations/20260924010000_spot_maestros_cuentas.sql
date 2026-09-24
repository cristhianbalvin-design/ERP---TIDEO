-- Paso 2 SPOT: referencias de catálogo en maestros y clasificación de cuentas.
-- La marcación de cuentas existentes se ejecutará en una migración de datos separada.

alter table public.familia_servicio
  add column spot_catalogo_id uuid;

alter table public.familia_servicio
  add constraint familia_servicio_spot_catalogo_id_fkey
  foreign key (spot_catalogo_id)
  references public.spot_catalogo(id);

alter table public.servicios
  add column spot_catalogo_id uuid;

alter table public.servicios
  add constraint servicios_spot_catalogo_id_fkey
  foreign key (spot_catalogo_id)
  references public.spot_catalogo(id);

alter table public.materiales
  add column spot_catalogo_id uuid;

alter table public.materiales
  add constraint materiales_spot_catalogo_id_fkey
  foreign key (spot_catalogo_id)
  references public.spot_catalogo(id);

alter table public.cuentas_bancarias
  add column es_cuenta_detracciones boolean not null default false;

alter table public.cuentas_bancarias
  add constraint cuentas_bancarias_detracciones_config_ck
  check (
    es_cuenta_detracciones = false
    or (
      moneda = 'PEN'
      and estado = 'activo'
      and sociedad_id is not null
    )
  );

comment on column public.familia_servicio.spot_catalogo_id is
  'Identifica el código SPOT; la tasa se resuelve por vigencia a la fecha del documento.';

comment on column public.servicios.spot_catalogo_id is
  'Identifica el código SPOT; la tasa se resuelve por vigencia a la fecha del documento.';

comment on column public.materiales.spot_catalogo_id is
  'Identifica el código SPOT; la tasa se resuelve por vigencia a la fecha del documento.';

comment on column public.cuentas_bancarias.es_cuenta_detracciones is
  'Cuenta propia destinada a detracciones; si es true debe ser PEN, activa y tener sociedad.';
