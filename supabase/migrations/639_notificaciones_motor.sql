-- 639: Motor común de notificaciones (fase 1).
-- Catálogo de eventos, reglas por empresa (desactivadas por defecto), log de envíos con dedupe y
-- reintentos, resolución de destinatarios (RRHH / jefe directo / colaborador) y generadores:
--   * contrato_por_vencer      : avisos a N días del vencimiento (defecto 30/15/7), usando la misma
--                                selección por fecha que calcular_habilitaciones_personal y omitiendo
--                                contratos con renovación aprobada contigua.
--   * tardanza_resumen_diario  : resumen del día anterior de tardanzas > umbral (defecto 10 min).
-- Canales: campana (notificaciones_sistema) y correo (cola para la edge function notificaciones-dispatch).
-- No modifica procesar_contratos_vencimiento (que además bloquea asistencia) ni los generadores existentes.

-- ============================================================ tablas
create table if not exists public.notif_eventos_catalogo (
  codigo              text primary key,
  modulo              text not null,
  nombre              text not null,
  descripcion         text not null,
  legado              boolean not null default false,
  canales_soportados  text[] not null default array['campana','correo'],
  roles_soportados    text[] not null default array['rrhh','jefe','colaborador'],
  parametros_default  jsonb not null default '{}'::jsonb,
  destinatarios_default jsonb not null default '{}'::jsonb,
  orden               integer not null default 100,
  creado_en           timestamptz not null default now()
);

create table if not exists public.notif_reglas_empresa (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      text not null references public.empresas(id) on delete cascade,
  evento_codigo   text not null references public.notif_eventos_catalogo(codigo),
  activo          boolean not null default false,
  parametros      jsonb not null default '{}'::jsonb,
  destinatarios   jsonb not null default '{}'::jsonb,
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  creado_en       timestamptz not null default now(),
  unique (empresa_id, evento_codigo)
);

create table if not exists public.notif_envios (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           text not null,
  evento_codigo        text not null references public.notif_eventos_catalogo(codigo),
  canal                text not null check (canal in ('campana','correo')),
  rol_destinatario     text,
  destinatario_user_id uuid not null,
  destinatario_email   text,
  clave_dedupe         text not null,
  titulo               text not null,
  mensaje              text not null,
  payload              jsonb not null default '{}'::jsonb,
  referencia_tipo      text,
  referencia_id        text,
  estado               text not null default 'pendiente'
                         check (estado in ('pendiente','enviando','enviado','error','omitido')),
  intentos             integer not null default 0,
  proximo_intento_en   timestamptz not null default now(),
  ultimo_error         text,
  notificacion_id      uuid,
  proveedor_id         text,
  creado_en            timestamptz not null default now(),
  enviado_en           timestamptz,
  unique (empresa_id, evento_codigo, canal, destinatario_user_id, clave_dedupe)
);
create index if not exists notif_envios_cola_idx
  on public.notif_envios (proximo_intento_en) where canal = 'correo' and estado in ('pendiente','enviando');
create index if not exists notif_envios_empresa_idx on public.notif_envios (empresa_id, creado_en desc);

create table if not exists public.notif_ejecuciones (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    text not null,
  evento_codigo text not null,
  estado        text not null,
  generadas     integer not null default 0,
  detalle       text,
  creado_en     timestamptz not null default now()
);
create index if not exists notif_ejecuciones_empresa_idx on public.notif_ejecuciones (empresa_id, creado_en desc);

alter table public.notif_eventos_catalogo enable row level security;
alter table public.notif_reglas_empresa  enable row level security;
alter table public.notif_envios          enable row level security;
alter table public.notif_ejecuciones     enable row level security;
revoke all on public.notif_eventos_catalogo, public.notif_reglas_empresa, public.notif_envios, public.notif_ejecuciones from anon, authenticated;

-- ============================================================ catálogo
insert into public.notif_eventos_catalogo
  (codigo, modulo, nombre, descripcion, legado, canales_soportados, roles_soportados, parametros_default, destinatarios_default, orden)
values
  ('contrato_por_vencer', 'rrhh', 'Contrato por vencer',
   'Avisa con anticipación cuando el contrato vigente de un colaborador está por vencer. No avisa si ya hay una renovación aprobada que empieza al terminar el contrato.',
   false, array['campana','correo'], array['rrhh','jefe','colaborador'],
   '{"dias_anticipacion":[30,15,7]}'::jsonb,
   '{"rrhh":{"campana":true,"correo":true},"jefe":{"campana":true,"correo":true},"colaborador":{"campana":false,"correo":false}}'::jsonb,
   10),
  ('tardanza_resumen_diario', 'asistencia', 'Resumen diario de tardanzas',
   'Cada mañana envía el resumen de las tardanzas del día anterior que superan el umbral. RRHH recibe todas; el jefe directo, solo las de su equipo.',
   false, array['campana','correo'], array['rrhh','jefe'],
   '{"umbral_minutos":10}'::jsonb,
   '{"rrhh":{"campana":true,"correo":true},"jefe":{"campana":true,"correo":false}}'::jsonb,
   20),
  ('doc_por_vencer', 'rrhh', 'Documentos por vencer',
   'Aviso en campana de documentos del personal próximos a vencer, según los días de alerta de cada tipo de documento.',
   true, array['campana'], array['rrhh'], '{}'::jsonb, '{"rrhh":{"campana":true}}'::jsonb, 90),
  ('doc_vencido', 'rrhh', 'Documentos vencidos',
   'Aviso en campana de documentos del personal ya vencidos.',
   true, array['campana'], array['rrhh'], '{}'::jsonb, '{"rrhh":{"campana":true}}'::jsonb, 91)
on conflict (codigo) do update set
  modulo = excluded.modulo, nombre = excluded.nombre, descripcion = excluded.descripcion, legado = excluded.legado,
  canales_soportados = excluded.canales_soportados, roles_soportados = excluded.roles_soportados,
  parametros_default = excluded.parametros_default, destinatarios_default = excluded.destinatarios_default,
  orden = excluded.orden;

-- Reglas iniciales: eventos nuevos DESACTIVADOS en todas las empresas, con los valores por defecto.
insert into public.notif_reglas_empresa (empresa_id, evento_codigo, activo, parametros, destinatarios)
select e.id, c.codigo, false, c.parametros_default, c.destinatarios_default
from public.empresas e cross join public.notif_eventos_catalogo c
where not c.legado
on conflict (empresa_id, evento_codigo) do nothing;

-- ============================================================ helpers
create or replace function public.notif_hoy_lima()
returns date language sql stable set search_path to 'public'
as $$ select (now() at time zone 'America/Lima')::date $$;

-- Usuarios RRHH de la empresa (mismo criterio que los generadores existentes: admin de empresa o rol RRHH).
create or replace function public.notif_usuarios_rrhh(p_empresa_id text)
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
         or lower(coalesce(ro.nombre, '')) like '%rrhh%'
         or lower(coalesce(ro.nombre, '')) like '%recursos%')
$$;

-- Usuario del colaborador.
create or replace function public.notif_usuario_colaborador(p_empresa_id text, p_personal_tipo text, p_personal_id text)
returns uuid
language sql stable security definer set search_path to 'public'
as $$
  select case when p_personal_tipo = 'operativo'
    then (select po.auth_user_id from public.personal_operativo po where po.id = p_personal_id and po.empresa_id = p_empresa_id)
    else (select pa.auth_user_id from public.personal_administrativo pa where pa.id = p_personal_id and pa.empresa_id = p_empresa_id)
  end
$$;

-- Jefe directo: 1) posición a la que reporta la posición del colaborador (usuario vigente en ella),
-- 2) usuarios_empresas.jefe_user_id del usuario del colaborador, 3) supervisor_id (solo operativos).
create or replace function public.notif_jefe_directo(p_empresa_id text, p_personal_tipo text, p_personal_id text)
returns uuid
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_posicion uuid;
  v_user uuid;
  v_jefe uuid;
begin
  if p_personal_tipo = 'operativo' then
    select po.posicion_id, po.auth_user_id into v_posicion, v_user
    from public.personal_operativo po where po.id = p_personal_id and po.empresa_id = p_empresa_id;
  else
    select pa.posicion_id, pa.auth_user_id into v_posicion, v_user
    from public.personal_administrativo pa where pa.id = p_personal_id and pa.empresa_id = p_empresa_id;
  end if;

  if v_posicion is not null then
    select pu.user_id into v_jefe
    from public.posiciones p
    join public.posiciones_usuarios pu on pu.posicion_id = p.reporta_a_posicion_id and pu.empresa_id = p.empresa_id
    where p.id = v_posicion and p.empresa_id = p_empresa_id
      and pu.user_id is not null
      and (pu.fecha_inicio is null or pu.fecha_inicio <= current_date)
      and (pu.fecha_fin is null or pu.fecha_fin >= current_date)
    order by pu.fecha_inicio desc nulls last
    limit 1;
  end if;

  if v_jefe is null and v_user is not null then
    select ue.jefe_user_id into v_jefe
    from public.usuarios_empresas ue
    where ue.empresa_id = p_empresa_id and ue.user_id = v_user and coalesce(ue.estado, 'activo') = 'activo'
    limit 1;
  end if;

  if v_jefe is null and p_personal_tipo = 'operativo' then
    select sup.auth_user_id into v_jefe
    from public.personal_operativo po
    join public.personal_operativo sup on sup.id = po.supervisor_id and sup.empresa_id = po.empresa_id
    where po.id = p_personal_id and po.empresa_id = p_empresa_id;
  end if;

  if v_jefe is not null and v_jefe = v_user then
    return null;
  end if;
  return v_jefe;
end;
$$;

-- Emite una notificación a un usuario por un canal, con dedupe por clave.
-- campana: inserta en notificaciones_sistema y registra el envío como 'enviado'.
-- correo : deja el envío 'pendiente' para notificaciones-dispatch ('omitido' si el usuario no tiene correo).
create or replace function public.notif_emitir(
  p_empresa_id text, p_evento text, p_canal text, p_rol text, p_user_id uuid, p_clave text,
  p_titulo text, p_mensaje text, p_payload jsonb, p_referencia_tipo text, p_referencia_id text, p_prioridad text default 'media')
returns boolean
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_envio uuid;
  v_notif uuid;
  v_email text;
begin
  if p_user_id is null then
    return false;
  end if;

  if p_canal = 'correo' then
    select u.email into v_email from auth.users u where u.id = p_user_id;
  end if;

  insert into public.notif_envios
    (empresa_id, evento_codigo, canal, rol_destinatario, destinatario_user_id, destinatario_email, clave_dedupe,
     titulo, mensaje, payload, referencia_tipo, referencia_id, estado, ultimo_error)
  values
    (p_empresa_id, p_evento, p_canal, p_rol, p_user_id, v_email, p_clave,
     p_titulo, p_mensaje, coalesce(p_payload, '{}'::jsonb), p_referencia_tipo, p_referencia_id,
     case when p_canal = 'campana' then 'enviado'
          when nullif(trim(coalesce(v_email, '')), '') is null then 'omitido'
          else 'pendiente' end,
     case when p_canal = 'correo' and nullif(trim(coalesce(v_email, '')), '') is null then 'sin_correo' end)
  on conflict (empresa_id, evento_codigo, canal, destinatario_user_id, clave_dedupe) do nothing
  returning id into v_envio;

  if v_envio is null then
    return false;
  end if;

  if p_canal = 'campana' then
    insert into public.notificaciones_sistema
      (empresa_id, user_id, texto, tipo, titulo, mensaje, referencia_tipo, referencia_id, referencia_payload, prioridad, leida)
    values
      (p_empresa_id, p_user_id, p_mensaje, p_evento, p_titulo, p_mensaje, p_referencia_tipo, p_referencia_id,
       coalesce(p_payload, '{}'::jsonb), coalesce(p_prioridad, 'media'), false)
    returning id into v_notif;
    update public.notif_envios set notificacion_id = v_notif, enviado_en = now() where id = v_envio;
  end if;

  return true;
end;
$$;

create or replace function public.notif_destino_activo(p_destinatarios jsonb, p_rol text, p_canal text)
returns boolean language sql immutable
as $$ select coalesce((p_destinatarios -> p_rol ->> p_canal)::boolean, false) $$;

-- ============================================================ generador: contratos por vencer
create or replace function public.notif_generar_contratos_por_vencer(p_empresa_id text, p_hoy date default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_regla record;
  v_hoy date := coalesce(p_hoy, public.notif_hoy_lima());
  v_dias int[];
  v_max int;
  r record;
  v_umbral int;
  v_clave text;
  v_titulo text;
  v_mensaje text;
  v_payload jsonb;
  v_prioridad text;
  v_total integer := 0;
  v_canal text;
  v_u uuid;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'contrato_por_vencer' and activo;
  if not found then
    return 0;
  end if;

  select coalesce(array_agg(distinct x::int order by x::int), array[30,15,7]) into v_dias
  from jsonb_array_elements_text(coalesce(v_regla.parametros -> 'dias_anticipacion', '[]'::jsonb)) x
  where x ~ '^[0-9]+$' and x::int between 1 and 180;
  if v_dias is null or cardinality(v_dias) = 0 then
    v_dias := array[30,15,7];
  end if;
  v_max := (select max(d) from unnest(v_dias) d);

  for r in
    select h.personal_id, h.personal_tipo, h.tipo_documento_id, h.tipo_doc_nombre, h.fecha_vencimiento, h.dias_restantes,
           coalesce(po.nombre, pa.nombre, 'Colaborador') as nombre,
           (select d.id from public.personal_documentos d
             where d.empresa_id = p_empresa_id and d.personal_id = h.personal_id
               and d.tipo_documento_id = h.tipo_documento_id and d.fecha_vencimiento = h.fecha_vencimiento
               and d.estado_validacion <> 'rechazado'
             order by coalesce(d.activo, false) desc, d.creado_en desc limit 1) as documento_id
    from public.calcular_habilitaciones_personal(p_empresa_id) h
    join public.tipos_documento_empresa t on t.id = h.tipo_documento_id and t.empresa_id = p_empresa_id
    left join public.personal_operativo po on h.personal_tipo = 'operativo' and po.id = h.personal_id and po.empresa_id = p_empresa_id
    left join public.personal_administrativo pa on h.personal_tipo = 'administrativo' and pa.id = h.personal_id and pa.empresa_id = p_empresa_id
    where t.categoria = 'Contractual'
      and t.exige_vencimiento
      and t.documento_padre_tipo_id is null
      and lower(t.nombre) not like '%adenda%'
      and h.estado in ('vigente','por_vencer')
      and h.fecha_vencimiento is not null
      and (h.fecha_vencimiento - v_hoy) between 0 and v_max
      and coalesce(pa.estado, po.estado, 'activo') <> 'inactivo'
      and not exists (
        select 1 from public.personal_documentos rf
        where rf.empresa_id = p_empresa_id and rf.personal_id = h.personal_id
          and rf.tipo_documento_id = h.tipo_documento_id
          and rf.contrato_referencia_id is null
          and rf.estado_validacion = 'aprobado'
          and coalesce(rf.periodo_fecha_inicio, rf.fecha_emision) > v_hoy
          and coalesce(rf.periodo_fecha_inicio, rf.fecha_emision) <= h.fecha_vencimiento + 1)
  loop
    -- Umbral alcanzado: el menor de los días configurados que sea >= días restantes.
    select min(d) into v_umbral from unnest(v_dias) d where d >= (r.fecha_vencimiento - v_hoy);
    if v_umbral is null then
      continue;
    end if;

    v_clave := 'contrato:' || r.personal_tipo || ':' || r.personal_id || ':' || r.tipo_documento_id || ':'
               || r.fecha_vencimiento::text || ':' || v_umbral::text;
    v_titulo := 'Contrato por vencer';
    v_mensaje := r.nombre || ': el ' || lower(coalesce(r.tipo_doc_nombre, 'contrato')) || ' vence el '
                 || to_char(r.fecha_vencimiento, 'DD/MM/YYYY')
                 || case (r.fecha_vencimiento - v_hoy) when 0 then ' (hoy).' when 1 then ' (mañana).'
                    else ' (en ' || (r.fecha_vencimiento - v_hoy)::text || ' días).' end;
    v_prioridad := case when (r.fecha_vencimiento - v_hoy) <= 7 then 'alta' else 'media' end;
    v_payload := jsonb_build_object(
      'personal_id', r.personal_id, 'personal_tipo', r.personal_tipo, 'nombre', r.nombre,
      'tipo_documento', r.tipo_doc_nombre, 'fecha_vencimiento', r.fecha_vencimiento,
      'dias_restantes', r.fecha_vencimiento - v_hoy, 'umbral_dias', v_umbral, 'documento_id', r.documento_id);

    foreach v_canal in array array['campana','correo'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', v_canal) then
        for v_u in select user_id from public.notif_usuarios_rrhh(p_empresa_id) loop
          if public.notif_emitir(p_empresa_id, 'contrato_por_vencer', v_canal, 'rrhh', v_u, v_clave, v_titulo, v_mensaje,
                                 v_payload, 'personal_documento', r.documento_id, v_prioridad) then
            v_total := v_total + 1;
          end if;
        end loop;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        v_u := public.notif_jefe_directo(p_empresa_id, r.personal_tipo, r.personal_id);
        if public.notif_emitir(p_empresa_id, 'contrato_por_vencer', v_canal, 'jefe', v_u, v_clave, v_titulo, v_mensaje,
                               v_payload, 'personal_documento', r.documento_id, v_prioridad) then
          v_total := v_total + 1;
        end if;
      end if;
      if public.notif_destino_activo(v_regla.destinatarios, 'colaborador', v_canal) then
        v_u := public.notif_usuario_colaborador(p_empresa_id, r.personal_tipo, r.personal_id);
        if public.notif_emitir(p_empresa_id, 'contrato_por_vencer', v_canal, 'colaborador', v_u, v_clave, v_titulo,
                               'Tu contrato vence el ' || to_char(r.fecha_vencimiento, 'DD/MM/YYYY') || '.',
                               v_payload, 'personal_documento', r.documento_id, v_prioridad) then
          v_total := v_total + 1;
        end if;
      end if;
    end loop;
  end loop;

  return v_total;
end;
$$;

-- ============================================================ generador: resumen diario de tardanzas
create or replace function public.notif_generar_tardanzas_resumen(p_empresa_id text, p_fecha date default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_regla record;
  v_fecha date := coalesce(p_fecha, public.notif_hoy_lima() - 1);
  v_umbral int;
  v_total integer := 0;
  v_items jsonb;
  v_n int;
  v_clave text;
  v_titulo text;
  v_mensaje text;
  v_canal text;
  v_u uuid;
  j record;
begin
  select * into v_regla from public.notif_reglas_empresa
  where empresa_id = p_empresa_id and evento_codigo = 'tardanza_resumen_diario' and activo;
  if not found then
    return 0;
  end if;

  v_umbral := case when (v_regla.parametros ->> 'umbral_minutos') ~ '^[0-9]+$'
                   then least(greatest((v_regla.parametros ->> 'umbral_minutos')::int, 1), 480) else 10 end;

  create temporary table if not exists _notif_tardanzas (
    personal_tipo text, personal_id text, nombre text, minutos int, hora_entrada time, jefe uuid
  ) on commit drop;
  truncate _notif_tardanzas;

  insert into _notif_tardanzas
  select ra.trabajador_tipo, ra.trabajador_id, coalesce(po.nombre, pa.nombre, 'Colaborador'),
         coalesce(ra.tardanza_minutos, ra.tardanza_min), ra.hora_entrada,
         public.notif_jefe_directo(p_empresa_id, ra.trabajador_tipo, ra.trabajador_id)
  from public.registros_asistencia ra
  left join public.personal_operativo po on ra.trabajador_tipo = 'operativo' and po.id = ra.trabajador_id and po.empresa_id = ra.empresa_id
  left join public.personal_administrativo pa on ra.trabajador_tipo <> 'operativo' and pa.id = ra.trabajador_id and pa.empresa_id = ra.empresa_id
  where ra.empresa_id = p_empresa_id
    and ra.fecha = v_fecha
    and ra.anulado_en is null
    and not coalesce(ra.justificada, false)
    and coalesce(ra.tardanza_minutos, ra.tardanza_min, 0) > v_umbral;

  select count(*) into v_n from _notif_tardanzas;
  if v_n = 0 then
    return 0;
  end if;

  v_clave := 'tardanzas:' || v_fecha::text;
  v_titulo := 'Tardanzas del ' || to_char(v_fecha, 'DD/MM/YYYY');

  -- RRHH: resumen completo.
  select jsonb_agg(jsonb_build_object('nombre', nombre, 'minutos', minutos, 'hora_entrada', to_char(hora_entrada, 'HH24:MI'))
                   order by minutos desc, nombre)
    into v_items from _notif_tardanzas;
  v_mensaje := v_n::text || case when v_n = 1 then ' colaborador llegó' else ' colaboradores llegaron' end
               || ' con más de ' || v_umbral::text || ' min de tardanza: '
               || (select string_agg(nombre || ' (' || minutos::text || ' min)', ', ' order by minutos desc, nombre)
                   from (select * from _notif_tardanzas order by minutos desc, nombre limit 5) t)
               || case when v_n > 5 then ' y ' || (v_n - 5)::text || ' más.' else '.' end;

  foreach v_canal in array array['campana','correo'] loop
    if public.notif_destino_activo(v_regla.destinatarios, 'rrhh', v_canal) then
      for v_u in select user_id from public.notif_usuarios_rrhh(p_empresa_id) loop
        if public.notif_emitir(p_empresa_id, 'tardanza_resumen_diario', v_canal, 'rrhh', v_u, v_clave, v_titulo, v_mensaje,
             jsonb_build_object('fecha', v_fecha, 'umbral_minutos', v_umbral, 'total', v_n, 'alcance', 'empresa', 'items', v_items),
             'asistencia_fecha', v_fecha::text, 'media') then
          v_total := v_total + 1;
        end if;
      end loop;
    end if;
  end loop;

  -- Jefe directo: solo su equipo.
  for j in
    select jefe,
           count(*)::int as n,
           jsonb_agg(jsonb_build_object('nombre', nombre, 'minutos', minutos, 'hora_entrada', to_char(hora_entrada, 'HH24:MI'))
                     order by minutos desc, nombre) as items,
           string_agg(nombre || ' (' || minutos::text || ' min)', ', ' order by minutos desc, nombre) as lista
    from _notif_tardanzas where jefe is not null group by jefe
  loop
    foreach v_canal in array array['campana','correo'] loop
      if public.notif_destino_activo(v_regla.destinatarios, 'jefe', v_canal) then
        if public.notif_emitir(p_empresa_id, 'tardanza_resumen_diario', v_canal, 'jefe', j.jefe, v_clave, v_titulo,
             'Tu equipo: ' || j.n::text || case when j.n = 1 then ' tardanza' else ' tardanzas' end
               || ' de más de ' || v_umbral::text || ' min: ' || j.lista || '.',
             jsonb_build_object('fecha', v_fecha, 'umbral_minutos', v_umbral, 'total', j.n, 'alcance', 'equipo', 'items', j.items),
             'asistencia_fecha', v_fecha::text, 'media') then
          v_total := v_total + 1;
        end if;
      end if;
    end loop;
  end loop;

  return v_total;
end;
$$;

-- ============================================================ rutina diaria
create or replace function public.notif_ejecutar_empresa(p_empresa_id text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_n integer;
  v_res jsonb := '{}'::jsonb;
begin
  begin
    v_n := public.notif_generar_contratos_por_vencer(p_empresa_id);
    insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, generadas) values (p_empresa_id, 'contrato_por_vencer', 'ok', v_n);
    v_res := v_res || jsonb_build_object('contrato_por_vencer', v_n);
  exception when others then
    insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, detalle) values (p_empresa_id, 'contrato_por_vencer', 'error', sqlerrm);
    v_res := v_res || jsonb_build_object('contrato_por_vencer', 'error');
  end;

  begin
    v_n := public.notif_generar_tardanzas_resumen(p_empresa_id);
    insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, generadas) values (p_empresa_id, 'tardanza_resumen_diario', 'ok', v_n);
    v_res := v_res || jsonb_build_object('tardanza_resumen_diario', v_n);
  exception when others then
    insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, detalle) values (p_empresa_id, 'tardanza_resumen_diario', 'error', sqlerrm);
    v_res := v_res || jsonb_build_object('tardanza_resumen_diario', 'error');
  end;

  return v_res;
end;
$$;

create or replace function public.notif_rutina_diaria()
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_emp text;
begin
  for v_emp in
    select distinct r.empresa_id
    from public.notif_reglas_empresa r
    join public.empresas e on e.id = r.empresa_id
    where r.activo and coalesce(e.estado, 'activo') in ('activa','activo','demo')
  loop
    perform public.notif_ejecutar_empresa(v_emp);
  end loop;
end;
$$;

-- ============================================================ RPC de la pantalla (solo admin de empresa)
create or replace function public.notif_config_listar(p_empresa_id text)
returns table(
  evento_codigo text, modulo text, nombre text, descripcion text, legado boolean,
  canales_soportados text[], roles_soportados text[], activo boolean,
  parametros jsonb, destinatarios jsonb, actualizado_en timestamptz, orden integer)
language plpgsql stable security definer set search_path to 'public'
as $$
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
  order by c.orden, c.codigo;
end;
$$;

create or replace function public.notif_config_guardar(
  p_empresa_id text, p_evento text, p_activo boolean, p_parametros jsonb, p_destinatarios jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cat record;
  v_dest jsonb := '{}'::jsonb;
  v_rol text;
  v_canal text;
  v_param jsonb := '{}'::jsonb;
  v_dias int[];
  v_umbral int;
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  select * into v_cat from public.notif_eventos_catalogo where codigo = p_evento;
  if not found then
    raise exception 'Evento de notificación desconocido: %', p_evento;
  end if;
  if v_cat.legado then
    raise exception 'Este evento lo gestiona el sistema y no se puede configurar.';
  end if;

  -- Destinatarios: solo roles y canales soportados, valores booleanos.
  foreach v_rol in array v_cat.roles_soportados loop
    v_dest := v_dest || jsonb_build_object(v_rol, '{}'::jsonb);
    foreach v_canal in array v_cat.canales_soportados loop
      v_dest := jsonb_set(v_dest, array[v_rol, v_canal],
                  to_jsonb(coalesce((p_destinatarios -> v_rol ->> v_canal)::boolean, false)));
    end loop;
  end loop;

  if p_evento = 'contrato_por_vencer' then
    select array_agg(distinct x::int order by x::int desc) into v_dias
    from jsonb_array_elements_text(coalesce(p_parametros -> 'dias_anticipacion', '[]'::jsonb)) x
    where x ~ '^[0-9]+$';
    if v_dias is null or cardinality(v_dias) = 0 or cardinality(v_dias) > 5
       or exists (select 1 from unnest(v_dias) d where d < 1 or d > 180) then
      raise exception 'Indica entre 1 y 5 avisos, cada uno entre 1 y 180 días antes del vencimiento.';
    end if;
    v_param := jsonb_build_object('dias_anticipacion', to_jsonb(v_dias));
  elsif p_evento = 'tardanza_resumen_diario' then
    v_umbral := case when (p_parametros ->> 'umbral_minutos') ~ '^[0-9]+$' then (p_parametros ->> 'umbral_minutos')::int end;
    if v_umbral is null or v_umbral < 1 or v_umbral > 480 then
      raise exception 'El umbral de tardanza debe estar entre 1 y 480 minutos.';
    end if;
    v_param := jsonb_build_object('umbral_minutos', v_umbral);
  end if;

  insert into public.notif_reglas_empresa (empresa_id, evento_codigo, activo, parametros, destinatarios, actualizado_por, actualizado_en)
  values (p_empresa_id, p_evento, coalesce(p_activo, false), v_param, v_dest, auth.uid(), now())
  on conflict (empresa_id, evento_codigo) do update set
    activo = excluded.activo, parametros = excluded.parametros, destinatarios = excluded.destinatarios,
    actualizado_por = excluded.actualizado_por, actualizado_en = now();
end;
$$;

create or replace function public.notif_envios_listar(p_empresa_id text, p_limite integer default 100)
returns table(
  id uuid, evento_codigo text, evento_nombre text, canal text, rol_destinatario text, destinatario_nombre text,
  destinatario_email text, titulo text, mensaje text, estado text, intentos integer, ultimo_error text,
  creado_en timestamptz, enviado_en timestamptz)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  return query
  select e.id, e.evento_codigo, c.nombre, e.canal, e.rol_destinatario,
         coalesce(nullif(us.nombre, ''), nullif(u.raw_user_meta_data ->> 'nombre', ''), u.email)::text,
         e.destinatario_email, e.titulo, e.mensaje, e.estado, e.intentos, e.ultimo_error, e.creado_en, e.enviado_en
  from public.notif_envios e
  join public.notif_eventos_catalogo c on c.codigo = e.evento_codigo
  left join auth.users u on u.id = e.destinatario_user_id
  left join public.usuarios us on us.id = e.destinatario_user_id::text
  where e.empresa_id = p_empresa_id
  order by e.creado_en desc
  limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$$;

-- Ejecutar ahora (para probar una configuración): corre los generadores activos de la empresa.
create or replace function public.notif_ejecutar_ahora(p_empresa_id text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  return public.notif_ejecutar_empresa(p_empresa_id);
end;
$$;

-- ============================================================ dispatcher de correo (solo service_role)
create or replace function public.notif_reclamar_correos(p_limite integer default 25)
returns setof public.notif_envios
language plpgsql security definer set search_path to 'public'
as $$
begin
  -- Recupera envíos que quedaron 'enviando' por un corte del dispatcher.
  update public.notif_envios set estado = 'pendiente'
  where canal = 'correo' and estado = 'enviando' and proximo_intento_en < now() - interval '15 minutes';

  return query
  with cola as (
    select e.id from public.notif_envios e
    where e.canal = 'correo' and e.estado = 'pendiente' and e.proximo_intento_en <= now()
    order by e.proximo_intento_en, e.creado_en
    limit least(greatest(coalesce(p_limite, 25), 1), 100)
    for update skip locked
  )
  update public.notif_envios e
     set estado = 'enviando', intentos = e.intentos + 1, proximo_intento_en = now()
  from cola where e.id = cola.id
  returning e.*;
end;
$$;

create or replace function public.notif_marcar_envio(p_id uuid, p_ok boolean, p_error text default null, p_proveedor_id text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.notif_envios e set
    estado = case when p_ok then 'enviado' when e.intentos >= 3 then 'error' else 'pendiente' end,
    enviado_en = case when p_ok then now() else e.enviado_en end,
    proveedor_id = coalesce(p_proveedor_id, e.proveedor_id),
    ultimo_error = case when p_ok then null else left(coalesce(p_error, 'error_desconocido'), 500) end,
    proximo_intento_en = case when p_ok then e.proximo_intento_en
                              else now() + (power(4, greatest(e.intentos - 1, 0)) * interval '15 minutes') end
  where e.id = p_id and e.canal = 'correo' and e.estado = 'enviando';
end;
$$;

-- ============================================================ permisos
revoke all on function public.notif_usuarios_rrhh(text), public.notif_usuario_colaborador(text, text, text),
  public.notif_jefe_directo(text, text, text),
  public.notif_emitir(text, text, text, text, uuid, text, text, text, jsonb, text, text, text),
  public.notif_generar_contratos_por_vencer(text, date), public.notif_generar_tardanzas_resumen(text, date),
  public.notif_ejecutar_empresa(text), public.notif_rutina_diaria(),
  public.notif_reclamar_correos(integer), public.notif_marcar_envio(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.notif_reclamar_correos(integer), public.notif_marcar_envio(uuid, boolean, text, text)
  to service_role;
revoke all on function public.notif_config_listar(text), public.notif_config_guardar(text, text, boolean, jsonb, jsonb),
  public.notif_envios_listar(text, integer), public.notif_ejecutar_ahora(text) from public, anon;
grant execute on function public.notif_config_listar(text), public.notif_config_guardar(text, text, boolean, jsonb, jsonb),
  public.notif_envios_listar(text, integer), public.notif_ejecutar_ahora(text) to authenticated;

-- ============================================================ cron (inerte mientras no haya reglas activas)
select cron.unschedule(jobid) from cron.job where jobname = 'notificaciones-motor-diario';
select cron.schedule('notificaciones-motor-diario', '20 12 * * *', 'select public.notif_rutina_diaria();');

-- ============================================================ comprobación
do $$
declare
  v_activas int;
  v_reglas int;
  v_empresas int;
begin
  select count(*) into v_empresas from public.empresas;
  select count(*) into v_reglas from public.notif_reglas_empresa;
  select count(*) into v_activas from public.notif_reglas_empresa where activo;
  if v_reglas <> v_empresas * 2 then
    raise exception '639: se esperaban % reglas (2 por empresa) y hay %', v_empresas * 2, v_reglas;
  end if;
  if v_activas <> 0 then
    raise exception '639: ninguna regla debe quedar activa y hay %', v_activas;
  end if;
  if (select count(*) from public.notif_eventos_catalogo) <> 4 then
    raise exception '639: catálogo incompleto';
  end if;
  if not exists (select 1 from cron.job where jobname = 'notificaciones-motor-diario') then
    raise exception '639: falta el cron notificaciones-motor-diario';
  end if;
  if position('estado_validacion = ''validado''' in pg_get_functiondef('public.procesar_contratos_vencimiento(text)'::regprocedure)) = 0 then
    raise exception '639: procesar_contratos_vencimiento no debía modificarse';
  end if;
end $$;
