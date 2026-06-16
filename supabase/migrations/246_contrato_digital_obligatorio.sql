-- 246 — Contrato digital obligatorio: bloqueo automático de asistencia
-- Reutiliza el mecanismo asistencia_bloqueada (Ola 2 / GAP-05).
-- Campo de excepción: cargo_confianza = true → nunca bloquear.

-- ── 1. Fix trigger desbloquear_asistencia_por_contrato ───────────────────────
-- La migración 224 usaba tipo_doc='contrato' y estado='validado' (obsoletos).
-- Ahora detecta por catálogo (captura_snapshot_laboral) y acepta 'aprobado'.
-- También desbloquea cuando el motivo es 'Sin contrato digital registrado'.

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
               'Sin contrato digital registrado'
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
               'Sin contrato digital registrado'
             );
    end if;
  end if;
  return new;
end;
$$;

-- Re-habilitar el trigger (fue deshabilitado durante la depuración)
drop trigger if exists trg_desbloquear_asistencia_contrato on public.personal_documentos;
create trigger trg_desbloquear_asistencia_contrato
after insert or update on public.personal_documentos
for each row execute function public.desbloquear_asistencia_por_contrato();

-- ── 2. Bloqueo automático al dar de alta ─────────────────────────────────────
-- Nuevo colaborador sin cargo de confianza queda bloqueado hasta tener contrato.

create or replace function public.bloquear_asistencia_sin_contrato_al_alta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.cargo_confianza, false) = false
     and coalesce(new.estado, 'activo') = 'activo' then
    new.asistencia_bloqueada        := true;
    new.asistencia_bloqueada_motivo := 'Sin contrato digital registrado';
    new.asistencia_bloqueada_en     := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_al_alta_operativo on public.personal_operativo;
create trigger trg_bloquear_al_alta_operativo
before insert on public.personal_operativo
for each row execute function public.bloquear_asistencia_sin_contrato_al_alta();

drop trigger if exists trg_bloquear_al_alta_administrativo on public.personal_administrativo;
create trigger trg_bloquear_al_alta_administrativo
before insert on public.personal_administrativo
for each row execute function public.bloquear_asistencia_sin_contrato_al_alta();

-- ── 3. Evaluación masiva: procesar_sin_contrato_digital ──────────────────────
-- Llama a esta función para bloquear/desbloquear según estado contractual actual.
-- Ejecución inicial: manual para aplicar a colaboradores existentes.
-- Ejecución recurrente: llamar desde procesar_contratos_vencimiento o job diario.

create or replace function public.procesar_sin_contrato_digital(
  p_empresa_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r               record;
  v_tiene_contrato boolean;
begin
  -- ── Operativos ──────────────────────────────────────────────────────────────
  for r in
    select p.id, p.empresa_id, p.asistencia_bloqueada_motivo
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
        and (
          (t.captura_snapshot_laboral = true and t.documento_padre_tipo_id is null)
          or (lower(coalesce(d.tipo_doc, '')) like '%contrato%'
              and lower(coalesce(d.tipo_doc, '')) not like '%adenda%')
        )
    ) into v_tiene_contrato;

    if not v_tiene_contrato then
      update public.personal_operativo
         set asistencia_bloqueada        = true,
             asistencia_bloqueada_motivo = 'Sin contrato digital registrado',
             asistencia_bloqueada_en     = coalesce(asistencia_bloqueada_en, now())
       where id = r.id and empresa_id = r.empresa_id
         and coalesce(asistencia_bloqueada_motivo, '') <> 'Contrato vencido';
    else
      update public.personal_operativo
         set asistencia_bloqueada        = false,
             asistencia_bloqueada_motivo = null,
             asistencia_bloqueada_en     = null
       where id = r.id and empresa_id = r.empresa_id
         and asistencia_bloqueada_motivo = 'Sin contrato digital registrado';
    end if;
  end loop;

  -- ── Administrativos ─────────────────────────────────────────────────────────
  for r in
    select p.id, p.empresa_id, p.asistencia_bloqueada_motivo
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
        and (
          (t.captura_snapshot_laboral = true and t.documento_padre_tipo_id is null)
          or (lower(coalesce(d.tipo_doc, '')) like '%contrato%'
              and lower(coalesce(d.tipo_doc, '')) not like '%adenda%')
        )
    ) into v_tiene_contrato;

    if not v_tiene_contrato then
      update public.personal_administrativo
         set asistencia_bloqueada        = true,
             asistencia_bloqueada_motivo = 'Sin contrato digital registrado',
             asistencia_bloqueada_en     = coalesce(asistencia_bloqueada_en, now())
       where id = r.id and empresa_id = r.empresa_id
         and coalesce(asistencia_bloqueada_motivo, '') <> 'Contrato vencido';
    else
      update public.personal_administrativo
         set asistencia_bloqueada        = false,
             asistencia_bloqueada_motivo = null,
             asistencia_bloqueada_en     = null
       where id = r.id and empresa_id = r.empresa_id
         and asistencia_bloqueada_motivo = 'Sin contrato digital registrado';
    end if;
  end loop;
end;
$$;

revoke all on function public.procesar_sin_contrato_digital(text) from public;
grant execute on function public.procesar_sin_contrato_digital(text) to authenticated;

-- ── 4. Migración inicial ─────────────────────────────────────────────────────
-- Ejecutar manualmente en Supabase SQL Editor (o dejarlo comentado):
-- SELECT public.procesar_sin_contrato_digital();

select pg_notify('pgrst', 'reload schema');
