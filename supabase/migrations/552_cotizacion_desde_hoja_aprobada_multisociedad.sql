-- 552 · Permite generar la cotización desde una Hoja de Costeo ya aprobada.
--
-- La implementación interna de 391/518 fue diseñada originalmente como una
-- operación atómica de aprobar + crear cotización. El flujo actual separa
-- ambos pasos: la HC llega aquí en 'aprobada'. Se conserva exactamente el
-- chequeo de usuario_puede_aprobar_hoja_costeo; solo se amplía la precondición
-- de estado y se evita reescribir 'aprobada' en el segundo caso.

do $$
declare
  v_definicion text;
  v_guard_anterior text := $guard$if coalesce(v_hc.estado, 'borrador') <> 'en_revision' then
    raise exception 'Solo se pueden aprobar Hojas de Costeo enviadas a revision.';
  end if;$guard$;
  v_guard_nuevo text := $guard$if coalesce(v_hc.estado, 'borrador') not in ('en_revision', 'aprobada') then
    raise exception 'Solo se pueden aprobar Hojas de Costeo enviadas a revision o ya aprobadas.';
  end if;$guard$;
  v_update_anterior text := $update$update public.hojas_costeo
  set estado = 'aprobada', cotizacion_id = p_cotizacion_id, updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;$update$;
  v_update_nuevo text := $update$if v_hc.estado = 'en_revision' then
    update public.hojas_costeo
    set estado = 'aprobada', cotizacion_id = p_cotizacion_id, updated_at = now()
    where id = p_hoja_costeo_id
    returning * into v_hc;
  end if;$update$;
  v_coincidencias integer;
begin
  select pg_get_functiondef(
    'public._aprobar_hoja_costeo_y_crear_cotizacion_sociedad_impl_544(text,uuid,text,text,text,text,text)'::regprocedure
  ) into v_definicion;

  v_coincidencias := (length(v_definicion) - length(replace(v_definicion, v_guard_anterior, ''))) / length(v_guard_anterior);
  if v_coincidencias <> 1 then
    raise exception 'No se encontró exactamente un guard de estado en la RPC multisociedad (encontrados: %).', v_coincidencias;
  end if;
  v_definicion := replace(v_definicion, v_guard_anterior, v_guard_nuevo);

  v_coincidencias := (length(v_definicion) - length(replace(v_definicion, v_update_anterior, ''))) / length(v_update_anterior);
  if v_coincidencias <> 1 then
    raise exception 'No se encontró exactamente un UPDATE de estado en la RPC multisociedad (encontrados: %).', v_coincidencias;
  end if;
  v_definicion := replace(v_definicion, v_update_anterior, v_update_nuevo);

  execute v_definicion;
end;
$$;
