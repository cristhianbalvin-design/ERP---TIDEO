-- TIDEO ERP - RRHH Ola 3 / GAP-19
-- Historial de amonestaciones disciplinarias por colaborador.
-- Tipos: verbal, escrita, suspension. Evidencia obligatoria para escrita y suspension.
-- Auditable: nunca se borra, solo se anula con motivo.

create table if not exists public.amonestaciones_personal (
  id                    text primary key,
  empresa_id            text not null references public.empresas(id) on delete cascade,
  personal_id           text not null,
  personal_tipo         text not null check (personal_tipo in ('operativo', 'administrativo')),
  personal_nombre       text not null,

  tipo                  text not null check (tipo in ('verbal', 'escrita', 'suspension')),
  motivo                text not null,
  descripcion           text,
  fecha                 date not null,

  -- Solo aplica cuando tipo = 'suspension'
  dias_suspension       integer,
  fecha_inicio_suspension date,
  fecha_fin_suspension  date,

  evidencia_url         text,
  registrado_por        text not null,
  registrado_por_id     text,

  estado                text not null default 'activo'
                          check (estado in ('activo', 'anulado')),
  motivo_anulacion      text,
  anulado_por           text,
  anulado_en            timestamptz,

  -- Impacto en asistencia (solo suspension sin goce)
  impactar_asistencia   boolean not null default false,
  impacto_aplicado      boolean not null default false,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

alter table public.amonestaciones_personal enable row level security;

drop policy if exists amonestaciones_personal_isolation on public.amonestaciones_personal;
create policy amonestaciones_personal_isolation on public.amonestaciones_personal
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create index if not exists idx_amonestaciones_empresa_personal
  on public.amonestaciones_personal (empresa_id, personal_id, fecha desc);

create index if not exists idx_amonestaciones_activas
  on public.amonestaciones_personal (empresa_id, personal_id)
  where estado = 'activo';

-- Idempotencia de notificacion in-app para amonestaciones (ventana 20 horas)
create index if not exists idx_notif_amonestacion_idempotencia
  on public.notificaciones_sistema (user_id, tipo, referencia_tipo, referencia_id, created_at desc)
  where leida = false and referencia_tipo = 'amonestacion';

select pg_notify('pgrst', 'reload schema');
