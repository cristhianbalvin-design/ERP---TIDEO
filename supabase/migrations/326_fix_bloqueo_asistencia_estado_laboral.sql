-- 326 — Fix: el bloqueo de asistencia por falta de contrato nunca se aplicaba
-- a personal_operativo.
--
-- bloquear_asistencia_sin_contrato_al_alta() y procesar_sin_contrato_digital()
-- (version vigente desde la migracion 322) condicionan el bloqueo a
-- estado = 'activo'. Esa convencion es correcta para personal_administrativo,
-- pero personal_operativo usa 'estado' como disponibilidad operativa (siempre
-- 'disponible' en la practica) y tiene una columna separada, estado_laboral
-- ('activo' | 'cesado'), para el estado de empleo real. Como resultado, el
-- bloqueo nunca se activaba para ningun tecnico operativo (70/70 con
-- asistencia_bloqueada = false, 30 de ellos sin contrato aprobado). Se
-- corrige para usar estado_laboral en ambas tablas (personal_administrativo
-- tambien tiene esa columna y coincide con 'estado' en todos sus registros
-- actuales, asi que no cambia su comportamiento).

create or replace function public.bloquear_asistencia_sin_contrato_al_alta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.cargo_confianza, false) = false
     and coalesce(new.estado_laboral, 'activo') = 'activo' then
    new.asistencia_bloqueada        := true;
    new.asistencia_bloqueada_motivo := 'Sin contrato digital registrado';
    new.asistencia_bloqueada_en     := now();
  end if;
  return new;
end;
$$;

create or replace function public.procesar_sin_contrato_digital(
  p_empresa_id text default null,
  p_is_mock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r               record;
  v_debe_bloquear boolean;
  v_motivo        text;
  v_motivos_job   constant text[] := array[
    'Sin contrato digital registrado', 'job_diario_sin_contrato',
    'Contrato vencido', 'Contrato rechazado'
  ];
  v_afectados     integer := 0;
  v_desbloqueados integer := 0;
  v_detalle       jsonb := '[]'::jsonb;
begin
  for r in
    select p.id, p.empresa_id, p.nombre, p.tipo,
           p.asistencia_bloqueada, p.asistencia_bloqueada_motivo,
           v.vigente, v.estado_validacion, v.contrato_documento_id
    from (
      select id, empresa_id, nombre, asistencia_bloqueada, asistencia_bloqueada_motivo,
             'operativo'::text as tipo
      from public.personal_operativo
      where coalesce(estado_laboral, 'activo') = 'activo'
        and coalesce(cargo_confianza, false) = false
        and (p_empresa_id is null or empresa_id = p_empresa_id)

      union all

      select id, empresa_id, nombre, asistencia_bloqueada, asistencia_bloqueada_motivo,
             'administrativo'::text
      from public.personal_administrativo
      where coalesce(estado_laboral, 'activo') = 'activo'
        and coalesce(cargo_confianza, false) = false
        and (p_empresa_id is null or empresa_id = p_empresa_id)
    ) p
    cross join lateral public.vigencia_efectiva_core(p.empresa_id, current_date, p.id, p.tipo) v
  loop
    -- La vigencia por fechas la decide vigencia_efectiva; estado_validacion
    -- solo bloquea cuando el documento fue rechazado explicitamente.
    v_debe_bloquear := (not coalesce(r.vigente, false))
                       or r.estado_validacion = 'rechazado';

    v_motivo := case
      when r.contrato_documento_id is null then 'Sin contrato digital registrado'
      when not coalesce(r.vigente, false)  then 'Contrato vencido'
      else 'Contrato rechazado'
    end;

    if v_debe_bloquear then
      if coalesce(r.asistencia_bloqueada, false) = false or r.asistencia_bloqueada_motivo is null then
        v_afectados := v_afectados + 1;
        v_detalle := v_detalle || jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'accion', 'bloquear',
          'motivo', v_motivo, 'tipo', r.tipo
        );

        if not p_is_mock then
          if r.tipo = 'operativo' then
            update public.personal_operativo
               set asistencia_bloqueada        = true,
                   asistencia_bloqueada_motivo = v_motivo,
                   asistencia_bloqueada_en     = coalesce(asistencia_bloqueada_en, now())
             where id = r.id and empresa_id = r.empresa_id;
          else
            update public.personal_administrativo
               set asistencia_bloqueada        = true,
                   asistencia_bloqueada_motivo = v_motivo,
                   asistencia_bloqueada_en     = coalesce(asistencia_bloqueada_en, now())
             where id = r.id and empresa_id = r.empresa_id;
          end if;
        end if;
      end if;
    else
      -- Solo desbloquea bloqueos puestos por este mecanismo; los manuales no se tocan.
      if coalesce(r.asistencia_bloqueada, false) = true
         and r.asistencia_bloqueada_motivo = any (v_motivos_job) then
        v_desbloqueados := v_desbloqueados + 1;
        v_detalle := v_detalle || jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'accion', 'desbloquear', 'tipo', r.tipo
        );

        if not p_is_mock then
          if r.tipo = 'operativo' then
            update public.personal_operativo
               set asistencia_bloqueada        = false,
                   asistencia_bloqueada_motivo = null,
                   asistencia_bloqueada_en     = null
             where id = r.id and empresa_id = r.empresa_id;
          else
            update public.personal_administrativo
               set asistencia_bloqueada        = false,
                   asistencia_bloqueada_motivo = null,
                   asistencia_bloqueada_en     = null
             where id = r.id and empresa_id = r.empresa_id;
          end if;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'is_mock', p_is_mock,
    'bloqueos_nuevos', v_afectados,
    'desbloqueos', v_desbloqueados,
    'detalle', v_detalle
  );
end;
$$;

revoke all on function public.procesar_sin_contrato_digital(text, boolean) from public;
grant execute on function public.procesar_sin_contrato_digital(text, boolean) to authenticated;

-- Aplicacion retroactiva inmediata: bloquea a los operativos actualmente sin
-- contrato vigente (incluye a Juan) y no toca a nadie con contrato vigente.
select public.procesar_sin_contrato_digital();

select pg_notify('pgrst', 'reload schema');
