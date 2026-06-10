-- Historial de asignaciones de jornada con vigencia por trabajador.
-- Permite segmentar el mes de transición cuando un trabajador cambia de régimen
-- (ej. ciclo_acumulativo → general al bajar de mina a Lima).
-- La asignación vigente se identifica por fecha_fin IS NULL.
-- Nunca se eliminan registros: se cierran (fecha_fin = día anterior a la nueva).

create table if not exists public.personal_asignaciones_jornada (
  id              text primary key default 'asig_' || left(replace(gen_random_uuid()::text,'-',''), 12),
  empresa_id      text not null references public.empresas(id) on delete cascade,
  personal_id     text not null,
  personal_tipo   text not null check (personal_tipo in ('operativo', 'administrativo')),

  -- Tipo de tramo: 'normal' = régimen activo pagado, 'suspension_perfecta' = cese sin pago (relación laboral continúa)
  tipo_tramo      text not null default 'normal'
                  check (tipo_tramo in ('normal', 'suspension_perfecta')),

  -- Vigencia — fecha_fin null = asignación activa
  fecha_inicio    date not null,
  fecha_fin       date,

  -- Régimen de jornada (null para suspension_perfecta)
  regimen_jornada text check (
    tipo_tramo = 'suspension_perfecta' or
    regimen_jornada in ('general', 'ciclo_acumulativo')
  ),

  -- Datos del ciclo acumulativo (obligatorios si regimen_jornada = 'ciclo_acumulativo')
  dias_ciclo_trabajo  integer,
  dias_ciclo_descanso integer,
  fecha_inicio_ciclo  date,

  -- Turno asignado (opcional; para jornada general)
  turno_id        text references public.turnos(id),

  motivo          text,
  created_at      timestamptz default now(),

  constraint chk_asig_jornada_fechas check (fecha_fin is null or fecha_fin >= fecha_inicio),
  constraint chk_asig_jornada_ciclo  check (
    regimen_jornada != 'ciclo_acumulativo' or
    (dias_ciclo_trabajo is not null and dias_ciclo_descanso is not null and fecha_inicio_ciclo is not null)
  )
);

create index if not exists idx_asig_jornada_empresa_personal
  on public.personal_asignaciones_jornada (empresa_id, personal_id);

create index if not exists idx_asig_jornada_vigencia
  on public.personal_asignaciones_jornada (personal_id, fecha_inicio, fecha_fin);

alter table public.personal_asignaciones_jornada enable row level security;

create policy "asig_jornada_tenant_aislamiento"
  on public.personal_asignaciones_jornada
  using (public.usuario_tiene_empresa(empresa_id));

-- ─── RPC: crear nueva asignación y cerrar la vigente anterior ─────────────────
-- Regla: al crear una nueva asignación, la vigente (fecha_fin IS NULL) se cierra
-- automáticamente con fecha_fin = p_fecha_inicio - 1 para mantener continuidad.
-- Nunca modifica la fecha de ingreso del trabajador.
create or replace function public.crear_asignacion_jornada(
  p_empresa_id          text,
  p_personal_id         text,
  p_personal_tipo       text,          -- 'operativo' | 'administrativo'
  p_tipo_tramo          text,          -- 'normal' | 'suspension_perfecta'
  p_fecha_inicio        date,
  p_regimen_jornada     text    default null,
  p_dias_ciclo_trabajo  integer default null,
  p_dias_ciclo_descanso integer default null,
  p_fecha_inicio_ciclo  date    default null,
  p_turno_id            text    default null,
  p_motivo              text    default null
)
returns public.personal_asignaciones_jornada
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.personal_asignaciones_jornada;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  -- Cerrar la asignación vigente anterior (si existe)
  update public.personal_asignaciones_jornada
  set fecha_fin = p_fecha_inicio - 1
  where empresa_id    = p_empresa_id
    and personal_id   = p_personal_id
    and personal_tipo = p_personal_tipo
    and fecha_fin is null;

  -- Crear la nueva asignación
  insert into public.personal_asignaciones_jornada (
    empresa_id, personal_id, personal_tipo,
    tipo_tramo, fecha_inicio, fecha_fin,
    regimen_jornada,
    dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo,
    turno_id, motivo
  ) values (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_tramo, p_fecha_inicio, null,
    p_regimen_jornada,
    p_dias_ciclo_trabajo, p_dias_ciclo_descanso, p_fecha_inicio_ciclo,
    p_turno_id, p_motivo
  )
  returning * into v_row;

  return v_row;
end;
$$;

select pg_notify('pgrst', 'reload schema');
