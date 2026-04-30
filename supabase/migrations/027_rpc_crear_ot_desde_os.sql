-- TIDEO ERP - Creacion atomica de OT desde OS Cliente
-- Ejecutar en proyectos existentes despues de 026_fix_hc_cotizacion_items.sql.
-- Evita que la OT quede solo en memoria cuando RLS rechaza inserts directos.

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, x.pantalla, true, true, true, false, true, true, true, true
from public.roles r
cross join (values ('ot'), ('ots')) as x(pantalla)
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true,
  puede_crear = true,
  puede_editar = true,
  puede_aprobar = true,
  puede_exportar = true,
  puede_ver_costos = true,
  puede_ver_finanzas = true;

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
  p_costo_estimado numeric default 0
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

  insert into public.ordenes_trabajo (
    id, empresa_id, os_cliente_id, numero, cuenta_id, servicio, descripcion,
    direccion_ejecucion, fecha_programada, tecnico_responsable_id, estado,
    avance_pct, costo_estimado, costo_real, moneda
  )
  values (
    p_ot_id, p_empresa_id, p_os_cliente_id, p_numero, v_os.cuenta_id,
    coalesce(nullif(p_servicio, ''), 'Servicio cliente'),
    p_descripcion, p_direccion_ejecucion, p_fecha_programada,
    p_tecnico_responsable_id, coalesce(nullif(p_estado, ''), 'programada'),
    0, coalesce(p_costo_estimado, 0), 0, coalesce(v_os.moneda, 'PEN')
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
  text, text, text, text, text, text, text, date, text, text, numeric
) to authenticated;

select pg_notify('pgrst', 'reload schema');
