-- ============================================================================
-- 332 · Ajustes manuales de roster minero (swap trabajo <-> descanso)
-- ============================================================================
-- Solicitud de ajuste negociado de un dia puntual del roster minero, con
-- trazabilidad y aprobacion. Un ajuste "pendiente" no afecta ningun calculo;
-- solo al pasar a "aprobado" pasa a tener prioridad sobre el registro real y
-- el calculo teorico (ver calcularRangoRosterMinero en rosterMineroService.js).
--
-- Si la fecha del ajuste ya tiene nomina procesada (nomina_detalle), aprobarlo
-- reutiliza EXACTAMENTE el mismo mecanismo de autorizacion del "retro wall" de
-- personal_documentos (290_retro_wall... / 320_retro_wall_documentos_nomina.sql):
-- la funcion public.personal_documentos_puede_forzar_retro(empresa, personal_tipo)
-- y el registro en public.auditoria. No se crea ningun permiso ni tabla de
-- autorizacion nueva.

-- 1. Tabla ---------------------------------------------------------------------

create table if not exists public.roster_minero_ajustes (
  id                    text primary key,
  empresa_id            text not null references public.empresas(id) on delete cascade,
  personal_id           text not null,
  personal_tipo         text not null check (personal_tipo in ('operativo', 'administrativo')),
  fecha                 date not null,

  tipo_dia_antes        text not null check (tipo_dia_antes in ('trabajo', 'descanso')),
  tipo_dia_solicitado   text not null check (tipo_dia_solicitado in ('trabajo', 'descanso')),
  motivo                text not null check (btrim(motivo) <> ''),

  solicitado_por        text references public.usuarios(id) on delete set null,
  solicitado_en         timestamptz not null default now(),

  estado                text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  aprobado_por          text references public.usuarios(id) on delete set null,
  resuelto_en           timestamptz,

  -- Marcado automaticamente por el trigger de mas abajo: informativo desde la
  -- creacion, y exigido en la aprobacion si sigue en true.
  periodo_cerrado       boolean not null default false,

  -- Mismo patron de columnas que personal_documentos.retro_override_* (320).
  retro_override_por    text references public.usuarios(id) on delete set null,
  retro_override_en     timestamptz,
  retro_override_motivo text,

  created_at            timestamptz not null default now(),

  constraint roster_minero_ajustes_swap_check check (tipo_dia_solicitado <> tipo_dia_antes)
);

-- Evita dos solicitudes activas (pendiente o aprobada) para el mismo dia.
create unique index if not exists idx_roster_minero_ajustes_unico_activo
  on public.roster_minero_ajustes (empresa_id, personal_id, personal_tipo, fecha)
  where estado in ('pendiente', 'aprobado');

create index if not exists idx_roster_minero_ajustes_personal
  on public.roster_minero_ajustes (empresa_id, personal_id, personal_tipo, fecha desc);

alter table public.roster_minero_ajustes enable row level security;

drop policy if exists roster_minero_ajustes_isolation on public.roster_minero_ajustes;
create policy roster_minero_ajustes_isolation on public.roster_minero_ajustes
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- 2. Deteccion de periodo con nomina ya procesada -------------------------------
-- Misma logica de interseccion que el trigger de 320 (rango de fechas del
-- periodo vs. la fecha del ajuste), colapsada a una sola fecha puntual.

create or replace function public.roster_ajuste_periodo_procesado(
  p_empresa_id    text,
  p_personal_id   text,
  p_personal_tipo text,
  p_fecha         date
)
returns text
language sql
stable
set search_path = public
as $$
  select string_agg(pn.periodo, ', ' order by pn.anio, pn.mes, pn.quincena)
  from public.periodos_nomina pn
  where pn.empresa_id = p_empresa_id
    and exists (
      select 1 from public.nomina_detalle nd
      where nd.periodo_id = pn.id::text
        and nd.trabajador_id = p_personal_id
        and nd.trabajador_tipo = p_personal_tipo
    )
    and (case when pn.quincena = 2 then make_date(pn.anio, pn.mes, 16)
              else make_date(pn.anio, pn.mes, 1) end) <= p_fecha
    and coalesce(pn.fecha_corte, (make_date(pn.anio, pn.mes, 1) + interval '1 month - 1 day')::date)
        >= p_fecha;
$$;

-- 3. Trigger: bloquea la aprobacion si el periodo ya esta procesado ------------
-- Reutiliza public.personal_documentos_puede_forzar_retro (320) tal cual: es el
-- mismo permiso ('aprobar' en rrhh_operativo/rrhh_admin) que ya protege
-- cambios retroactivos de contrato. No es un mecanismo nuevo en paralelo.

create or replace function public.bloquear_aprobacion_ajuste_roster_cerrado()
returns trigger
language plpgsql
as $$
declare
  v_conflictos text;
begin
  v_conflictos := public.roster_ajuste_periodo_procesado(NEW.empresa_id, NEW.personal_id, NEW.personal_tipo, NEW.fecha);
  NEW.periodo_cerrado := (v_conflictos is not null);

  if NEW.estado = 'aprobado' and (TG_OP = 'INSERT' or OLD.estado is distinct from 'aprobado') then
    if NEW.periodo_cerrado then
      if NEW.retro_override_por is null then
        raise exception 'RETRO_WALL: no se puede aprobar el ajuste del %  porque ya existe nomina procesada en el/los periodo(s): %. Requiere autorizacion para forzar el cambio.',
          NEW.fecha, v_conflictos;
      end if;

      if not public.personal_documentos_puede_forzar_retro(NEW.empresa_id, NEW.personal_tipo) then
        raise exception 'RETRO_WALL_PERMISO: no tiene autorizacion para forzar cambios retroactivos sobre nomina ya procesada.';
      end if;

      NEW.retro_override_en := coalesce(NEW.retro_override_en, now());

      insert into public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
      values (
        NEW.empresa_id, auth.uid(), 'rrhh', 'roster_minero_ajustes', NEW.id, 'retro_override_autorizado',
        jsonb_build_object(
          'personal_id', NEW.personal_id,
          'personal_tipo', NEW.personal_tipo,
          'fecha', NEW.fecha,
          'periodos', v_conflictos,
          'motivo', NEW.retro_override_motivo
        )
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_bloquear_aprobacion_ajuste_roster on public.roster_minero_ajustes;
create trigger trg_bloquear_aprobacion_ajuste_roster
before insert or update on public.roster_minero_ajustes
for each row execute function public.bloquear_aprobacion_ajuste_roster_cerrado();

select pg_notify('pgrst', 'reload schema');
