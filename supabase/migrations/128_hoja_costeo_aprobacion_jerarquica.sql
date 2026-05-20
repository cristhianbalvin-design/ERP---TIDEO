-- 128 - Aprobacion jerarquica de Hojas de Costeo
-- El vendedor puede crear/enviar su Hoja de Costeo, pero la aprobacion
-- queda reservada a su jefe comercial o niveles superiores.

alter table public.hojas_costeo enable row level security;

alter table public.cotizaciones
  add column if not exists responsable_id uuid references auth.users(id) on delete set null;

create or replace function public.usuario_puede_aprobar_hoja_costeo(
  target_empresa_id text,
  target_owner_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive equipo(user_id) as (
    select ua.user_id
    from public.usuarios_asignaciones ua
    where ua.empresa_id = target_empresa_id
      and ua.jefe_user_id = auth.uid()
      and ua.activo = true
    union
    select ua.user_id
    from public.usuarios_asignaciones ua
    join equipo e on ua.jefe_user_id = e.user_id
    where ua.empresa_id = target_empresa_id
      and ua.activo = true
  )
  select public.usuario_es_superadmin_plataforma()
    or exists (
      select 1
      from public.usuarios_empresas ue
      join public.roles r on r.id = ue.rol_id
      where ue.user_id = auth.uid()
        and ue.empresa_id = target_empresa_id
        and ue.estado = 'activo'
        and (r.es_superadmin = true or r.es_admin_empresa = true)
    )
    or exists (
      select 1
      from public.usuarios_asignaciones ua
      join public.roles r on r.id = ua.rol_id
      where ua.user_id = auth.uid()
        and ua.empresa_id = target_empresa_id
        and ua.activo = true
        and public.usuario_puede(target_empresa_id, 'hoja_costeo', 'aprobar')
        and (
          r.es_superadmin = true
          or r.es_admin_empresa = true
          or ua.nivel_jerarquico = 'direccion'
          or (
            target_owner_user_id is not null
            and target_owner_user_id <> auth.uid()
            and ua.nivel_jerarquico in ('jefatura', 'supervisor')
            and target_owner_user_id in (select user_id from equipo)
          )
        )
    );
$$;

drop policy if exists crm_hojas_costeo_select on public.hojas_costeo;
create policy crm_hojas_costeo_select on public.hojas_costeo
  for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'hoja_costeo', 'ver')
    and (
      oportunidad_id is null
      or exists (
        select 1
        from public.oportunidades o
        where o.id = hojas_costeo.oportunidad_id
          and o.empresa_id = hojas_costeo.empresa_id
          and (
            o.responsable_id is null
            or public.usuario_puede_ver_registro(o.empresa_id, o.responsable_id)
          )
      )
    )
  );

drop policy if exists crm_hojas_costeo_insert on public.hojas_costeo;
create policy crm_hojas_costeo_insert on public.hojas_costeo
  for insert
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'hoja_costeo', 'crear')
    and (
      oportunidad_id is null
      or exists (
        select 1
        from public.oportunidades o
        where o.id = hojas_costeo.oportunidad_id
          and o.empresa_id = hojas_costeo.empresa_id
          and (
            o.responsable_id is null
            or public.usuario_puede_ver_registro(o.empresa_id, o.responsable_id)
          )
      )
    )
  );

drop policy if exists crm_hojas_costeo_update on public.hojas_costeo;
create policy crm_hojas_costeo_update on public.hojas_costeo
  for update
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'hoja_costeo', 'editar')
    and coalesce(estado, 'borrador') <> 'aprobada'
    and (
      oportunidad_id is null
      or exists (
        select 1
        from public.oportunidades o
        where o.id = hojas_costeo.oportunidad_id
          and o.empresa_id = hojas_costeo.empresa_id
          and (
            o.responsable_id is null
            or public.usuario_puede_ver_registro(o.empresa_id, o.responsable_id)
          )
      )
    )
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'hoja_costeo', 'editar')
    and coalesce(estado, 'borrador') <> 'aprobada'
    and (
      oportunidad_id is null
      or exists (
        select 1
        from public.oportunidades o
        where o.id = hojas_costeo.oportunidad_id
          and o.empresa_id = hojas_costeo.empresa_id
          and (
            o.responsable_id is null
            or public.usuario_puede_ver_registro(o.empresa_id, o.responsable_id)
          )
      )
    )
  );

create or replace function public.aprobar_hoja_costeo_y_crear_cotizacion(
  p_empresa_id text,
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
  for update;

  if not found then
    raise exception 'Hoja de Costeo no encontrada.';
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
  )
  into v_owner_user_id
  from public.oportunidades o
  where o.id = v_hc.oportunidad_id
    and o.empresa_id = p_empresa_id;

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
  )), '[]'::jsonb)
  into v_items
  from (
    select 'mano_obra' as origen, item from jsonb_array_elements(coalesce(v_hc.mano_obra, '[]'::jsonb)) item
    union all
    select 'materiales' as origen, item from jsonb_array_elements(coalesce(v_hc.materiales, '[]'::jsonb)) item
    union all
    select 'servicios_terceros' as origen, item from jsonb_array_elements(coalesce(v_hc.servicios_terceros, '[]'::jsonb)) item
    union all
    select 'logistica' as origen, item from jsonb_array_elements(coalesce(v_hc.logistica, '[]'::jsonb)) item
  ) src;

  insert into public.cotizaciones (
    id, empresa_id, oportunidad_id, cuenta_id, responsable_id, numero, version, estado, fecha,
    items, subtotal, descuento_global_pct, descuento_global, base_imponible,
    igv_pct, igv, total, moneda, condicion_pago, hoja_costeo_id
  )
  values (
    p_cotizacion_id, p_empresa_id, v_hc.oportunidad_id, v_hc.cuenta_id, v_owner_user_id,
    p_numero, 1, 'borrador', current_date,
    v_items, coalesce(v_hc.precio_sugerido_sin_igv, 0), 0, 0,
    coalesce(v_hc.precio_sugerido_sin_igv, 0), 18,
    round(coalesce(v_hc.precio_sugerido_sin_igv, 0) * 0.18),
    coalesce(v_hc.precio_sugerido_total, 0),
    coalesce(p_moneda, 'PEN'), p_validez, p_hoja_costeo_id
  )
  returning * into v_cot;

  update public.hojas_costeo
  set estado = 'aprobada',
      cotizacion_id = p_cotizacion_id,
      updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;

  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(
  text, text, text, text, text, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');
