-- Elimina una OS Cliente solo cuando no tiene ejecución ni documentos financieros.
-- Si procede, desvincula las cotizaciones y devuelve la cotización de origen a borrador.

create or replace function public.eliminar_os_cliente_reabrir_cotizacion(
  p_empresa_id text,
  p_os_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os public.os_clientes%rowtype;
  v_cotizacion_origen_id text;
  v_ots integer := 0;
  v_backlog integer := 0;
  v_tareos integer := 0;
  v_valorizaciones integer := 0;
  v_facturas integer := 0;
  v_cxc integer := 0;
  v_comisiones integer := 0;
  v_dependencias jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a esta empresa.';
  end if;

  if not public.usuario_puede(p_empresa_id, 'os_cliente', 'editar') then
    raise exception 'No tienes permiso para eliminar Órdenes de Servicio.';
  end if;

  select *
    into v_os
  from public.os_clientes
  where id = p_os_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'La OS Cliente no existe o ya fue eliminada.';
  end if;

  -- El bloqueo FOR UPDATE de la OS evita que se creen relaciones nuevas mientras
  -- se validan y eliminan estas referencias.
  select count(*) into v_ots
  from public.ordenes_trabajo
  where empresa_id = p_empresa_id and os_cliente_id = p_os_id;

  select count(*) into v_backlog
  from public.backlog
  where empresa_id = p_empresa_id and os_cliente_id = p_os_id;

  select count(*) into v_tareos
  from public.tareos_admin
  where empresa_id = p_empresa_id and os_id = p_os_id;

  select count(*) into v_valorizaciones
  from public.valorizaciones
  where empresa_id = p_empresa_id and os_cliente_id = p_os_id;

  select count(*) into v_facturas
  from public.facturas f
  where f.empresa_id = p_empresa_id
    and (
      f.os_cliente_id = p_os_id
      or exists (
        select 1 from public.valorizaciones v
        where v.id = f.valorizacion_id
          and v.empresa_id = p_empresa_id
          and v.os_cliente_id = p_os_id
      )
    );

  select count(*) into v_cxc
  from public.cxc c
  where c.empresa_id = p_empresa_id
    and (
      c.os_cliente_id = p_os_id
      or exists (
        select 1 from public.facturas f
        where f.id = c.factura_id
          and f.empresa_id = p_empresa_id
          and (
            f.os_cliente_id = p_os_id
            or exists (
              select 1 from public.valorizaciones v
              where v.id = f.valorizacion_id
                and v.empresa_id = p_empresa_id
                and v.os_cliente_id = p_os_id
            )
          )
      )
    );

  select count(*) into v_comisiones
  from public.comisiones
  where empresa_id = p_empresa_id and os_cliente_id = p_os_id;

  v_dependencias := jsonb_build_object(
    'ordenes_trabajo', v_ots,
    'backlog', v_backlog,
    'tareos_administrativos', v_tareos,
    'valorizaciones', v_valorizaciones,
    'facturas', v_facturas,
    'cuentas_por_cobrar', v_cxc,
    'comisiones', v_comisiones
  );

  if v_ots + v_backlog + v_tareos + v_valorizaciones + v_facturas + v_cxc + v_comisiones > 0 then
    return jsonb_build_object(
      'eliminada', false,
      'motivo', 'No se puede eliminar la OS porque ya tiene registros relacionados.',
      'dependencias', v_dependencias
    );
  end if;

  v_cotizacion_origen_id := v_os.cotizacion_id;

  -- Una OS puede tener varias cotizaciones vinculadas. Todas se desvinculan,
  -- pero solo la cotización origen vuelve a borrador para ser editada.
  update public.cotizaciones
  set os_cliente_id = null,
      updated_at = now()
  where empresa_id = p_empresa_id
    and os_cliente_id = p_os_id;

  delete from public.os_clientes
  where id = p_os_id
    and empresa_id = p_empresa_id;

  if v_cotizacion_origen_id is not null then
    if not public.usuario_puede(p_empresa_id, 'cotizaciones', 'editar') then
      raise exception 'No tienes permiso para reabrir la cotización de origen.';
    end if;

    update public.cotizaciones
    set estado = 'borrador',
        os_cliente_id = null,
        token_activo = false,
        updated_at = now()
    where id = v_cotizacion_origen_id
      and empresa_id = p_empresa_id;
  end if;

  return jsonb_build_object(
    'eliminada', true,
    'os_id', p_os_id,
    'cotizacion_origen_id', v_cotizacion_origen_id,
    'dependencias', v_dependencias
  );
end;
$$;

grant execute on function public.eliminar_os_cliente_reabrir_cotizacion(text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
