-- Alarma de vencimiento de claves de servicios externos (empezando por la clave de Claude de Aria).
-- Avisa por campana y correo a todos los administradores de plataforma 30, 15, 7 y 1 días antes,
-- el día del vencimiento, cada 7 días después, y en cuanto el servicio rechaza la clave.

create table if not exists public.plataforma_credenciales (
  id text primary key,
  nombre text not null,
  proveedor text not null,
  secreto text not null,
  vence_el date not null,
  dias_aviso integer[] not null default array[30, 15, 7, 1],
  activo boolean not null default true,
  ultima_falla_en timestamptz,
  notas text,
  actualizado_en timestamptz not null default now()
);

create or replace function public.usuario_es_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    join public.empresas e on e.id = ue.empresa_id
    where ue.user_id = auth.uid() and ue.estado = 'activo' and r.es_superadmin and e.es_plataforma
  );
$$;

create or replace function public.plataforma_admins()
returns table (user_id uuid, empresa_id text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct ue.user_id, ue.empresa_id
  from public.usuarios_empresas ue
  join public.roles r on r.id = ue.rol_id
  join public.empresas e on e.id = ue.empresa_id
  where ue.estado = 'activo' and r.es_superadmin and e.es_plataforma;
$$;

alter table public.plataforma_credenciales enable row level security;
drop policy if exists plataforma_credenciales_select_admin on public.plataforma_credenciales;
create policy plataforma_credenciales_select_admin on public.plataforma_credenciales
  for select to authenticated using (public.usuario_es_admin_plataforma());
revoke all on public.plataforma_credenciales from anon;
revoke insert, update, delete on public.plataforma_credenciales from authenticated;
grant select on public.plataforma_credenciales to authenticated;

insert into public.notif_eventos_catalogo
  (codigo, modulo, nombre, descripcion, legado, canales_soportados, roles_soportados, parametros_default, destinatarios_default, orden)
values
  ('credencial_por_vencer', 'plataforma', 'Clave de servicio por vencer o rechazada',
   'Avisa a los administradores de plataforma 30, 15, 7 y 1 días antes de que venza una clave de un servicio externo (por ejemplo la de Claude para Aria) y en cuanto el servicio la rechaza.',
   true, array['campana', 'correo'], array['admin_plataforma'],
   '{"dias_aviso": [30, 15, 7, 1]}'::jsonb, '{"admin_plataforma": {"campana": true, "correo": true}}'::jsonb, 900)
on conflict (codigo) do nothing;

insert into public.plataforma_credenciales (id, nombre, proveedor, secreto, vence_el, notas)
values ('anthropic_aria', 'Clave de Claude para Aria (aria-erp-produccion)', 'Anthropic', 'ANTHROPIC_API_KEY', date '2027-12-31',
        'Espacio de trabajo "ERP OPERA - Aria" en la consola de Claude. Al renovarla, actualiza el secreto en Supabase y la fecha aquí.')
on conflict (id) do nothing;

create or replace function public.plataforma_revisar_credenciales()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c record;
  a record;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_dias integer;
  v_titulo text;
  v_msg text;
  v_clave text;
  v_n integer := 0;
begin
  for c in select * from public.plataforma_credenciales where activo loop
    v_dias := c.vence_el - v_hoy;
    if not (v_dias = any(c.dias_aviso) or v_dias = 0 or (v_dias < 0 and (-v_dias) % 7 = 0)) then
      continue;
    end if;
    v_titulo := case
      when v_dias > 1 then format('La clave %s vence en %s días', c.nombre, v_dias)
      when v_dias = 1 then format('La clave %s vence mañana', c.nombre)
      when v_dias = 0 then format('La clave %s vence hoy', c.nombre)
      else format('La clave %s venció hace %s días', c.nombre, -v_dias) end;
    v_msg := format('Renueva la clave "%s" (%s), que vence el %s, y actualiza el secreto %s en Supabase. Si deja de funcionar, Aria responde con OpenAI como respaldo.',
                    c.nombre, c.proveedor, to_char(c.vence_el, 'DD/MM/YYYY'), c.secreto);
    v_clave := c.id || ':' || c.vence_el || ':' || v_dias;
    for a in select * from public.plataforma_admins() loop
      if public.notif_emitir(a.empresa_id, 'credencial_por_vencer', 'campana', 'admin_plataforma', a.user_id, v_clave,
                             v_titulo, v_msg, jsonb_build_object('credencial', c.id, 'dias', v_dias),
                             'plataforma_credencial', c.id, case when v_dias <= 7 then 'alta' else 'media' end) then
        v_n := v_n + 1;
      end if;
      perform public.notif_emitir(a.empresa_id, 'credencial_por_vencer', 'correo', 'admin_plataforma', a.user_id, v_clave,
                                  v_titulo, v_msg, jsonb_build_object('credencial', c.id, 'dias', v_dias),
                                  'plataforma_credencial', c.id, case when v_dias <= 7 then 'alta' else 'media' end);
    end loop;
  end loop;
  return v_n;
end;
$$;

-- La llama la Edge Function de Aria cuando el servicio rechaza la clave (401/403). Máximo un aviso cada 6 horas.
create or replace function public.plataforma_reportar_falla_credencial(p_credencial text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.plataforma_credenciales%rowtype;
  a record;
  v_clave text := p_credencial || ':falla:' || to_char(now() at time zone 'America/Lima', 'YYYYMMDDHH24');
  v_titulo text;
  v_msg text;
begin
  if auth.uid() is null then
    return false;
  end if;
  update public.plataforma_credenciales
     set ultima_falla_en = now(), actualizado_en = now()
   where id = p_credencial and activo
     and (ultima_falla_en is null or ultima_falla_en < now() - interval '6 hours')
  returning * into c;
  if not found then
    return false;
  end if;
  v_titulo := format('%s rechazó la clave %s', c.proveedor, c.nombre);
  v_msg := format('El servicio rechazó la clave "%s". Aria está respondiendo con OpenAI como respaldo. Revisa o renueva la clave y actualiza el secreto %s en Supabase.',
                  c.nombre, c.secreto);
  for a in select * from public.plataforma_admins() loop
    perform public.notif_emitir(a.empresa_id, 'credencial_por_vencer', 'campana', 'admin_plataforma', a.user_id, v_clave,
                                v_titulo, v_msg, jsonb_build_object('credencial', c.id, 'falla', true),
                                'plataforma_credencial', c.id, 'alta');
    perform public.notif_emitir(a.empresa_id, 'credencial_por_vencer', 'correo', 'admin_plataforma', a.user_id, v_clave,
                                v_titulo, v_msg, jsonb_build_object('credencial', c.id, 'falla', true),
                                'plataforma_credencial', c.id, 'alta');
  end loop;
  return true;
end;
$$;

revoke all on function public.plataforma_revisar_credenciales() from public, anon, authenticated;
revoke all on function public.plataforma_admins() from public, anon, authenticated;
revoke all on function public.plataforma_reportar_falla_credencial(text) from public, anon;
grant execute on function public.plataforma_reportar_falla_credencial(text) to authenticated;
grant execute on function public.usuario_es_admin_plataforma() to authenticated;

-- El evento de plataforma no aparece en la configuración de notificaciones de los clientes.
-- Parte de la versión remota vigente de notif_config_listar; único cambio: el filtro por módulo.
CREATE OR REPLACE FUNCTION public.notif_config_listar(p_empresa_id text)
 RETURNS TABLE(evento_codigo text, modulo text, nombre text, descripcion text, legado boolean, canales_soportados text[], roles_soportados text[], activo boolean, parametros jsonb, destinatarios jsonb, actualizado_en timestamp with time zone, orden integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  return query
  select c.codigo, c.modulo, c.nombre, c.descripcion, c.legado, c.canales_soportados, c.roles_soportados,
         case when c.legado then true else coalesce(r.activo, false) end,
         coalesce(r.parametros, c.parametros_default), coalesce(r.destinatarios, c.destinatarios_default),
         r.actualizado_en, c.orden
  from public.notif_eventos_catalogo c
  left join public.notif_reglas_empresa r on r.evento_codigo = c.codigo and r.empresa_id = p_empresa_id
  where c.modulo <> 'plataforma'
     or exists (select 1 from public.empresas e where e.id = p_empresa_id and e.es_plataforma)
  order by c.orden, c.codigo;
end;
$function$;

-- Revisión diaria a las 08:10 de Lima (13:10 UTC).
select cron.schedule('plataforma-credenciales-diario', '10 13 * * *', 'select public.plataforma_revisar_credenciales();');

do $$
begin
  if not exists (select 1 from public.plataforma_credenciales where id = 'anthropic_aria' and vence_el = date '2027-12-31') then
    raise exception 'Falta la credencial anthropic_aria';
  end if;
  if not exists (select 1 from public.notif_eventos_catalogo where codigo = 'credencial_por_vencer') then
    raise exception 'Falta el evento credencial_por_vencer';
  end if;
  if not exists (select 1 from cron.job where jobname = 'plataforma-credenciales-diario') then
    raise exception 'Falta el job diario de credenciales';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.plataforma_credenciales'::regclass) then
    raise exception 'RLS no activo en plataforma_credenciales';
  end if;
  if (select count(*) from public.plataforma_admins()) = 0 then
    raise exception 'No hay administradores de plataforma a quienes avisar';
  end if;
end;
$$;
