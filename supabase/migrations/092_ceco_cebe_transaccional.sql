-- TIDEO ERP - Logica transaccional CECO / CEBE

alter table public.ordenes_trabajo
  add column if not exists centro_costo_id text references public.centros_costo(id),
  add column if not exists centro_beneficio_id text references public.centros_beneficio(id);

alter table public.os_clientes
  add column if not exists centro_beneficio_id text references public.centros_beneficio(id);

alter table public.cotizaciones
  add column if not exists centro_beneficio_id text references public.centros_beneficio(id);

alter table public.solpe_interna
  add column if not exists centro_costo_id text references public.centros_costo(id);

alter table public.compras_gastos
  add column if not exists centro_costo_id text references public.centros_costo(id);

alter table public.ordenes_compra
  add column if not exists centro_costo_id text references public.centros_costo(id);

alter table public.ordenes_servicio_interna
  add column if not exists centro_costo_id text references public.centros_costo(id);

alter table public.personal_operativo
  add column if not exists centro_costo_id text references public.centros_costo(id);

alter table public.personal_administrativo
  add column if not exists centro_costo_id text references public.centros_costo(id);

alter table public.detalle_nomina
  add column if not exists centro_costo_id text references public.centros_costo(id);

create index if not exists idx_ot_ceco on public.ordenes_trabajo(empresa_id, centro_costo_id);
create index if not exists idx_ot_cebe on public.ordenes_trabajo(empresa_id, centro_beneficio_id);
create index if not exists idx_os_clientes_cebe on public.os_clientes(empresa_id, centro_beneficio_id);
create index if not exists idx_cotizaciones_cebe on public.cotizaciones(empresa_id, centro_beneficio_id);
create index if not exists idx_solpe_ceco on public.solpe_interna(empresa_id, centro_costo_id);
create index if not exists idx_compras_gastos_ceco on public.compras_gastos(empresa_id, centro_costo_id);
create index if not exists idx_oc_ceco on public.ordenes_compra(empresa_id, centro_costo_id);
create index if not exists idx_osi_ceco on public.ordenes_servicio_interna(empresa_id, centro_costo_id);
create index if not exists idx_personal_operativo_ceco on public.personal_operativo(empresa_id, centro_costo_id);
create index if not exists idx_personal_admin_ceco on public.personal_administrativo(empresa_id, centro_costo_id);
create index if not exists idx_detalle_nomina_ceco on public.detalle_nomina(empresa_id, centro_costo_id);

create or replace function public.crear_ot_desde_os_cliente(
  p_empresa_id text,
  p_os_cliente_id text,
  p_ot_id text,
  p_numero text,
  p_servicio text,
  p_descripcion text default null,
  p_direccion_ejecucion text default null,
  p_fecha_programada date default null,
  p_tecnico_responsable_id text default null,
  p_estado text default 'programada',
  p_costo_estimado numeric default 0,
  p_centro_costo_id text default null,
  p_centro_beneficio_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os public.os_clientes%rowtype;
  v_ot public.ordenes_trabajo%rowtype;
  v_ots jsonb;
  v_cebe_id text;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not (
    public.usuario_puede(p_empresa_id, 'ot', 'crear')
    or public.usuario_puede(p_empresa_id, 'ots', 'crear')
  ) then
    raise exception 'No tienes permiso para crear Ordenes de Trabajo.';
  end if;

  select * into v_os
  from public.os_clientes
  where id = p_os_cliente_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'OS Cliente no encontrada.';
  end if;

  v_cebe_id := coalesce(p_centro_beneficio_id, v_os.centro_beneficio_id);
  if v_cebe_id is null then
    raise exception 'La OS Cliente vinculada no tiene un CEBE asignado. Complétalo antes de crear la OT.';
  end if;

  insert into public.ordenes_trabajo (
    id, empresa_id, os_cliente_id, numero, cuenta_id, servicio, descripcion,
    direccion_ejecucion, fecha_programada, tecnico_responsable_id, estado,
    avance_pct, costo_estimado, costo_real, moneda, centro_costo_id, centro_beneficio_id
  )
  values (
    p_ot_id, p_empresa_id, p_os_cliente_id, p_numero, v_os.cuenta_id,
    coalesce(nullif(p_servicio, ''), 'Servicio cliente'),
    p_descripcion, p_direccion_ejecucion, p_fecha_programada,
    p_tecnico_responsable_id, coalesce(nullif(p_estado, ''), 'programada'),
    0, coalesce(p_costo_estimado, 0), 0, coalesce(v_os.moneda, 'PEN'),
    p_centro_costo_id, v_cebe_id
  )
  returning * into v_ot;

  select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
  into v_ots
  from (
    select value
    from jsonb_array_elements_text(coalesce(v_os.ots_asociadas, '[]'::jsonb)) value
    union all
    select p_ot_id
  ) items;

  update public.os_clientes
  set ots_asociadas = v_ots,
      saldo_por_ejecutar = greatest(0, coalesce(saldo_por_ejecutar, 0) - coalesce(p_costo_estimado, 0)),
      updated_at = now()
  where id = p_os_cliente_id
  returning * into v_os;

  return jsonb_build_object('orden_trabajo', to_jsonb(v_ot), 'os_cliente', to_jsonb(v_os));
end;
$$;

grant execute on function public.crear_ot_desde_os_cliente(
  text, text, text, text, text, text, text, date, text, text, numeric, text, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');
