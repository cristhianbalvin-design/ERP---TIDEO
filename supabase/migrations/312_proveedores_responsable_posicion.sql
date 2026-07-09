-- TIDEO ERP - Fase 4 (retomada): responsable de compras del proveedor pasa de texto libre a
-- referencia real a Posicion.
--
-- Origen: proveedores.responsable_compras es texto libre sin FK desde 236
-- (proveedores_ficha_completa), documentado en su momento como pendiente para cuando el modelo de
-- Posiciones estuviera maduro. Ya lo esta (293-311): se resuelve igual que
-- unidades_organizacionales.responsable_posicion_id (293), con el mismo patron de columna nueva +
-- backfill best-effort, sin dropear la columna vieja.
--
-- No se dropea responsable_compras (texto): sirve de rastro para los proveedores que el backfill
-- no logre mapear (quedan con texto pero sin responsable_compras_posicion_id) y evita perder datos
-- de forma irreversible en esta sola pasada. El frontend deja de leerla/escribirla desde este
-- turno; se puede evaluar un DROP en un turno aparte una vez confirmado que el backfill cubrio
-- todos los casos reales.

alter table public.proveedores
  add column if not exists responsable_compras_posicion_id uuid references public.posiciones(id) on delete set null;

comment on column public.proveedores.responsable_compras_posicion_id is
  'Posicion (modelo Unidad -> Posicion -> Persona) responsable de compras de este proveedor. Reemplaza a responsable_compras (texto libre, columna legada que se mantiene solo como rastro de backfill -- ver 312).';

-- ─── Backfill best-effort: responsable_compras (texto) -> responsable_compras_posicion_id ────
--
-- Para cada proveedor con responsable_compras no vacio y sin posicion asignada aun, busca un
-- usuario del MISMO tenant cuyo nombre coincida (case-insensitive, trim) y resuelve a UNA de sus
-- posiciones activas hoy, en este orden:
--   1) la posicion cuya unidad organizacional tenga categoria = 'compras' (encaja con el campo);
--   2) si no hay, la posicion con vinculo principal real (mismo criterio que 309/310);
--   3) si tampoco, el mismo desempate de 309/310: mas historial, empate -> mas antigua, empate ->
--      id menor.
-- Los proveedores sin match (nombre no encontrado, o encontrado pero sin ninguna posicion activa)
-- quedan reportados via RAISE NOTICE y siguen con responsable_compras_posicion_id en null, sin
-- bloquear el resto -- se pueden revisar despues con la consulta de verificacion al final.

do $$
declare
  r_prov record;
  v_user_id uuid;
  v_posicion_id uuid;
  v_mapeados int := 0;
  v_no_mapeados int := 0;
begin
  for r_prov in
    select id, empresa_id, responsable_compras
    from public.proveedores
    where responsable_compras_posicion_id is null
      and coalesce(trim(responsable_compras), '') <> ''
  loop
    v_user_id := null;
    v_posicion_id := null;

    -- usuarios.id es text (deberia ser el mismo uuid de auth.users como string, igual que ya
    -- asume el resto del modelo de posiciones), pero se valida el formato antes de castear para
    -- no abortar todo el backfill si algun registro legado no lo cumple.
    select u.id::uuid into v_user_id
    from public.usuarios u
    where u.empresa_id = r_prov.empresa_id
      and lower(trim(u.nombre)) = lower(trim(r_prov.responsable_compras))
      and u.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    limit 1;

    if v_user_id is not null then
      select p.id into v_posicion_id
      from public.posiciones_usuarios pu
      join public.posiciones p on p.id = pu.posicion_id
      join public.unidades_organizacionales uo on uo.id = p.unidad_organizacional_id
      where p.empresa_id = r_prov.empresa_id
        and pu.user_id = v_user_id
        and pu.fecha_fin is null
      order by
        (uo.categoria = 'compras') desc,
        exists (
          select 1 from public.usuarios_asignaciones ua
          where ua.id = p.origen_asignacion_id and ua.principal = true
        ) desc,
        (select count(*) from public.posiciones_usuarios pu2 where pu2.posicion_id = p.id) desc,
        p.created_at asc, p.id asc
      limit 1;
    end if;

    if v_posicion_id is not null then
      update public.proveedores
      set responsable_compras_posicion_id = v_posicion_id, updated_at = now()
      where id = r_prov.id;
      v_mapeados := v_mapeados + 1;
    else
      v_no_mapeados := v_no_mapeados + 1;
      raise notice 'Proveedor % (tenant %): responsable_compras "%" no se pudo mapear a ninguna posicion (usuario no encontrado o sin posicion activa) -- revisar manualmente.',
        r_prov.id, r_prov.empresa_id, r_prov.responsable_compras;
    end if;
  end loop;

  raise notice 'Backfill 312 completo: % proveedor(es) mapeados, % sin mapear.', v_mapeados, v_no_mapeados;
end;
$$;

-- Verificacion rapida en Supabase Studio: proveedores que quedaron sin mapear (para revision
-- manual, ninguno bloquea el uso normal del formulario -- el campo ya no es obligatorio):
--   select id, empresa_id, razon_social, responsable_compras from proveedores
--   where responsable_compras_posicion_id is null and coalesce(trim(responsable_compras), '') <> '';

select pg_notify('pgrst', 'reload schema');
