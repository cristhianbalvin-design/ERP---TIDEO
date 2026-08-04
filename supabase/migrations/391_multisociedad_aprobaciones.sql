-- TIDEO ERP - Multisociedad, bloque 4A: vistas de aprobacion existentes.
-- Las columnas son nullable para preservar exactamente los registros legacy.

alter table public.hojas_costeo
  add column if not exists sociedad_id uuid default null;
alter table public.presupuestos
  add column if not exists sociedad_id uuid default null;
alter table public.presupuesto_partidas
  add column if not exists sociedad_id uuid default null;
alter table public.presupuesto_aprobaciones
  add column if not exists sociedad_id uuid default null;

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array[
    'hojas_costeo', 'presupuestos', 'presupuesto_partidas', 'presupuesto_aprobaciones'
  ] loop
    v_constraint := v_table || '_empresa_sociedad_fkey';
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', v_table)::regclass
        and conname = v_constraint
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (empresa_id, sociedad_id) references public.sociedades(empresa_id, id)',
        v_table,
        v_constraint
      );
    end if;
  end loop;
end $$;

create index if not exists idx_hojas_costeo_empresa_sociedad
  on public.hojas_costeo(empresa_id, sociedad_id);
create index if not exists idx_presupuestos_empresa_sociedad
  on public.presupuestos(empresa_id, sociedad_id);
create index if not exists idx_presupuesto_partidas_empresa_sociedad
  on public.presupuesto_partidas(empresa_id, sociedad_id);
create index if not exists idx_presupuesto_aprobaciones_empresa_sociedad
  on public.presupuesto_aprobaciones(empresa_id, sociedad_id);

create or replace function public.presupuesto_validar_sociedad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sociedad_ceco uuid;
  v_sociedad_cebe uuid;
begin
  if new.centro_costo_id is not null then
    select sociedad_id into v_sociedad_ceco
    from public.centros_costo
    where id = new.centro_costo_id and empresa_id = new.empresa_id;
  end if;

  if new.cebe_id is not null then
    select sociedad_id into v_sociedad_cebe
    from public.centros_beneficio
    where id = new.cebe_id and empresa_id = new.empresa_id;
  end if;

  if v_sociedad_ceco is not null and v_sociedad_cebe is not null
     and v_sociedad_ceco is distinct from v_sociedad_cebe then
    raise exception 'El CECO y el CEBE del presupuesto pertenecen a sociedades distintas.';
  end if;

  new.sociedad_id := coalesce(new.sociedad_id, v_sociedad_ceco, v_sociedad_cebe);

  if v_sociedad_ceco is not null and new.sociedad_id is distinct from v_sociedad_ceco then
    raise exception 'La sociedad del presupuesto no coincide con la sociedad del CECO.';
  end if;
  if v_sociedad_cebe is not null and new.sociedad_id is distinct from v_sociedad_cebe then
    raise exception 'La sociedad del presupuesto no coincide con la sociedad del CEBE.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_presupuesto_validar_sociedad on public.presupuestos;
create trigger trg_presupuesto_validar_sociedad
before insert or update of empresa_id, sociedad_id, centro_costo_id, cebe_id
on public.presupuestos
for each row execute function public.presupuesto_validar_sociedad();

create or replace function public.presupuesto_hijo_heredar_sociedad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_empresa_id text;
  v_sociedad_id uuid;
begin
  select empresa_id, sociedad_id into v_empresa_id, v_sociedad_id
  from public.presupuestos
  where id = new.presupuesto_id;

  if not found then
    raise exception 'El presupuesto % no existe.', new.presupuesto_id;
  end if;
  if new.empresa_id is distinct from v_empresa_id then
    raise exception 'La empresa del detalle no coincide con su presupuesto.';
  end if;
  if new.sociedad_id is not null and new.sociedad_id is distinct from v_sociedad_id then
    raise exception 'La sociedad del detalle no coincide con su presupuesto.';
  end if;

  new.sociedad_id := v_sociedad_id;
  return new;
end;
$$;

drop trigger if exists trg_presupuesto_partidas_heredar_sociedad on public.presupuesto_partidas;
create trigger trg_presupuesto_partidas_heredar_sociedad
before insert or update of empresa_id, presupuesto_id, sociedad_id
on public.presupuesto_partidas
for each row execute function public.presupuesto_hijo_heredar_sociedad();

drop trigger if exists trg_presupuesto_aprobaciones_heredar_sociedad on public.presupuesto_aprobaciones;
create trigger trg_presupuesto_aprobaciones_heredar_sociedad
before insert or update of empresa_id, presupuesto_id, sociedad_id
on public.presupuesto_aprobaciones
for each row execute function public.presupuesto_hijo_heredar_sociedad();

create or replace function public.crear_hoja_costeo_sociedad(
  p_empresa_id text,
  p_sociedad_id uuid,
  p_id text,
  p_numero text,
  p_oportunidad_id text default null,
  p_cuenta_id text default null,
  p_responsable_costeo text default null,
  p_fecha date default current_date,
  p_margen_objetivo_pct numeric default 35,
  p_notas text default null,
  p_mano_obra jsonb default '[]'::jsonb,
  p_materiales jsonb default '[]'::jsonb,
  p_servicios_terceros jsonb default '[]'::jsonb,
  p_logistica jsonb default '[]'::jsonb,
  p_total_mano_obra numeric default 0,
  p_total_materiales numeric default 0,
  p_total_servicios_terceros numeric default 0,
  p_total_logistica numeric default 0,
  p_costo_total numeric default 0,
  p_precio_sugerido_sin_igv numeric default 0,
  p_precio_sugerido_total numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hojas_costeo%rowtype;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'hoja_costeo', 'crear') then
    raise exception 'No tienes permiso para crear hojas de costeo en este tenant.';
  end if;
  if not exists (
    select 1 from public.empresas
    where id = p_empresa_id and multisociedad_habilitado = true
  ) then
    raise exception 'El tenant no tiene multisociedad habilitada.';
  end if;
  if p_sociedad_id is null or not exists (
    select 1 from public.sociedades
    where id = p_sociedad_id and empresa_id = p_empresa_id and activa = true
  ) then
    raise exception 'Selecciona una sociedad activa del tenant.';
  end if;

  insert into public.hojas_costeo (
    id, empresa_id, sociedad_id, numero, oportunidad_id, cuenta_id, estado,
    responsable_costeo, fecha, margen_objetivo_pct, notas,
    mano_obra, materiales, servicios_terceros, logistica,
    total_mano_obra, total_materiales, total_servicios_terceros, total_logistica,
    costo_total, precio_sugerido_sin_igv, precio_sugerido_total,
    version, historial_versiones
  ) values (
    p_id, p_empresa_id, p_sociedad_id, p_numero, p_oportunidad_id, p_cuenta_id, 'borrador',
    p_responsable_costeo, coalesce(p_fecha, current_date), coalesce(p_margen_objetivo_pct, 35), p_notas,
    coalesce(p_mano_obra, '[]'::jsonb), coalesce(p_materiales, '[]'::jsonb),
    coalesce(p_servicios_terceros, '[]'::jsonb), coalesce(p_logistica, '[]'::jsonb),
    coalesce(p_total_mano_obra, 0), coalesce(p_total_materiales, 0),
    coalesce(p_total_servicios_terceros, 0), coalesce(p_total_logistica, 0),
    coalesce(p_costo_total, 0), coalesce(p_precio_sugerido_sin_igv, 0),
    coalesce(p_precio_sugerido_total, 0), 1, '[]'::jsonb
  ) returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.crear_hoja_costeo_sociedad(
  text, uuid, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

create or replace function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(
  p_empresa_id text,
  p_sociedad_id uuid,
  p_hoja_costeo_id text,
  p_cotizacion_id text,
  p_numero text,
  p_moneda text default 'PEN',
  p_validez text default '30 dias'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
  v_items jsonb;
  v_divisor numeric;
  v_owner_user_id uuid;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  select * into v_hc
  from public.hojas_costeo
  where id = p_hoja_costeo_id
    and empresa_id = p_empresa_id
    and sociedad_id = p_sociedad_id
  for update;

  if not found then
    raise exception 'Hoja de Costeo no encontrada para la sociedad seleccionada.';
  end if;
  if v_hc.estado = 'aprobada' and v_hc.cotizacion_id is not null then
    select * into v_cot from public.cotizaciones where id = v_hc.cotizacion_id;
    return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
  end if;
  if coalesce(v_hc.estado, 'borrador') <> 'en_revision' then
    raise exception 'Solo se pueden aprobar Hojas de Costeo enviadas a revision.';
  end if;

  select coalesce(
    o.responsable_id,
    (
      select pa.auth_user_id
      from public.personal_administrativo pa
      where pa.empresa_id = o.empresa_id
        and pa.auth_user_id is not null
        and nullif(trim(o.responsable), '') is not null
        and lower(trim(pa.nombre)) = lower(trim(o.responsable))
      limit 1
    )
  ) into v_owner_user_id
  from public.oportunidades o
  where o.id = v_hc.oportunidad_id and o.empresa_id = p_empresa_id;

  if not public.usuario_puede_aprobar_hoja_costeo(p_empresa_id, v_owner_user_id) then
    raise exception 'Solo la jefatura comercial o un nivel superior puede aprobar esta Hoja de Costeo.';
  end if;

  v_divisor := greatest(0.05, 1 - least(greatest(coalesce(v_hc.margen_objetivo_pct, 35), 0), 95) / 100);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(item->>'id', origen || '_' || md5(item::text)),
    'descripcion', coalesce(nullif(item->>'descripcion', ''), 'Partida de costeo'),
    'tipo', case when origen = 'materiales' then 'material' else 'servicio' end,
    'cantidad', coalesce(nullif(item->>'cantidad', '')::numeric, 0),
    'unidad', coalesce(nullif(item->>'unidad', ''), 'und'),
    'precio_unitario', round(coalesce(nullif(item->>'costo_unitario', '')::numeric, nullif(item->>'precio_unitario', '')::numeric, 0) / v_divisor),
    'subtotal', coalesce(nullif(item->>'cantidad', '')::numeric, 0)
      * round(coalesce(nullif(item->>'costo_unitario', '')::numeric, nullif(item->>'precio_unitario', '')::numeric, 0) / v_divisor)
  )), '[]'::jsonb) into v_items
  from (
    select 'mano_obra' as origen, item from jsonb_array_elements(coalesce(v_hc.mano_obra, '[]'::jsonb)) item
    union all select 'materiales', item from jsonb_array_elements(coalesce(v_hc.materiales, '[]'::jsonb)) item
    union all select 'servicios_terceros', item from jsonb_array_elements(coalesce(v_hc.servicios_terceros, '[]'::jsonb)) item
    union all select 'logistica', item from jsonb_array_elements(coalesce(v_hc.logistica, '[]'::jsonb)) item
  ) src;

  insert into public.cotizaciones (
    id, empresa_id, sociedad_id, oportunidad_id, cuenta_id, responsable_id,
    numero, version, estado, fecha, items, subtotal, descuento_global_pct,
    descuento_global, base_imponible, igv_pct, igv, total, moneda,
    condicion_pago, hoja_costeo_id
  ) values (
    p_cotizacion_id, p_empresa_id, p_sociedad_id, v_hc.oportunidad_id,
    v_hc.cuenta_id, v_owner_user_id, p_numero, 1, 'borrador', current_date,
    v_items, coalesce(v_hc.precio_sugerido_sin_igv, 0), 0, 0,
    coalesce(v_hc.precio_sugerido_sin_igv, 0), 18,
    round(coalesce(v_hc.precio_sugerido_sin_igv, 0) * 0.18),
    coalesce(v_hc.precio_sugerido_total, 0), coalesce(p_moneda, 'PEN'),
    p_validez, p_hoja_costeo_id
  ) returning * into v_cot;

  update public.hojas_costeo
  set estado = 'aprobada', cotizacion_id = p_cotizacion_id, updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;

  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(
  text, uuid, text, text, text, text, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');
