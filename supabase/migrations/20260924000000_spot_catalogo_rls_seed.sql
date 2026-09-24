-- Fase Ventas SPOT - Paso 1
-- Catalogo global SUNAT, lectura para tenants y seed verificado.
-- No incluye bienes del Anexo 1 ni codigos reubicados por la RS 086-2025/SUNAT.

create table if not exists public.spot_catalogo (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null,
  anexo             text not null,
  numeral           text,
  descripcion       text not null,
  porcentaje        numeric(5,2) not null,
  monto_minimo      numeric(14,2) not null,
  umbral_operador   text not null default '>',
  vigencia_desde    date not null,
  vigencia_hasta    date,
  fuente_url        text not null,
  fuente_referencia text not null,
  estado            text not null default 'activo',
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  constraint spot_catalogo_anexo_ck
    check (anexo in ('ANEXO_2', 'ANEXO_3', 'TRANSPORTE_BIENES')),
  constraint spot_catalogo_porcentaje_ck
    check (porcentaje >= 0 and porcentaje <= 100),
  constraint spot_catalogo_monto_minimo_ck
    check (monto_minimo >= 0),
  constraint spot_catalogo_umbral_operador_ck
    check (umbral_operador in ('>', '>=')),
  constraint spot_catalogo_vigencia_ck
    check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  constraint spot_catalogo_estado_ck
    check (estado in ('activo', 'inactivo')),
  constraint spot_catalogo_codigo_ck
    check (length(btrim(codigo)) > 0),
  constraint spot_catalogo_fuente_ck
    check (length(btrim(fuente_url)) > 0 and length(btrim(fuente_referencia)) > 0),
  constraint spot_catalogo_codigo_inicio_uk
    unique (codigo, vigencia_desde)
);

create index if not exists spot_catalogo_codigo_vigencia_idx
  on public.spot_catalogo (codigo, vigencia_desde, vigencia_hasta);

create index if not exists spot_catalogo_anexo_estado_idx
  on public.spot_catalogo (anexo, estado);

create or replace function public.validar_spot_catalogo_vigencia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_fin date := coalesce(new.vigencia_hasta + 1, 'infinity'::date);
begin
  if exists (
    select 1
      from public.spot_catalogo actual
     where actual.codigo = new.codigo
       and actual.id <> new.id
       and daterange(
             actual.vigencia_desde,
             coalesce(actual.vigencia_hasta + 1, 'infinity'::date),
             '[)'
           ) && daterange(new.vigencia_desde, v_fin, '[)')
  ) then
    raise exception 'El codigo SPOT % tiene vigencias superpuestas.', new.codigo;
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists spot_catalogo_vigencia_trg on public.spot_catalogo;
create trigger spot_catalogo_vigencia_trg
before insert or update on public.spot_catalogo
for each row execute function public.validar_spot_catalogo_vigencia();

alter table public.spot_catalogo enable row level security;

revoke all on table public.spot_catalogo from public;
revoke all on table public.spot_catalogo from anon;
revoke all on table public.spot_catalogo from authenticated;
grant select on table public.spot_catalogo to authenticated;

drop policy if exists spot_catalogo_authenticated_select on public.spot_catalogo;
create policy spot_catalogo_authenticated_select
on public.spot_catalogo
for select
to authenticated
using (true);

comment on table public.spot_catalogo is
  'Catalogo global versionado de codigos SPOT. Los tenants autenticados solo pueden leerlo.';
comment on column public.spot_catalogo.vigencia_desde is
  'Fecha de inicio de la tasa vigente respaldada por la fuente oficial indicada.';
comment on column public.spot_catalogo.fuente_referencia is
  'Resolucion, fecha o nota de verificacion utilizada para esta fila.';

insert into public.spot_catalogo (
  codigo, anexo, numeral, descripcion, porcentaje, monto_minimo,
  umbral_operador, vigencia_desde, fuente_url, fuente_referencia
)
values
  ('004', 'ANEXO_2', '4',  'Recursos hidrobiologicos', 4.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('005', 'ANEXO_2', '5',  'Maiz amarillo duro', 4.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('007', 'ANEXO_2', '7',  'Caña de azucar', 10.00, 700.00, '>', '2017-10-16',
   'https://www.sunat.gob.pe/legislacion/superin/2017/246-2017.pdf',
   'RS 246-2017/SUNAT; vigencia de tasa desde 2017-10-16.'),
  ('008', 'ANEXO_2', '8',  'Madera', 4.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('009', 'ANEXO_2', '9',  'Arena y piedra', 10.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('010', 'ANEXO_2', '10', 'Residuos y subproductos', 15.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('011', 'ANEXO_2', '11', 'Bienes gravados por renuncia a la exoneracion', 10.00, 700.00, '>', '2018-04-01',
   'https://www.sunat.gob.pe/legislacion/superin/2018/082-2018.pdf',
   'RS 082-2018/SUNAT; vigencia de tasa desde 2018-04-01.'),
  ('014', 'ANEXO_2', '14', 'Carnes y despojos comestibles', 4.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('016', 'ANEXO_2', '16', 'Aceite de pescado', 10.00, 700.00, '>', '2018-04-01',
   'https://www.sunat.gob.pe/legislacion/superin/2018/082-2018.pdf',
   'RS 082-2018/SUNAT; vigencia de tasa desde 2018-04-01.'),
  ('017', 'ANEXO_2', '17', 'Harina, polvo y pellets de pescado', 4.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('023', 'ANEXO_2', '23', 'Leche', 4.00, 700.00, '>', '2018-06-16',
   'https://www.sunat.gob.pe/legislacion/superin/2018/152-2018.pdf',
   'RS 152-2018/SUNAT; vigencia de tasa desde 2018-06-16.'),
  ('031', 'ANEXO_2', '16', 'Oro gravado con el IGV', 10.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('032', 'ANEXO_2', '32', 'Paprika y frutos de capsicum o pimienta', 10.00, 700.00, '>', '2019-08-01',
   'https://www.sunat.gob.pe/legislacion/superin/2019/130-2019.pdf',
   'RS 130-2019/SUNAT; vigencia de tasa desde 2019-08-01.'),
  ('035', 'ANEXO_2', '20', 'Bienes exonerados del IGV', 1.50, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('036', 'ANEXO_2', '11', 'Oro y demas minerales metalicos exonerados del IGV', 1.50, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('039', 'ANEXO_2', '9',  'Minerales no metalicos', 10.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('041', 'ANEXO_2', '41', 'Plomo', 15.00, 700.00, '>', '2019-08-01',
   'https://www.sunat.gob.pe/legislacion/superin/2019/130-2019.pdf',
   'RS 130-2019/SUNAT; vigencia de tasa desde 2019-08-01.'),
  ('012', 'ANEXO_3', '1',  'Intermediacion laboral y tercerizacion', 12.00, 700.00, '>', '2018-04-01',
   'https://www.sunat.gob.pe/legislacion/superin/2018/071-2018.pdf',
   'RS 071-2018/SUNAT; vigencia de tasa desde 2018-04-01.'),
  ('019', 'ANEXO_3', '1',  'Arrendamiento de bienes', 10.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('020', 'ANEXO_3', '2',  'Mantenimiento y reparacion de bienes muebles', 12.00, 700.00, '>', '2018-04-01',
   'https://www.sunat.gob.pe/legislacion/superin/2018/071-2018.pdf',
   'RS 071-2018/SUNAT; vigencia de tasa desde 2018-04-01.'),
  ('021', 'ANEXO_3', '3',  'Movimiento de carga', 10.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('022', 'ANEXO_3', '5',  'Otros servicios empresariales', 12.00, 700.00, '>', '2018-04-01',
   'https://www.sunat.gob.pe/legislacion/superin/2018/071-2018.pdf',
   'RS 071-2018/SUNAT; vigencia de tasa desde 2018-04-01.'),
  ('024', 'ANEXO_3', '6',  'Comision mercantil', 10.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('025', 'ANEXO_3', '7',  'Fabricacion de bienes por encargo', 10.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('026', 'ANEXO_3', '8',  'Servicio de transporte de personas', 10.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('030', 'ANEXO_3', '9',  'Contratos de construccion', 4.00, 700.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24'),
  ('037', 'ANEXO_3', '10', 'Demas servicios gravados con el IGV', 12.00, 700.00, '>', '2018-04-01',
   'https://www.sunat.gob.pe/legislacion/superin/2018/071-2018.pdf',
   'RS 071-2018/SUNAT; vigencia de tasa desde 2018-04-01.'),
  ('044', 'ANEXO_3', '11', 'Servicio de beneficio de minerales metalicos gravado con el IGV', 12.00, 700.00, '>', '2025-04-01',
   'https://www.sunat.gob.pe/legislacion/superin/2025/000086-2025.pdf',
   'RS 086-2025/SUNAT; vigencia de tasa desde 2025-04-01.'),
  ('027', 'TRANSPORTE_BIENES', 'transporte_bienes_via_terrestre', 'Transporte de bienes por via terrestre', 4.00, 400.00, '>', '2026-09-24',
   'https://orientacion.sunat.gob.pe/detracciones-en-el-transporte-de-bienes-por-via-terrestre',
   'Tasa vigente según apéndice SUNAT consultado 2026-09-24')
on conflict (codigo, vigencia_desde) do nothing;

select pg_notify('pgrst', 'reload schema');
