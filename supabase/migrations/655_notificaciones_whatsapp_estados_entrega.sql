-- 655: Estados de entrega de WhatsApp (webhook de Meta).
-- notif_envios gana estado_entrega (enviado / entregado / leido / fallido), entregado_en, leido_en y error_entrega.
-- notif_registrar_estado_whatsapp la usa la edge function notificaciones-whatsapp-webhook (service role).
-- notif_envios_listar_v2 devuelve además esos campos para el historial (no se toca notif_envios_listar).

alter table public.notif_envios
  add column if not exists estado_entrega text,
  add column if not exists entregado_en timestamptz,
  add column if not exists leido_en timestamptz,
  add column if not exists error_entrega text;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'notif_envios_estado_entrega_chk') then
    alter table public.notif_envios add constraint notif_envios_estado_entrega_chk
      check (estado_entrega is null or estado_entrega in ('enviado', 'entregado', 'leido', 'fallido'));
  end if;
end
$c$;

create index if not exists notif_envios_proveedor_whatsapp_idx
  on public.notif_envios (proveedor_id) where canal = 'whatsapp' and proveedor_id is not null;

-- Registra un estado de Meta sin retroceder: leido > entregado > enviado. fallido se registra siempre con su error.
create or replace function public.notif_registrar_estado_whatsapp(
  p_proveedor_id text, p_estado text, p_momento timestamptz default now(), p_error text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_estado text := case lower(coalesce(p_estado, ''))
    when 'sent' then 'enviado' when 'delivered' then 'entregado' when 'read' then 'leido' when 'failed' then 'fallido' end;
  v_n integer;
begin
  if v_estado is null or nullif(trim(coalesce(p_proveedor_id, '')), '') is null then
    return 0;
  end if;
  update public.notif_envios e set
    estado_entrega = case
      when v_estado = 'fallido' then 'fallido'
      when e.estado_entrega = 'leido' then 'leido'
      when e.estado_entrega = 'entregado' and v_estado = 'enviado' then 'entregado'
      else v_estado end,
    entregado_en = case when v_estado in ('entregado', 'leido') then coalesce(e.entregado_en, p_momento) else e.entregado_en end,
    leido_en = case when v_estado = 'leido' then coalesce(e.leido_en, p_momento) else e.leido_en end,
    error_entrega = case when v_estado = 'fallido' then left(coalesce(p_error, 'Falló la entrega'), 500) else e.error_entrega end
  where e.canal = 'whatsapp' and e.proveedor_id = p_proveedor_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.notif_registrar_estado_whatsapp(text, text, timestamptz, text) from public, anon, authenticated;

-- Historial con estado de entrega (solo administradores).
create or replace function public.notif_envios_listar_v2(p_empresa_id text, p_limite integer default 100)
returns table(id uuid, evento_codigo text, evento_nombre text, canal text, rol_destinatario text, destinatario_nombre text,
              destinatario_email text, titulo text, mensaje text, estado text, intentos integer, ultimo_error text,
              creado_en timestamptz, enviado_en timestamptz,
              estado_entrega text, entregado_en timestamptz, leido_en timestamptz, error_entrega text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  return query
  select e.id, e.evento_codigo, c.nombre, e.canal, e.rol_destinatario,
         coalesce(nullif(us.nombre, ''), nullif(u.raw_user_meta_data ->> 'nombre', ''), u.email, e.destinatario_email)::text,
         coalesce(e.destinatario_email, e.destinatario_telefono), e.titulo, e.mensaje, e.estado, e.intentos, e.ultimo_error,
         e.creado_en, e.enviado_en, e.estado_entrega, e.entregado_en, e.leido_en, e.error_entrega
  from public.notif_envios e
  join public.notif_eventos_catalogo c on c.codigo = e.evento_codigo
  left join auth.users u on u.id = e.destinatario_user_id
  left join public.usuarios us on us.id = e.destinatario_user_id::text
  where e.empresa_id = p_empresa_id
  order by e.creado_en desc
  limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$$;

revoke all on function public.notif_envios_listar_v2(text, integer) from public, anon;
grant execute on function public.notif_envios_listar_v2(text, integer) to authenticated;

do $chk$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notif_envios'
                 and column_name in ('estado_entrega') ) then
    raise exception '655 chk: falta estado_entrega';
  end if;
  if not exists (select 1 from pg_proc where proname = 'notif_registrar_estado_whatsapp')
     or not exists (select 1 from pg_proc where proname = 'notif_envios_listar_v2') then
    raise exception '655 chk: faltan funciones';
  end if;
end
$chk$;
