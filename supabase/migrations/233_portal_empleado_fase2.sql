-- Fase 2 Portal del Empleado: evaluaciones, mis datos, constancias, boletas electronicas y firma avanzada.

alter table public.empresa_config
  add column if not exists portal_constancia_emision_directa boolean default false,
  add column if not exists portal_boletas_firma_digital_activa boolean default false,
  add column if not exists portal_firma_contratos_activa boolean default false,
  add column if not exists portal_firma_tsa_url text,
  add column if not exists portal_firma_otp_canal_default text default 'email_personal',
  add column if not exists portal_firma_tipos_alto_riesgo text[] default array['contrato','adenda','renovacion','cese'],
  add column if not exists portal_constancia_plantilla text,
  add column if not exists portal_datos_campos_permitidos text[] default array['telefono_personal','email_personal','direccion','contacto_emergencia','datos_bancarios'];

alter table public.personal_operativo
  add column if not exists telefono_personal text,
  add column if not exists email_personal text,
  add column if not exists consentimiento_entrega_electronica boolean default false,
  add column if not exists consentimiento_entrega_electronica_en timestamptz,
  add column if not exists firma_rubrica_url text,
  add column if not exists firma_rubrica_path text,
  add column if not exists firma_otp_canal text,
  add column if not exists firma_otp_verificado_en timestamptz,
  add column if not exists firma_autorizacion_doc_id text,
  add column if not exists firma_onboarding_completo boolean default false;

alter table public.personal_administrativo
  add column if not exists telefono_personal text,
  add column if not exists email_personal text,
  add column if not exists consentimiento_entrega_electronica boolean default false,
  add column if not exists consentimiento_entrega_electronica_en timestamptz,
  add column if not exists firma_rubrica_url text,
  add column if not exists firma_rubrica_path text,
  add column if not exists firma_otp_canal text,
  add column if not exists firma_otp_verificado_en timestamptz,
  add column if not exists firma_autorizacion_doc_id text,
  add column if not exists firma_onboarding_completo boolean default false;

create or replace function public.portal_campo_datos_permitido(p_empresa_id text, p_campo text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_campo = any(
    coalesce(
      (
        select ec.portal_datos_campos_permitidos
        from public.empresa_config ec
        where ec.empresa_id = p_empresa_id
        limit 1
      ),
      array['telefono_personal','email_personal','direccion','contacto_emergencia','datos_bancarios']::text[]
    )
  );
$$;

create table if not exists public.portal_datos_solicitudes (
  id text primary key default ('pds_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  personal_id text not null,
  personal_tipo text not null check (personal_tipo in ('operativo','administrativo')),
  campo text not null,
  valor_anterior jsonb,
  valor_propuesto jsonb not null,
  campo_critico boolean default false,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado')),
  solicitado_por uuid default auth.uid(),
  resuelto_por uuid,
  comentario_resolucion text,
  created_at timestamptz default now(),
  resuelto_en timestamptz,
  updated_at timestamptz default now()
);

create index if not exists idx_portal_datos_solicitudes_empresa_estado on public.portal_datos_solicitudes(empresa_id, estado);
alter table public.portal_datos_solicitudes enable row level security;

drop policy if exists portal_datos_self_select on public.portal_datos_solicitudes;
create policy portal_datos_self_select on public.portal_datos_solicitudes
for select using (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));

drop policy if exists portal_datos_self_insert on public.portal_datos_solicitudes;
create policy portal_datos_self_insert on public.portal_datos_solicitudes
for insert with check (
  public.es_mi_personal_rrhh(empresa_id, personal_id)
  and public.portal_campo_datos_permitido(empresa_id, campo)
);

drop policy if exists portal_datos_rrhh_update on public.portal_datos_solicitudes;
create policy portal_datos_rrhh_update on public.portal_datos_solicitudes
for update using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.portal_constancias_trabajo (
  id text primary key default ('pct_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  personal_id text not null,
  personal_tipo text not null check (personal_tipo in ('operativo','administrativo')),
  proposito text,
  estado text not null default 'solicitada' check (estado in ('solicitada','aprobada','rechazada','emitida')),
  plantilla_html text,
  documento_url text,
  documento_path text,
  documento_hash text,
  solicitado_por uuid default auth.uid(),
  resuelto_por uuid,
  comentario_resolucion text,
  created_at timestamptz default now(),
  resuelto_en timestamptz,
  emitida_en timestamptz
);

create index if not exists idx_portal_constancias_empresa_estado on public.portal_constancias_trabajo(empresa_id, estado);
alter table public.portal_constancias_trabajo enable row level security;

drop policy if exists portal_constancias_select on public.portal_constancias_trabajo;
create policy portal_constancias_select on public.portal_constancias_trabajo
for select using (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));

drop policy if exists portal_constancias_insert on public.portal_constancias_trabajo;
create policy portal_constancias_insert on public.portal_constancias_trabajo
for insert with check (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));

drop policy if exists portal_constancias_update on public.portal_constancias_trabajo;
create policy portal_constancias_update on public.portal_constancias_trabajo
for update using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.portal_boletas_electronicas (
  id text primary key default ('pbe_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  periodo_id text not null,
  personal_id text not null,
  personal_tipo text not null check (personal_tipo in ('operativo','administrativo')),
  documento_url text,
  documento_path text,
  documento_hash text not null,
  firmado_digital boolean default false,
  firma_estado text default 'pendiente',
  created_at timestamptz default now(),
  unique (empresa_id, periodo_id, personal_id)
);

alter table public.portal_boletas_electronicas enable row level security;
drop policy if exists portal_boletas_select on public.portal_boletas_electronicas;
create policy portal_boletas_select on public.portal_boletas_electronicas
for select using (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));
drop policy if exists portal_boletas_upsert on public.portal_boletas_electronicas;
create policy portal_boletas_upsert on public.portal_boletas_electronicas
for all using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.portal_boleta_acuses (
  id text primary key default ('pba_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  boleta_id text,
  periodo_id text not null,
  personal_id text not null,
  personal_tipo text not null check (personal_tipo in ('operativo','administrativo')),
  usuario_id uuid default auth.uid(),
  ip text,
  user_agent text,
  documento_hash text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_portal_boleta_acuses_empresa_periodo on public.portal_boleta_acuses(empresa_id, periodo_id);
alter table public.portal_boleta_acuses enable row level security;
drop policy if exists portal_boleta_acuses_select on public.portal_boleta_acuses;
create policy portal_boleta_acuses_select on public.portal_boleta_acuses
for select using (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));
drop policy if exists portal_boleta_acuses_insert on public.portal_boleta_acuses;
create policy portal_boleta_acuses_insert on public.portal_boleta_acuses
for insert with check (public.es_mi_personal_rrhh(empresa_id, personal_id));

create table if not exists public.portal_boleta_visualizaciones (
  id text primary key default ('pbv_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  boleta_id text,
  periodo_id text not null,
  personal_id text not null,
  personal_tipo text not null check (personal_tipo in ('operativo','administrativo')),
  usuario_id uuid default auth.uid(),
  ip text,
  user_agent text,
  documento_hash text,
  created_at timestamptz default now()
);

alter table public.portal_boleta_visualizaciones enable row level security;
drop policy if exists portal_boleta_vistas_select on public.portal_boleta_visualizaciones;
create policy portal_boleta_vistas_select on public.portal_boleta_visualizaciones
for select using (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));
drop policy if exists portal_boleta_vistas_insert on public.portal_boleta_visualizaciones;
create policy portal_boleta_vistas_insert on public.portal_boleta_visualizaciones
for insert with check (public.es_mi_personal_rrhh(empresa_id, personal_id));

create table if not exists public.portal_firma_otp_intentos (
  id text primary key default ('pfo_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  personal_id text not null,
  personal_tipo text not null check (personal_tipo in ('operativo','administrativo')),
  canal text not null,
  destino_mask text,
  proposito text not null default 'firma',
  estado text not null default 'enviado' check (estado in ('enviado','validado','fallido','expirado')),
  evidencia jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.portal_firma_otp_intentos enable row level security;
drop policy if exists portal_firma_otp_select on public.portal_firma_otp_intentos;
create policy portal_firma_otp_select on public.portal_firma_otp_intentos
for select using (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));
drop policy if exists portal_firma_otp_insert on public.portal_firma_otp_intentos;
create policy portal_firma_otp_insert on public.portal_firma_otp_intentos
for insert with check (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));

create table if not exists public.portal_contrato_firma_registros (
  id text primary key default ('pcf_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  contrato_documento_id text,
  personal_id text not null,
  personal_tipo text not null check (personal_tipo in ('operativo','administrativo')),
  usuario_id uuid default auth.uid(),
  otp_intento_id text,
  canal_otp text,
  rubrica_url text,
  autorizacion_documento_id text,
  hash_original text,
  hash_firmado text,
  tsa_url text,
  tsa_token text,
  tsa_estado text default 'pendiente',
  evidencia jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.portal_contrato_firma_registros enable row level security;
drop policy if exists portal_firma_registros_select on public.portal_contrato_firma_registros;
create policy portal_firma_registros_select on public.portal_contrato_firma_registros
for select using (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));
drop policy if exists portal_firma_registros_insert on public.portal_contrato_firma_registros;
create policy portal_firma_registros_insert on public.portal_contrato_firma_registros
for insert with check (public.es_mi_personal_rrhh(empresa_id, personal_id) or public.usuario_tiene_empresa(empresa_id));

create or replace function public.portal_prevent_append_only_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append_only_record';
end;
$$;

drop trigger if exists trg_portal_boleta_acuses_append_only on public.portal_boleta_acuses;
create trigger trg_portal_boleta_acuses_append_only
before update or delete on public.portal_boleta_acuses
for each row execute function public.portal_prevent_append_only_changes();

drop trigger if exists trg_portal_boleta_vistas_append_only on public.portal_boleta_visualizaciones;
create trigger trg_portal_boleta_vistas_append_only
before update or delete on public.portal_boleta_visualizaciones
for each row execute function public.portal_prevent_append_only_changes();

drop trigger if exists trg_portal_firma_registros_append_only on public.portal_contrato_firma_registros;
create trigger trg_portal_firma_registros_append_only
before update or delete on public.portal_contrato_firma_registros
for each row execute function public.portal_prevent_append_only_changes();

comment on table public.portal_datos_solicitudes is 'F2-3 Portal empleado: propuestas de actualizacion de datos propios con aprobacion RRHH.';
comment on table public.portal_constancias_trabajo is 'F2-4 Portal empleado: solicitudes/emisiones de constancia de trabajo.';
comment on table public.portal_boleta_acuses is 'F2-1 Portal empleado: acuses inmutables de entrega electronica de boletas.';
comment on table public.portal_boleta_visualizaciones is 'F2-1 Portal empleado: visualizaciones posteriores de boletas.';
comment on table public.portal_contrato_firma_registros is 'F2-2 Portal empleado: evidencia append-only de firma electronica avanzada/OTP/TSA.';
