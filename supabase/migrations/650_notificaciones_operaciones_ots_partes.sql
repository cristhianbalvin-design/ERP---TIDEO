-- 650: Fase 2b del motor de notificaciones — eventos de Operaciones (nacen desactivados en todas las empresas).
-- * ot_creadas_resumen: cada mañana, resumen de las OTs creadas el día anterior (hora de Lima), sin anuladas.
-- * partes_no_llenados: cada mañana, OTs en curso del día anterior sin ningún parte diario. En curso = estado 'ejecucion',
--   o 'programada' con fecha_programada <= día revisado; y sin fecha_fin anterior a ese día. Se revisa de lunes a sábado
--   (el domingo no se exige parte). Un parte de cualquier técnico basta.
-- * Rol nuevo "operaciones": administradores de la empresa y roles con acceso de lectura a OTs o Partes Diarios.
--   En partes_no_llenados, el jefe directo del técnico responsable recibe solo las OTs de su equipo.
-- * Canales: campana, correo y WhatsApp (resumen diario por destinatario), más correos y teléfonos adicionales.
-- notif_ejecutar_empresa se reconstruye a partir de su versión vigente (648) agregando los dos eventos.

begin;

create or replace function public.notif_usuarios_operaciones(p_empresa_id text)
returns table(user_id uuid)
language sql stable security definer set search_path to 'public'
as $$
  select distinct ue.user_id
  from public.usuarios_empresas ue
  join public.roles ro on ro.id = ue.rol_id
  where ue.empresa_id = p_empresa_id
    and coalesce(ue.estado, 'activo') = 'activo'
    and ue.user_id is not null
    and (coalesce(ro.es_admin_empresa, false)
         or exists (select 1 from public.permisos_roles pr
                    where pr.rol_id = ue.rol_id and coalesce(pr.puede_ver, false)
                      and pr.pantalla in ('ot', 'ots', 'Ordenes de Trabajo', 'partes', 'Partes Diarios')))
$$;

-- OTs creadas ---------------------------------------------------------------------------------------------------------
create or replace function public.notif_generar_ots_creadas(p_empresa_id text, p_fecha date default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_regla record; v_fecha date := coalesce(p_fecha, public.notif_hoy_lima() - 1);
  v_total integer := 0; v_items jsonb; v_n int; v_clave text; v_titulo text; v_mensaje text; v_payload jsonb;
  v_canal text; v_u uuid;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'ot_creadas_resumen' and activo;
  if not found then return 0; end if;

  select count(*)::int,
         jsonb_agg(jsonb_build_object(
           'numero', o.numero,
           'servicio', coalesce(nullif(o.servicio, ''), left(o.descripcion, 80)),
           'cliente', coalesce(nullif(c.nombre_comercial, ''), c.razon_social),
           'fecha_programada', o.fecha_programada,
           'tecnico', po.nombre,
           'ot_id', o.id) order by o.numero)
    into v_n, v_items
  from public.ordenes_trabajo o
  left join public.cuentas c on c.id = o.cuenta_id
  left join public.personal_operativo po on po.id = o.tecnico_responsable_id and po.empresa_id = o.empresa_id
  where o.empresa_id = p_empresa_id
    and (o.created_at at time zone 'America/Lima')::date = v_fecha
    and coalesce(o.estado, '') <> 'anulada';
  if coalesce(v_n, 0) = 0 then return 0; end if;

  v_clave := 'ots_creadas:' || v_fecha::text;
  v_titulo := 'OTs creadas el ' || to_char(v_fecha, 'DD/MM/YYYY');
  v_mensaje := v_n::text || case when v_n = 1 then ' OT creada: ' else ' OTs creadas: ' end
               || (select string_agg((i ->> 'numero') || coalesce(' (' || nullif(i ->> 'servicio', '') || ')', ''), ', ')
                   from (select t.i from jsonb_array_elements(v_items) as t(i) limit 5) s)
               || case when v_n > 5 then ' y ' || (v_n - 5)::text || ' más.' else '.' end;
  v_payload := jsonb_build_object('resumen', true, 'fecha', v_fecha, 'total', v_n, 'items', v_items);

  foreach v_canal in array array['campana', 'correo', 'whatsapp'] loop
    if public.notif_destino_activo(v_regla.destinatarios, 'operaciones', v_canal) then
      for v_u in select user_id from public.notif_usuarios_operaciones(p_empresa_id) loop
        if public.notif_emitir(p_empresa_id, 'ot_creadas_resumen', v_canal, 'operaciones', v_u, v_clave, v_titulo, v_mensaje,
                               v_payload, 'ots_resumen', v_fecha::text, 'media') then
          v_total := v_total + 1;
        end if;
      end loop;
    end if;
  end loop;
  v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'ot_creadas_resumen', v_regla.destinatarios,
               v_clave, v_titulo, v_mensaje, v_payload, 'ots_resumen', v_fecha::text);
  v_total := v_total + public.notif_emitir_telefonos_adicionales(p_empresa_id, 'ot_creadas_resumen', v_regla.destinatarios,
               v_clave, v_titulo, v_mensaje, v_payload, 'ots_resumen', v_fecha::text);
  return v_total;
end;
$$;

-- Partes diarios no llenados -------------------------------------------------------------------------------------------
create or replace function public.notif_generar_partes_no_llenados(p_empresa_id text, p_fecha date default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_regla record; v_fecha date := coalesce(p_fecha, public.notif_hoy_lima() - 1);
  v_total integer := 0; v_items jsonb; v_n int; v_clave text; v_titulo text; v_mensaje text; v_payload jsonb;
  v_canal text; v_u uuid; j record;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'partes_no_llenados' and activo;
  if not found then return 0; end if;
  if extract(isodow from v_fecha) = 7 then return 0; end if;

  create temporary table if not exists _notif_partes_pendientes (
    ot_id text, numero text, servicio text, cliente text, tecnico text, estado text, jefe uuid
  ) on commit drop;
  truncate _notif_partes_pendientes;
  insert into _notif_partes_pendientes
  select o.id, o.numero, coalesce(nullif(o.servicio, ''), left(o.descripcion, 80)),
         coalesce(nullif(c.nombre_comercial, ''), c.razon_social), po.nombre, o.estado,
         case when o.tecnico_responsable_id is not null
              then public.notif_jefe_directo(p_empresa_id, 'operativo', o.tecnico_responsable_id) end
  from public.ordenes_trabajo o
  left join public.cuentas c on c.id = o.cuenta_id
  left join public.personal_operativo po on po.id = o.tecnico_responsable_id and po.empresa_id = o.empresa_id
  where o.empresa_id = p_empresa_id
    and (o.estado = 'ejecucion' or (o.estado = 'programada' and o.fecha_programada <= v_fecha))
    and (o.fecha_fin is null or o.fecha_fin >= v_fecha)
    and (o.created_at at time zone 'America/Lima')::date <= v_fecha
    and not exists (select 1 from public.partes_diarios pd
                    where pd.empresa_id = o.empresa_id and pd.orden_trabajo_id = o.id and pd.fecha = v_fecha);

  select count(*)::int,
         jsonb_agg(jsonb_build_object('numero', numero, 'servicio', servicio, 'cliente', cliente, 'tecnico', tecnico,
                                      'estado', estado, 'ot_id', ot_id) order by numero)
    into v_n, v_items from _notif_partes_pendientes;
  if coalesce(v_n, 0) = 0 then return 0; end if;

  v_clave := 'partes_pendientes:' || v_fecha::text;
  v_titulo := 'Partes diarios pendientes del ' || to_char(v_fecha, 'DD/MM/YYYY');
  v_mensaje := v_n::text || case when v_n = 1 then ' OT sin parte diario: ' else ' OTs sin parte diario: ' end
               || (select string_agg(numero || coalesce(' (' || nullif(tecnico, '') || ')', ''), ', ' order by numero)
                   from (select * from _notif_partes_pendientes order by numero limit 5) t)
               || case when v_n > 5 then ' y ' || (v_n - 5)::text || ' más.' else '.' end;
  v_payload := jsonb_build_object('resumen', true, 'fecha', v_fecha, 'total', v_n, 'alcance', 'empresa', 'items', v_items);

  foreach v_canal in array array['campana', 'correo', 'whatsapp'] loop
    if public.notif_destino_activo(v_regla.destinatarios, 'operaciones', v_canal) then
      for v_u in select user_id from public.notif_usuarios_operaciones(p_empresa_id) loop
        if public.notif_emitir(p_empresa_id, 'partes_no_llenados', v_canal, 'operaciones', v_u, v_clave, v_titulo, v_mensaje,
                               v_payload, 'partes_pendientes', v_fecha::text, 'media') then
          v_total := v_total + 1;
        end if;
      end loop;
    end if;
  end loop;
  v_total := v_total + public.notif_emitir_correos_adicionales(p_empresa_id, 'partes_no_llenados', v_regla.destinatarios,
               v_clave, v_titulo, v_mensaje, v_payload, 'partes_pendientes', v_fecha::text);
  v_total := v_total + public.notif_emitir_telefonos_adicionales(p_empresa_id, 'partes_no_llenados', v_regla.destinatarios,
               v_clave, v_titulo, v_mensaje, v_payload, 'partes_pendientes', v_fecha::text);

  -- Jefe directo del técnico: solo las OTs de su equipo.
  for j in
    select jefe, count(*)::int as n,
           jsonb_agg(jsonb_build_object('numero', numero, 'servicio', servicio, 'cliente', cliente, 'tecnico', tecnico,
                                        'estado', estado, 'ot_id', ot_id) order by numero) as items,
           string_agg(numero || coalesce(' (' || nullif(tecnico, '') || ')', ''), ', ' order by numero) as lista
    from _notif_partes_pendientes where jefe is not null group by jefe
  loop
    foreach v_canal in array array['campana', 'correo', 'whatsapp'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        if public.notif_emitir(p_empresa_id, 'partes_no_llenados', v_canal, 'jefe', j.jefe, v_clave, v_titulo,
             'Tu equipo: ' || j.n::text || case when j.n = 1 then ' OT sin parte diario: ' else ' OTs sin parte diario: ' end
               || j.lista || '.',
             jsonb_build_object('resumen', true, 'fecha', v_fecha, 'total', j.n, 'alcance', 'equipo', 'items', j.items),
             'partes_pendientes', v_fecha::text, 'media') then
          v_total := v_total + 1;
        end if;
      end if;
    end loop;
  end loop;
  return v_total;
end;
$$;

create or replace function public.notif_ejecutar_empresa(p_empresa_id text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_n integer; v_res jsonb := '{}'::jsonb; v_ev text;
begin
  foreach v_ev in array array['contrato_por_vencer', 'contrato_vencido', 'documento_por_vencer', 'tardanza_resumen_diario',
                              'ot_creadas_resumen', 'partes_no_llenados'] loop
    begin
      v_n := case v_ev
        when 'contrato_por_vencer' then public.notif_generar_contratos_por_vencer(p_empresa_id)
        when 'contrato_vencido' then public.notif_generar_contratos_vencidos(p_empresa_id)
        when 'documento_por_vencer' then public.notif_generar_documentos_por_vencer(p_empresa_id)
        when 'tardanza_resumen_diario' then public.notif_generar_tardanzas_resumen(p_empresa_id)
        when 'ot_creadas_resumen' then public.notif_generar_ots_creadas(p_empresa_id)
        when 'partes_no_llenados' then public.notif_generar_partes_no_llenados(p_empresa_id)
      end;
      insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, generadas) values (p_empresa_id, v_ev, 'ok', v_n);
      v_res := v_res || jsonb_build_object(v_ev, v_n);
    exception when others then
      insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, detalle) values (p_empresa_id, v_ev, 'error', sqlerrm);
      v_res := v_res || jsonb_build_object(v_ev, 'error');
    end;
  end loop;
  return v_res;
end;
$$;

insert into public.notif_eventos_catalogo
  (codigo, modulo, nombre, descripcion, legado, canales_soportados, roles_soportados, parametros_default, destinatarios_default, orden)
values
  ('ot_creadas_resumen', 'operaciones', 'OTs creadas',
   'Cada mañana envía el resumen de las órdenes de trabajo creadas el día anterior (número, servicio, cliente, fecha programada y técnico). No incluye OTs anuladas.',
   false, array['campana','correo','whatsapp'], array['operaciones'], '{}'::jsonb,
   '{"operaciones": {"campana": true, "correo": true, "whatsapp": false}}'::jsonb, 30),
  ('partes_no_llenados', 'operaciones', 'Partes diarios no llenados',
   'Cada mañana (lunes a sábado) avisa qué OTs en curso no tienen ningún parte diario del día anterior. Operaciones recibe todas; el jefe directo del técnico, solo las de su equipo.',
   false, array['campana','correo','whatsapp'], array['operaciones','jefe'], '{}'::jsonb,
   '{"operaciones": {"campana": true, "correo": true, "whatsapp": false}, "jefe": {"campana": true, "correo": false, "whatsapp": false}}'::jsonb, 35)
on conflict (codigo) do nothing;

revoke all on function public.notif_usuarios_operaciones(text) from public, anon, authenticated;
revoke all on function public.notif_generar_ots_creadas(text, date) from public, anon, authenticated;
revoke all on function public.notif_generar_partes_no_llenados(text, date) from public, anon, authenticated;
grant execute on function public.notif_usuarios_operaciones(text) to service_role;
grant execute on function public.notif_generar_ots_creadas(text, date) to service_role;
grant execute on function public.notif_generar_partes_no_llenados(text, date) to service_role;

do $$
declare v_def text;
begin
  if (select count(*) from public.notif_eventos_catalogo where codigo in ('ot_creadas_resumen', 'partes_no_llenados') and not legado) <> 2 then
    raise exception '650: faltan los eventos de operaciones en el catálogo';
  end if;
  v_def := pg_get_functiondef('public.notif_ejecutar_empresa(text)'::regprocedure);
  if position('notif_generar_ots_creadas' in v_def) = 0 or position('notif_generar_partes_no_llenados' in v_def) = 0
     or position('notif_generar_contratos_por_vencer' in v_def) = 0 or position('notif_generar_contratos_vencidos' in v_def) = 0
     or position('notif_generar_documentos_por_vencer' in v_def) = 0 or position('notif_generar_tardanzas_resumen' in v_def) = 0 then
    raise exception '650: la rutina por empresa no llama a los seis generadores';
  end if;
  if position('isodow' in pg_get_functiondef('public.notif_generar_partes_no_llenados(text,date)'::regprocedure)) = 0 then
    raise exception '650: falta la regla de lunes a sábado';
  end if;
end $$;

commit;
