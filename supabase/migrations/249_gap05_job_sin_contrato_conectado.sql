-- 249 — GAP-05: Conectar job diario de contratos con bloqueo por falta de contrato digital
-- Refactoriza `procesar_sin_contrato_digital` para validar fecha_vencimiento
-- e implementa el pg_cron de 07:00 PE (12:00 UTC)

-- ── 1. Update trigger para incluir 'job_diario_sin_contrato' ─────────────────
create or replace function public.desbloquear_asistencia_por_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_contrato_principal boolean := false;
begin
  -- Detectar si es tipo Contrato (no adenda) usando catálogo o texto legacy
  if new.tipo_documento_id is not null then
    select coalesce(t.captura_snapshot_laboral and t.documento_padre_tipo_id is null, false)
    into v_es_contrato_principal
    from public.tipos_documento_empresa t
    where t.id = new.tipo_documento_id;
  end if;
  if not v_es_contrato_principal then
    v_es_contrato_principal :=
      lower(coalesce(new.tipo_doc, '')) like '%contrato%'
      and lower(coalesce(new.tipo_doc, '')) not like '%adenda%';
  end if;

  if v_es_contrato_principal
     and new.estado_validacion in ('aprobado', 'validado')
     and coalesce(new.activo, false) = true then
    if new.personal_tipo = 'operativo' then
      update public.personal_operativo
         set asistencia_bloqueada        = false,
             asistencia_bloqueada_motivo = null,
             asistencia_bloqueada_en     = null
       where id          = new.personal_id
         and empresa_id  = new.empresa_id
         and asistencia_bloqueada_motivo in (
               'Contrato vencido',
               'Sin contrato digital registrado',
               'job_diario_sin_contrato'
             );
    else
      update public.personal_administrativo
         set asistencia_bloqueada        = false,
             asistencia_bloqueada_motivo = null,
             asistencia_bloqueada_en     = null
       where id          = new.personal_id
         and empresa_id  = new.empresa_id
         and asistencia_bloqueada_motivo in (
               'Contrato vencido',
               'Sin contrato digital registrado',
               'job_diario_sin_contrato'
             );
    end if;
  end if;
  return new;
end;
$$;

-- ── 2. Update procesar_sin_contrato_digital (con soporte MOCK) ───────────────
drop function if exists public.procesar_sin_contrato_digital(text);

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
  v_tiene_contrato boolean;
  v_afectados     integer := 0;
  v_desbloqueados integer := 0;
  v_detalle       jsonb := '[]'::jsonb;
begin
  -- ── Operativos ──────────────────────────────────────────────────────────────
  for r in
    select p.id, p.empresa_id, p.asistencia_bloqueada, p.asistencia_bloqueada_motivo, p.nombre
    from public.personal_operativo p
    where coalesce(p.estado, 'activo') = 'activo'
      and coalesce(p.cargo_confianza, false) = false
      and (p_empresa_id is null or p.empresa_id = p_empresa_id)
  loop
    select exists(
      select 1
      from public.personal_documentos d
      left join public.tipos_documento_empresa t on t.id = d.tipo_documento_id
      where d.empresa_id   = r.empresa_id
        and d.personal_id  = r.id
        and d.estado_validacion = 'aprobado'
        and d.activo = true
        and (d.fecha_vencimiento is null or d.fecha_vencimiento >= current_date)
        and (
          (t.captura_snapshot_laboral = true and t.documento_padre_tipo_id is null)
          or (lower(coalesce(d.tipo_doc, '')) like '%contrato%'
              and lower(coalesce(d.tipo_doc, '')) not like '%adenda%')
        )
    ) into v_tiene_contrato;

    if not v_tiene_contrato then
      if r.asistencia_bloqueada = false or r.asistencia_bloqueada is null or r.asistencia_bloqueada_motivo is null then
        v_afectados := v_afectados + 1;
        v_detalle := v_detalle || jsonb_build_object('id', r.id, 'nombre', r.nombre, 'accion', 'bloquear', 'tipo', 'operativo');
        
        if not p_is_mock then
          update public.personal_operativo
             set asistencia_bloqueada        = true,
                 asistencia_bloqueada_motivo = 'job_diario_sin_contrato',
                 asistencia_bloqueada_en     = coalesce(asistencia_bloqueada_en, now())
           where id = r.id and empresa_id = r.empresa_id;
        end if;
      end if;
    else
      if r.asistencia_bloqueada = true and r.asistencia_bloqueada_motivo in ('Sin contrato digital registrado', 'job_diario_sin_contrato', 'Contrato vencido') then
        v_desbloqueados := v_desbloqueados + 1;
        v_detalle := v_detalle || jsonb_build_object('id', r.id, 'nombre', r.nombre, 'accion', 'desbloquear', 'tipo', 'operativo');

        if not p_is_mock then
          update public.personal_operativo
             set asistencia_bloqueada        = false,
                 asistencia_bloqueada_motivo = null,
                 asistencia_bloqueada_en     = null
           where id = r.id and empresa_id = r.empresa_id;
        end if;
      end if;
    end if;
  end loop;

  -- ── Administrativos ─────────────────────────────────────────────────────────
  for r in
    select p.id, p.empresa_id, p.asistencia_bloqueada, p.asistencia_bloqueada_motivo, p.nombre
    from public.personal_administrativo p
    where coalesce(p.estado, 'activo') = 'activo'
      and coalesce(p.cargo_confianza, false) = false
      and (p_empresa_id is null or p.empresa_id = p_empresa_id)
  loop
    select exists(
      select 1
      from public.personal_documentos d
      left join public.tipos_documento_empresa t on t.id = d.tipo_documento_id
      where d.empresa_id   = r.empresa_id
        and d.personal_id  = r.id
        and d.estado_validacion = 'aprobado'
        and d.activo = true
        and (d.fecha_vencimiento is null or d.fecha_vencimiento >= current_date)
        and (
          (t.captura_snapshot_laboral = true and t.documento_padre_tipo_id is null)
          or (lower(coalesce(d.tipo_doc, '')) like '%contrato%'
              and lower(coalesce(d.tipo_doc, '')) not like '%adenda%')
        )
    ) into v_tiene_contrato;

    if not v_tiene_contrato then
      if r.asistencia_bloqueada = false or r.asistencia_bloqueada is null or r.asistencia_bloqueada_motivo is null then
        v_afectados := v_afectados + 1;
        v_detalle := v_detalle || jsonb_build_object('id', r.id, 'nombre', r.nombre, 'accion', 'bloquear', 'tipo', 'administrativo');

        if not p_is_mock then
          update public.personal_administrativo
             set asistencia_bloqueada        = true,
                 asistencia_bloqueada_motivo = 'job_diario_sin_contrato',
                 asistencia_bloqueada_en     = coalesce(asistencia_bloqueada_en, now())
           where id = r.id and empresa_id = r.empresa_id;
        end if;
      end if;
    else
      if r.asistencia_bloqueada = true and r.asistencia_bloqueada_motivo in ('Sin contrato digital registrado', 'job_diario_sin_contrato', 'Contrato vencido') then
        v_desbloqueados := v_desbloqueados + 1;
        v_detalle := v_detalle || jsonb_build_object('id', r.id, 'nombre', r.nombre, 'accion', 'desbloquear', 'tipo', 'administrativo');

        if not p_is_mock then
          update public.personal_administrativo
             set asistencia_bloqueada        = false,
                 asistencia_bloqueada_motivo = null,
                 asistencia_bloqueada_en     = null
           where id = r.id and empresa_id = r.empresa_id;
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


-- ── 3. Envoltorio para cron ──────────────────────────────────────────────────
create or replace function public.procesar_rutina_diaria_contratos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Ejecuta notificaciones de vencimiento (Ola 2)
  perform public.procesar_contratos_vencimiento();
  
  -- 2. Ejecuta auditoría de contratos faltantes / vencidos y bloquea (GAP-05)
  -- Esto aplica bloqueos cuando los contratos ya vencieron, o no hay contrato válido.
  perform public.procesar_sin_contrato_digital();
end;
$$;

revoke all on function public.procesar_rutina_diaria_contratos() from public;
grant execute on function public.procesar_rutina_diaria_contratos() to authenticated;


-- ── 4. Registrar Schedule Diario en pg_cron ──────────────────────────────────
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      execute $cron$
        select cron.schedule(
          'rutina-diaria-contratos',
          '0 12 * * *',
          'select public.procesar_rutina_diaria_contratos();'
        )
        where not exists (
          select 1 from cron.job where jobname = 'rutina-diaria-contratos'
        )
      $cron$;
    exception when others then
      raise notice 'No se pudo registrar pg_cron rutina-diaria-contratos: %', sqlerrm;
    end;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
