-- 672 · Flota: permisos de una pantalla en una sola llamada.
-- Aditiva: función nueva. Evalúa con usuario_puede (misma autoridad que antes) las acciones
-- ver, crear, editar, aprobar y anular, para no hacer 5 llamadas RPC desde la pantalla.

create or replace function public.flota_permisos_pantalla(p_empresa_id text, p_pantalla text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when p_pantalla not in ('flota_panel','contratos_alquiler','pasaporte_equipos','actas_despachos',
                            'certificaciones_activo','garantias_flota','liquidacion_flota')
      then null
    else jsonb_build_object(
      'ver',     public.usuario_puede(p_empresa_id, p_pantalla, 'ver'),
      'crear',   public.usuario_puede(p_empresa_id, p_pantalla, 'crear'),
      'editar',  public.usuario_puede(p_empresa_id, p_pantalla, 'editar'),
      'aprobar', public.usuario_puede(p_empresa_id, p_pantalla, 'aprobar'),
      'anular',  public.usuario_puede(p_empresa_id, p_pantalla, 'anular'))
  end;
$$;

revoke all on function public.flota_permisos_pantalla(text, text) from public, anon;
grant execute on function public.flota_permisos_pantalla(text, text) to authenticated;

do $$
begin
  if to_regprocedure('public.flota_permisos_pantalla(text, text)') is null then
    raise exception 'Falta flota_permisos_pantalla.';
  end if;
  if has_function_privilege('anon', 'public.flota_permisos_pantalla(text, text)', 'execute') then
    raise exception 'anon no debe ejecutar flota_permisos_pantalla.';
  end if;
  if public.flota_permisos_pantalla('emp_x', 'otra_pantalla') is not null then
    raise exception 'flota_permisos_pantalla debe rechazar pantallas fuera de Flota.';
  end if;
  if (select count(*) from jsonb_object_keys(public.flota_permisos_pantalla('emp_x', 'liquidacion_flota'))) <> 5 then
    raise exception 'flota_permisos_pantalla debe devolver 5 acciones.';
  end if;
end;
$$;
