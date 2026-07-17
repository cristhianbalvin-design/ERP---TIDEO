-- ============================================================================
-- 337 · Revisión de impacto en nómina para ajustes de roster con resultado descanso
-- ============================================================================
-- Trazabilidad humana pura: marca que un ajuste aprobado (tipo_dia_solicitado
-- = 'descanso') ya fue revisado en Control de Asistencia (descuento o
-- justificación de la falta subyacente, si aplicaba). No conecta con
-- registros_asistencia ni con ningún cálculo de nómina o roster — solo
-- controla si la grilla muestra el ícono "Revisar impacto en nómina"
-- (ver calcularRangoRosterMinero / pages_ops.jsx). No toca el trigger de
-- retro wall (332) ni el flujo de aprobación (estado: pendiente/aprobado/rechazado).

alter table public.roster_minero_ajustes
  add column if not exists revision_asistencia_confirmada boolean not null default false,
  add column if not exists revision_confirmada_por text references public.usuarios(id) on delete set null,
  add column if not exists revision_confirmada_en timestamptz;

select pg_notify('pgrst', 'reload schema');
