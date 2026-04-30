-- TIDEO ERP - RPC robusta para crear Hoja de Costeo
-- Ejecutar en proyectos existentes despues de 022_superadmin_global_permissions.sql.
-- Evita inserts fantasma desde frontend: la HC se crea en backend y retorna la fila persistida.

alter table public.hojas_costeo
  add column if not exists version integer default 1,
  add column if not exists historial_versiones jsonb default '[]'::jsonb;

create or replace function public.crear_hoja_costeo(
  p_empresa_id text,
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

  insert into public.hojas_costeo (
    id, empresa_id, numero, oportunidad_id, cuenta_id, estado,
    responsable_costeo, fecha, margen_objetivo_pct, notas,
    mano_obra, materiales, servicios_terceros, logistica,
    total_mano_obra, total_materiales, total_servicios_terceros, total_logistica,
    costo_total, precio_sugerido_sin_igv, precio_sugerido_total,
    version, historial_versiones
  )
  values (
    p_id, p_empresa_id, p_numero, p_oportunidad_id, p_cuenta_id, 'borrador',
    p_responsable_costeo, coalesce(p_fecha, current_date), coalesce(p_margen_objetivo_pct, 35), p_notas,
    coalesce(p_mano_obra, '[]'::jsonb), coalesce(p_materiales, '[]'::jsonb),
    coalesce(p_servicios_terceros, '[]'::jsonb), coalesce(p_logistica, '[]'::jsonb),
    coalesce(p_total_mano_obra, 0), coalesce(p_total_materiales, 0),
    coalesce(p_total_servicios_terceros, 0), coalesce(p_total_logistica, 0),
    coalesce(p_costo_total, 0), coalesce(p_precio_sugerido_sin_igv, 0),
    coalesce(p_precio_sugerido_total, 0),
    1, '[]'::jsonb
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.crear_hoja_costeo(
  text, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

select pg_notify('pgrst', 'reload schema');
