-- TIDEO ERP - Migración 011: Políticas RLS para RRHH y Customer Success
-- Las tablas DDL ya existen en 007_hr_cs_ai.sql.
-- Este archivo solo activa el RLS y crea las políticas de aislamiento por tenant.

-- Personal Operativo
alter table public.personal_operativo enable row level security;
drop policy if exists tenant_personal_operativo_isolation on public.personal_operativo;
create policy tenant_personal_operativo_isolation on public.personal_operativo
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Personal Administrativo
alter table public.personal_administrativo enable row level security;
drop policy if exists tenant_personal_admin_isolation on public.personal_administrativo;
create policy tenant_personal_admin_isolation on public.personal_administrativo
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Turnos
alter table public.turnos enable row level security;
drop policy if exists tenant_turnos_isolation on public.turnos;
create policy tenant_turnos_isolation on public.turnos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Registros de Asistencia
alter table public.registros_asistencia enable row level security;
drop policy if exists tenant_asistencia_isolation on public.registros_asistencia;
create policy tenant_asistencia_isolation on public.registros_asistencia
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Periodos de Nómina
alter table public.periodos_nomina enable row level security;
drop policy if exists tenant_periodos_nomina_isolation on public.periodos_nomina;
create policy tenant_periodos_nomina_isolation on public.periodos_nomina
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Detalle de Nómina
alter table public.detalle_nomina enable row level security;
drop policy if exists tenant_detalle_nomina_isolation on public.detalle_nomina;
create policy tenant_detalle_nomina_isolation on public.detalle_nomina
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Préstamos al Personal
alter table public.prestamos_personal enable row level security;
drop policy if exists tenant_prestamos_personal_isolation on public.prestamos_personal;
create policy tenant_prestamos_personal_isolation on public.prestamos_personal
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Customer Success: Onboardings
alter table public.onboardings enable row level security;
drop policy if exists tenant_onboardings_isolation on public.onboardings;
create policy tenant_onboardings_isolation on public.onboardings
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Customer Success: Planes de Éxito
alter table public.planes_exito enable row level security;
drop policy if exists tenant_planes_exito_isolation on public.planes_exito;
create policy tenant_planes_exito_isolation on public.planes_exito
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Customer Success: Health Scores
alter table public.health_scores enable row level security;
drop policy if exists tenant_health_scores_isolation on public.health_scores;
create policy tenant_health_scores_isolation on public.health_scores
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Customer Success: Renovaciones
alter table public.renovaciones enable row level security;
drop policy if exists tenant_renovaciones_isolation on public.renovaciones;
create policy tenant_renovaciones_isolation on public.renovaciones
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Customer Success: NPS Encuestas
alter table public.nps_encuestas enable row level security;
drop policy if exists tenant_nps_encuestas_isolation on public.nps_encuestas;
create policy tenant_nps_encuestas_isolation on public.nps_encuestas
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- IA Logs
alter table public.ia_logs enable row level security;
drop policy if exists tenant_ia_logs_isolation on public.ia_logs;
create policy tenant_ia_logs_isolation on public.ia_logs
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
