-- Ola 5A - GAP-14 biometricos por archivo y GAP-17 WhatsApp proveedor-agnostico.

alter table public.empresa_config
  add column if not exists biometrico_importacion_activa boolean default false,
  add column if not exists whatsapp_habilitado boolean default false,
  add column if not exists whatsapp_provider text default 'simulado',
  add column if not exists whatsapp_base_url text,
  add column if not exists whatsapp_phone_number_id text,
  add column if not exists whatsapp_api_key_ref text,
  add column if not exists whatsapp_internos_consentimiento_implicito boolean default true,
  add column if not exists whatsapp_reintentos_max integer default 3;

alter table public.personal_operativo
  add column if not exists codigo_biometrico text,
  add column if not exists whatsapp_opt_in boolean default false,
  add column if not exists whatsapp_opt_in_en timestamptz,
  add column if not exists celular_whatsapp text;

alter table public.personal_administrativo
  add column if not exists codigo_biometrico text,
  add column if not exists whatsapp_opt_in boolean default false,
  add column if not exists whatsapp_opt_in_en timestamptz,
  add column if not exists celular_whatsapp text;

create table if not exists public.asistencia_biometrico_perfiles (
  id text primary key default ('bio_perfil_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  nombre text not null,
  separador text default ',',
  tiene_encabezado boolean default true,
  encoding text default 'utf-8',
  formato_fecha text default 'auto',
  formato_hora text default 'HH:mm',
  identificador_tipo text not null default 'dni' check (identificador_tipo in ('dni','codigo_biometrico')),
  columna_identificador text not null,
  columna_fecha text not null,
  columna_hora text not null,
  columna_tipo text,
  entrada_valores text default 'entrada,in,checkin,0',
  salida_valores text default 'salida,out,checkout,1',
  solo_marcas boolean default false,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_bio_perfiles_empresa on public.asistencia_biometrico_perfiles(empresa_id, estado);
alter table public.asistencia_biometrico_perfiles enable row level security;
drop policy if exists bio_perfiles_tenant on public.asistencia_biometrico_perfiles;
create policy bio_perfiles_tenant on public.asistencia_biometrico_perfiles
for all using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.asistencia_biometrico_lotes (
  id text primary key default ('bio_lote_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  perfil_id text,
  archivo_nombre text,
  archivo_hash text,
  importado_por uuid default auth.uid(),
  estado text not null default 'confirmado' check (estado in ('preview','confirmado','anulado')),
  totales jsonb not null default '{}'::jsonb,
  detalle jsonb not null default '{}'::jsonb,
  sobrescribio_duplicados boolean default false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_bio_lotes_empresa on public.asistencia_biometrico_lotes(empresa_id, created_at desc);
alter table public.asistencia_biometrico_lotes enable row level security;
drop policy if exists bio_lotes_tenant on public.asistencia_biometrico_lotes;
create policy bio_lotes_tenant on public.asistencia_biometrico_lotes
for all using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

alter table public.registros_asistencia
  add column if not exists origen_registro text,
  add column if not exists importacion_biometrica_lote_id text,
  add column if not exists marcas_biometricas jsonb default '[]'::jsonb,
  add column if not exists anulado_por_lote_id text,
  add column if not exists anulado_en timestamptz,
  add column if not exists motivo_anulacion text;

create index if not exists idx_reg_asistencia_bio_lote on public.registros_asistencia(empresa_id, importacion_biometrica_lote_id);

create or replace function public.anular_lote_biometrico(p_lote_id text, p_motivo text)
returns public.asistencia_biometrico_lotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote public.asistencia_biometrico_lotes;
begin
  select * into v_lote
  from public.asistencia_biometrico_lotes
  where id = p_lote_id;

  if not found then
    raise exception 'lote_no_encontrado';
  end if;

  if not public.usuario_tiene_empresa(v_lote.empresa_id) then
    raise exception 'sin_permiso';
  end if;

  update public.registros_asistencia
     set estado = 'anulado',
         anulado_por_lote_id = p_lote_id,
         anulado_en = now(),
         motivo_anulacion = p_motivo,
         updated_at = now()
   where empresa_id = v_lote.empresa_id
     and importacion_biometrica_lote_id = p_lote_id
     and coalesce(estado, '') <> 'anulado';

  update public.asistencia_biometrico_lotes
     set estado = 'anulado',
         motivo_anulacion = p_motivo,
         anulado_por = auth.uid(),
         anulado_en = now()
   where id = p_lote_id
   returning * into v_lote;

  return v_lote;
end;
$$;

create table if not exists public.whatsapp_plantillas (
  id text primary key default ('wpt_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  tipo_alerta text not null,
  proveedor_template text not null,
  variables text[] not null default array['colaborador','documento','fecha_vencimiento','dias_restantes'],
  texto_sugerido text,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uq_whatsapp_plantilla_tipo on public.whatsapp_plantillas(empresa_id, tipo_alerta);
alter table public.whatsapp_plantillas enable row level security;
drop policy if exists whatsapp_plantillas_tenant on public.whatsapp_plantillas;
create policy whatsapp_plantillas_tenant on public.whatsapp_plantillas
for all using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.whatsapp_matriz_destinatarios (
  id text primary key default ('wmr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  tipo_alerta text not null,
  enviar_colaborador boolean default true,
  enviar_jefe_area boolean default true,
  enviar_rrhh boolean default true,
  enviar_admin boolean default false,
  requiere_opt_in_colaborador boolean default true,
  internos_consentimiento_implicito boolean default true,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uq_whatsapp_matriz_tipo on public.whatsapp_matriz_destinatarios(empresa_id, tipo_alerta);
alter table public.whatsapp_matriz_destinatarios enable row level security;
drop policy if exists whatsapp_matriz_tenant on public.whatsapp_matriz_destinatarios;
create policy whatsapp_matriz_tenant on public.whatsapp_matriz_destinatarios
for all using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.whatsapp_envios (
  id text primary key default ('wen_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  tipo_alerta text not null,
  destinatario_tipo text not null,
  destinatario_user_id uuid,
  personal_id text,
  personal_tipo text,
  telefono text,
  plantilla_id text,
  proveedor_template text,
  variables jsonb not null default '{}'::jsonb,
  referencia_tipo text,
  referencia_id text,
  estado text not null default 'encolado' check (estado in ('encolado','simulado','enviado','entregado','fallido','omitido')),
  proveedor text default 'simulado',
  proveedor_message_id text,
  proveedor_respuesta jsonb default '{}'::jsonb,
  intentos integer default 0,
  ultimo_error text,
  fecha_idempotencia date default current_date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uq_whatsapp_idempotencia_diaria
  on public.whatsapp_envios(empresa_id, tipo_alerta, destinatario_tipo, coalesce(destinatario_user_id::text, personal_id, telefono), referencia_tipo, referencia_id, fecha_idempotencia);

create index if not exists idx_whatsapp_envios_empresa_estado on public.whatsapp_envios(empresa_id, estado, created_at desc);
alter table public.whatsapp_envios enable row level security;
drop policy if exists whatsapp_envios_select on public.whatsapp_envios;
create policy whatsapp_envios_select on public.whatsapp_envios
for select using (public.usuario_tiene_empresa(empresa_id));
drop policy if exists whatsapp_envios_insert on public.whatsapp_envios;
create policy whatsapp_envios_insert on public.whatsapp_envios
for insert with check (public.usuario_tiene_empresa(empresa_id));
drop policy if exists whatsapp_envios_update on public.whatsapp_envios;
create policy whatsapp_envios_update on public.whatsapp_envios
for update using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create or replace function public.whatsapp_tipo_alerta_desde_notificacion(p_tipo text, p_payload jsonb)
returns text
language sql
stable
as $$
  select case
    when p_tipo in ('contrato_por_vencer','contrato_vencido') then 'contrato_por_vencer'
    when lower(coalesce(p_payload ->> 'tipo_doc_nombre', p_payload ->> 'tipo_documento_id', '')) like '%dni%' then 'doc_dni_por_vencer'
    when lower(coalesce(p_payload ->> 'tipo_doc_nombre', p_payload ->> 'tipo_documento_id', '')) like '%sctr%' then 'doc_sctr_por_vencer'
    when lower(coalesce(p_payload ->> 'tipo_doc_nombre', p_payload ->> 'tipo_documento_id', '')) like '%licencia%' then 'doc_licencia_por_vencer'
    else null
  end;
$$;

create or replace function public.whatsapp_enqueue_from_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_tipo_alerta text;
  v_tpl record;
  v_matriz record;
  v_personal record;
  v_vars jsonb;
  v_tel text;
begin
  select *
    into v_cfg
    from public.empresa_config
   where empresa_id = new.empresa_id;

  if not coalesce(v_cfg.whatsapp_habilitado, false) then
    return new;
  end if;

  v_tipo_alerta := public.whatsapp_tipo_alerta_desde_notificacion(new.tipo, new.referencia_payload);
  if v_tipo_alerta is null then
    return new;
  end if;

  select * into v_tpl
    from public.whatsapp_plantillas
   where empresa_id = new.empresa_id and tipo_alerta = v_tipo_alerta and estado = 'activo'
   limit 1;

  select * into v_matriz
    from public.whatsapp_matriz_destinatarios
   where empresa_id = new.empresa_id and tipo_alerta = v_tipo_alerta and estado = 'activo'
   limit 1;

  if v_tpl.id is null or v_matriz.id is null then
    return new;
  end if;

  v_vars := jsonb_build_object(
    'colaborador', coalesce(new.referencia_payload ->> 'personal_nombre', 'Colaborador'),
    'documento', coalesce(new.referencia_payload ->> 'tipo_doc_nombre', new.titulo, 'Documento'),
    'fecha_vencimiento', coalesce(new.referencia_payload ->> 'fecha_vencimiento', ''),
    'dias_restantes', coalesce(new.referencia_payload ->> 'dias_restantes', '')
  );

  if coalesce(v_matriz.enviar_colaborador, false) then
    if coalesce(new.referencia_payload ->> 'personal_tipo', '') = 'administrativo' then
      select id, 'administrativo'::text as personal_tipo, nombre, auth_user_id, supervisor_id,
             coalesce(celular_whatsapp, telefono_personal, telefono) as telefono,
             whatsapp_opt_in
        into v_personal
        from public.personal_administrativo
       where empresa_id = new.empresa_id and id = new.referencia_payload ->> 'personal_id';
    else
      select id, 'operativo'::text as personal_tipo, nombre, auth_user_id, supervisor_id,
             coalesce(celular_whatsapp, telefono_personal, telefono) as telefono,
             whatsapp_opt_in
        into v_personal
        from public.personal_operativo
       where empresa_id = new.empresa_id and id = new.referencia_payload ->> 'personal_id';
    end if;

    v_tel := regexp_replace(coalesce(v_personal.telefono, ''), '[^0-9+]', '', 'g');
    if v_tel <> '' and (not coalesce(v_matriz.requiere_opt_in_colaborador, true) or coalesce(v_personal.whatsapp_opt_in, false)) then
      insert into public.whatsapp_envios (
        empresa_id, tipo_alerta, destinatario_tipo, destinatario_user_id, personal_id, personal_tipo,
        telefono, plantilla_id, proveedor_template, variables, referencia_tipo, referencia_id,
        estado, proveedor
      ) values (
        new.empresa_id, v_tipo_alerta, 'colaborador', v_personal.auth_user_id, v_personal.id, v_personal.personal_tipo,
        v_tel, v_tpl.id, v_tpl.proveedor_template, v_vars, new.referencia_tipo, new.referencia_id,
        case when coalesce(v_cfg.whatsapp_provider, 'simulado') = 'simulado' then 'simulado' else 'encolado' end,
        coalesce(v_cfg.whatsapp_provider, 'simulado')
      )
      on conflict do nothing;
    end if;
  end if;

  if coalesce(v_matriz.enviar_rrhh, false) or coalesce(v_matriz.enviar_admin, false) then
    insert into public.whatsapp_envios (
      empresa_id, tipo_alerta, destinatario_tipo, destinatario_user_id, telefono, plantilla_id,
      proveedor_template, variables, referencia_tipo, referencia_id, estado, proveedor
    )
    select
      new.empresa_id, v_tipo_alerta,
      case when coalesce(r.es_admin_empresa, false) then 'admin' else 'rrhh' end,
      ue.user_id,
      regexp_replace(coalesce(u.telefono, u.celular, ''), '[^0-9+]', '', 'g'),
      v_tpl.id, v_tpl.proveedor_template, v_vars, new.referencia_tipo, new.referencia_id,
      case when coalesce(v_cfg.whatsapp_provider, 'simulado') = 'simulado' then 'simulado' else 'encolado' end,
      coalesce(v_cfg.whatsapp_provider, 'simulado')
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    left join public.usuarios u on u.id = ue.user_id::text
    where ue.empresa_id = new.empresa_id
      and ue.estado = 'activo'
      and regexp_replace(coalesce(u.telefono, u.celular, ''), '[^0-9+]', '', 'g') <> ''
      and (
        (coalesce(v_matriz.enviar_admin, false) and coalesce(r.es_admin_empresa, false))
        or
        (coalesce(v_matriz.enviar_rrhh, false) and lower(coalesce(r.nombre, r.id::text)) like '%rrhh%')
      )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_whatsapp_enqueue_notificacion on public.notificaciones_sistema;
create trigger trg_whatsapp_enqueue_notificacion
after insert on public.notificaciones_sistema
for each row execute function public.whatsapp_enqueue_from_notificacion();

comment on table public.asistencia_biometrico_perfiles is 'GAP-14 perfiles agnosticos de importacion de relojes biometricos.';
comment on table public.asistencia_biometrico_lotes is 'GAP-14 lotes de importacion biometrica con totales y anulacion sin borrado.';
comment on table public.whatsapp_envios is 'GAP-17 cola/log de WhatsApp proveedor-agnostico; credenciales fuera del frontend.';
