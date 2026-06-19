-- "Mi portal" (mi_espacio) incluye Solicitudes como funcionalidad base. Desde ahora
-- actualizar-usuario-acceso y el frontend agregan 'solicitudes' automaticamente
-- junto con 'mi_espacio' (ver supabase/functions/actualizar-usuario-acceso/index.ts
-- y src/context.jsx). Este backfill corrige a los usuarios que ya tenian
-- 'mi_espacio' asignado antes de ese cambio y por eso quedaban sin 'solicitudes',
-- causando que el boton "Solicitudes" de la PWA movil rebotara a Control de
-- Asistencia (el perfil 'solicitudes' no estaba en su lista de modulos permitidos).
--
-- Auditable: cada fila modificada queda registrada en public.auditoria con el
-- valor anterior, el valor nuevo y la fecha (created_at).

do $$
declare
  r record;
  v_anterior text[];
  v_nuevo text[];
begin
  for r in
    select id, empresa_id, user_id, campo_modulos
    from public.usuarios_empresas
    where acceso_campo = true
      and 'mi_espacio' = any(campo_modulos)
      and not ('solicitudes' = any(campo_modulos))
  loop
    v_anterior := r.campo_modulos;
    v_nuevo := array_append(r.campo_modulos, 'solicitudes');

    update public.usuarios_empresas
    set campo_modulos = v_nuevo,
        updated_at = now()
    where id = r.id;

    insert into public.auditoria (
      empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_anterior, valor_nuevo
    )
    values (
      r.empresa_id, r.user_id, 'usuarios_empresas', 'campo_modulos', r.user_id::text,
      'backfill_solicitudes_mi_espacio', to_jsonb(v_anterior), to_jsonb(v_nuevo)
    );
  end loop;
end $$;
