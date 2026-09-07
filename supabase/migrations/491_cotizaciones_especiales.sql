-- 491 · Cotizaciones Especiales: fuente transaccional del Constructor de Bloques.
-- Ejecutar con el rol propietario del esquema (SET ROLE postgres).
-- El COMMIT de producción queda bajo control manual.

create table public.cotizaciones_especiales (
  id uuid primary key default gen_random_uuid(),

  -- Se derivan del tipo de documento por trigger; el cliente no los controla.
  empresa_id text not null
    references public.empresas(id) on delete restrict,
  sociedad_id uuid
    references public.sociedades(id) on delete restrict,

  tipo_documento_id uuid not null
    references public.tipos_documento_electronico(id) on delete restrict,
  plantilla_documento_id uuid not null
    references public.plantillas_documento_bloques(id) on delete restrict,
  -- Se enlaza al emitir, cuando documentos_generados admita cotizacion_especial.
  documento_generado_id uuid unique
    references public.documentos_generados(id) on delete restrict,

  cuenta_id text not null
    references public.cuentas(id) on delete restrict,
  oportunidad_id text
    references public.oportunidades(id) on delete set null,
  hoja_costeo_id text
    references public.hojas_costeo(id) on delete restrict,

  origen_items text not null
    check (origen_items in ('manual', 'hoja_costeo')),
  numero text not null,
  moneda text not null default 'PEN',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  igv_pct numeric(5,2) not null default 18 check (igv_pct >= 0 and igv_pct <= 100),
  igv numeric(14,2) not null default 0 check (igv >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),

  -- Se completa únicamente al emitir; el documento generado guarda el mismo contexto.
  contexto_emitido_json jsonb,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'emitido', 'anulado')),
  emitida_at timestamptz,
  emitida_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cotizaciones_especiales_origen_hoja_check check (
    (origen_items = 'manual' and hoja_costeo_id is null)
    or (origen_items = 'hoja_costeo' and hoja_costeo_id is not null)
  ),
  constraint cotizaciones_especiales_snapshot_emitido_check check (
    estado = 'borrador'
    or (contexto_emitido_json is not null and documento_generado_id is not null)
  ),
  constraint cotizaciones_especiales_empresa_numero_key
    unique (empresa_id, numero),
  constraint cotizaciones_especiales_empresa_sociedad_fkey
    foreign key (empresa_id, sociedad_id)
    references public.sociedades(empresa_id, id)
);

create index cotizaciones_especiales_empresa_sociedad_idx
  on public.cotizaciones_especiales (empresa_id, sociedad_id);

create index cotizaciones_especiales_cuenta_idx
  on public.cotizaciones_especiales (cuenta_id);

create index cotizaciones_especiales_oportunidad_idx
  on public.cotizaciones_especiales (oportunidad_id)
  where oportunidad_id is not null;

create index cotizaciones_especiales_hoja_costeo_idx
  on public.cotizaciones_especiales (hoja_costeo_id)
  where hoja_costeo_id is not null;

create index cotizaciones_especiales_documento_generado_idx
  on public.cotizaciones_especiales (documento_generado_id);

-- La frontera de empresa/sociedad se toma exclusivamente del tipo seleccionado.
-- Las relaciones adicionales se validan contra esa frontera antes de cada escritura.
create or replace function public.derivar_contexto_cotizacion_especial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo public.tipos_documento_electronico%rowtype;
  v_cuenta_empresa_id text;
  v_oportunidad_empresa_id text;
  v_hoja record;
  v_plantilla record;
  v_documento record;
begin
  select * into v_tipo
  from public.tipos_documento_electronico
  where id = new.tipo_documento_id;

  if not found then
    raise exception 'El tipo de documento % no existe.', new.tipo_documento_id;
  end if;

  if v_tipo.categoria_base <> 'cotizacion' or not v_tipo.activo then
    raise exception 'El tipo de documento debe estar activo y ser de categoría cotizacion.';
  end if;

  new.empresa_id := v_tipo.empresa_id;
  new.sociedad_id := v_tipo.sociedad_id;

  select empresa_id into v_cuenta_empresa_id
  from public.cuentas
  where id = new.cuenta_id;

  if not found or v_cuenta_empresa_id is distinct from new.empresa_id then
    raise exception 'La cuenta debe pertenecer a la misma empresa que el tipo de documento.';
  end if;

  if new.oportunidad_id is not null then
    select empresa_id into v_oportunidad_empresa_id
    from public.oportunidades
    where id = new.oportunidad_id;

    if not found or v_oportunidad_empresa_id is distinct from new.empresa_id then
      raise exception 'La oportunidad debe pertenecer a la misma empresa que el tipo de documento.';
    end if;
  end if;

  if new.origen_items = 'hoja_costeo' then
    select empresa_id, sociedad_id, estado into v_hoja
    from public.hojas_costeo
    where id = new.hoja_costeo_id;

    if not found
       or v_hoja.empresa_id is distinct from new.empresa_id
       or v_hoja.sociedad_id is distinct from new.sociedad_id
       or v_hoja.estado is distinct from 'aprobada' then
      raise exception 'La Hoja de Costeo debe estar aprobada y pertenecer a la misma empresa y sociedad.';
    end if;
  end if;

  select empresa_id, sociedad_id, tipo_documento_id, estado into v_plantilla
  from public.plantillas_documento_bloques
  where id = new.plantilla_documento_id;

  if not found
     or v_plantilla.empresa_id is distinct from new.empresa_id
     or v_plantilla.sociedad_id is distinct from new.sociedad_id
     or v_plantilla.tipo_documento_id is distinct from new.tipo_documento_id
     or v_plantilla.estado is distinct from 'publicada' then
    raise exception 'La plantilla debe estar publicada y pertenecer al mismo tipo, empresa y sociedad.';
  end if;

  if new.documento_generado_id is not null then
    select empresa_id, sociedad_id, tipo_documento_id, entidad_tipo, entidad_id, estado into v_documento
    from public.documentos_generados
    where id = new.documento_generado_id;

    if not found
       or v_documento.empresa_id is distinct from new.empresa_id
       or v_documento.sociedad_id is distinct from new.sociedad_id
       or v_documento.tipo_documento_id is distinct from new.tipo_documento_id
       or v_documento.entidad_tipo is distinct from 'cotizacion_especial'
       or v_documento.entidad_id is distinct from new.id::text
       or v_documento.estado is distinct from 'borrador' then
      raise exception 'El documento generado debe ser borrador y pertenecer a esta Cotización Especial, tipo, empresa y sociedad.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.derivar_contexto_cotizacion_especial() from public, anon, authenticated, service_role;

create trigger aa_derivar_contexto_cotizacion_especial
before insert or update on public.cotizaciones_especiales
for each row execute function public.derivar_contexto_cotizacion_especial();

create trigger zz_validar_sociedad_obligatoria
before insert or update on public.cotizaciones_especiales
for each row execute function public.validar_sociedad_obligatoria_multisociedad('sociedad_id');

alter table public.cotizaciones_especiales enable row level security;

-- La creación queda exclusivamente para una RPC SECURITY DEFINER futura, que reserva
-- numero mediante siguiente_numero_cotizacion dentro de la misma transacción.
revoke insert, delete on public.cotizaciones_especiales from authenticated;
grant select, update on public.cotizaciones_especiales to authenticated;

create policy cotizaciones_especiales_select
on public.cotizaciones_especiales
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'cotizaciones', 'ver')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
  and (
    oportunidad_id is null
    or exists (
      select 1
      from public.oportunidades oportunidad
      where oportunidad.id = oportunidad_id
        and (
          oportunidad.responsable_id is null
          or public.usuario_puede_ver_registro(empresa_id, oportunidad.responsable_id)
        )
    )
  )
);

create policy cotizaciones_especiales_update_borrador
on public.cotizaciones_especiales
for update
using (
  estado = 'borrador'
  and public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'cotizaciones', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  estado = 'borrador'
  and public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'cotizaciones', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

select pg_notify('pgrst', 'reload schema');
