-- TIDEO ERP - RRHH, Customer Success e IA auditada.

create table if not exists public.personal_operativo (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text,
  nombre text not null,
  documento text,
  cargo text,
  especialidad text,
  area text default 'Operaciones',
  turno_id text,
  telefono text,
  email text,
  sueldo_base numeric(14,2) default 0,
  moneda text default 'PEN',
  sistema_pensionario text,
  costo_hora_real numeric(14,2) default 0,
  costo_hora_extra numeric(14,2) default 0,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.personal_administrativo (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text,
  nombre text not null,
  documento text,
  cargo text,
  area text,
  telefono text,
  email text,
  sueldo_base numeric(14,2) default 0,
  moneda text default 'PEN',
  sistema_pensionario text,
  fecha_ingreso date,
  fecha_fin_contrato date,
  vacaciones_pendientes numeric(8,2) default 0,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.turnos (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  nombre text not null,
  hora_entrada time not null,
  hora_salida time not null,
  tolerancia_minutos integer default 0,
  cruza_medianoche boolean default false,
  dias_laborables jsonb default '[]'::jsonb,
  minutos_refrigerio integer default 0,
  horas_efectivas numeric(8,2) default 0,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.registros_asistencia (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  trabajador_tipo text not null check (trabajador_tipo in ('operativo','administrativo')),
  trabajador_id text not null,
  turno_id text references public.turnos(id),
  fecha date not null,
  hora_entrada time,
  hora_salida time,
  tardanza_minutos integer default 0,
  horas_extra numeric(8,2) default 0,
  estado text default 'completo',
  justificacion text,
  origen_registro text default 'backoffice',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.periodos_nomina (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  periodo text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  total_trabajadores integer default 0,
  masa_salarial_bruta numeric(14,2) default 0,
  total_neto numeric(14,2) default 0,
  total_cargas_empresa numeric(14,2) default 0,
  moneda text default 'PEN',
  estado text default 'abierto',
  cerrado_por uuid,
  cerrado_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, periodo)
);

create table if not exists public.detalle_nomina (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  periodo_nomina_id text not null references public.periodos_nomina(id) on delete cascade,
  trabajador_tipo text not null,
  trabajador_id text not null,
  sueldo_base numeric(14,2) default 0,
  remuneracion_bruta numeric(14,2) default 0,
  descuentos numeric(14,2) default 0,
  retencion_ir numeric(14,2) default 0,
  neto numeric(14,2) default 0,
  essalud numeric(14,2) default 0,
  cts numeric(14,2) default 0,
  gratificacion numeric(14,2) default 0,
  vacaciones numeric(14,2) default 0,
  costo_real_empresa numeric(14,2) default 0,
  costo_hora_real numeric(14,2) default 0,
  moneda text default 'PEN',
  desglose jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.prestamos_personal (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  trabajador_tipo text not null,
  trabajador_id text not null,
  monto numeric(14,2) not null,
  moneda text default 'PEN',
  cuota_mensual numeric(14,2) default 0,
  cuotas integer default 1,
  cuotas_pagadas integer default 0,
  saldo numeric(14,2) default 0,
  descontar_nomina boolean default true,
  estado text default 'vigente',
  fecha_desembolso date default current_date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.onboardings (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  oportunidad_id text references public.oportunidades(id),
  responsable_id uuid,
  fecha_inicio date,
  fecha_objetivo date,
  checklist jsonb default '[]'::jsonb,
  avance_pct numeric(5,2) default 0,
  estado text default 'en_progreso',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.planes_exito (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text not null references public.cuentas(id),
  objetivos jsonb default '[]'::jsonb,
  responsable_id uuid,
  periodicidad_revision text default 'mensual',
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.health_scores (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text not null references public.cuentas(id),
  score numeric(5,2) default 0,
  clasificacion text,
  dimensiones jsonb default '{}'::jsonb,
  fecha_calculo date default current_date,
  created_at timestamptz default now()
);

create table if not exists public.renovaciones (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text not null references public.cuentas(id),
  fecha_vencimiento date not null,
  monto_contrato numeric(14,2) default 0,
  moneda text default 'PEN',
  estado text default 'pendiente_contacto',
  oportunidad_id text references public.oportunidades(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.nps_encuestas (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  contacto_id text references public.contactos(id),
  score integer,
  clasificacion text,
  comentario text,
  fecha_envio date,
  fecha_respuesta date,
  estado text default 'enviado',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ia_logs (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  modulo text not null,
  entidad_tipo text,
  entidad_id text,
  accion text not null,
  prompt_resumen text,
  recomendacion text,
  accion_tomada text,
  usuario_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_personal_operativo_empresa on public.personal_operativo(empresa_id, estado);
create index if not exists idx_personal_admin_empresa on public.personal_administrativo(empresa_id, estado);
create index if not exists idx_asistencia_empresa on public.registros_asistencia(empresa_id, fecha);
create index if not exists idx_nomina_empresa on public.periodos_nomina(empresa_id, periodo);
create index if not exists idx_prestamos_personal_empresa on public.prestamos_personal(empresa_id, estado);
create index if not exists idx_onboarding_empresa on public.onboardings(empresa_id, estado);
create index if not exists idx_health_scores_empresa on public.health_scores(empresa_id, fecha_calculo);
create index if not exists idx_ia_logs_empresa on public.ia_logs(empresa_id, created_at desc);
