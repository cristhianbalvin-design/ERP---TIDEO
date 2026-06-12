-- TIDEO ERP - RRHH Ola 2 / GAP-05
-- Alertas de contrato vencido y bloqueo automatico de asistencia.

alter table if exists public.personal_operativo
  add column if not exists asistencia_bloqueada boolean default false,
  add column if not exists asistencia_bloqueada_motivo text,
  add column if not exists asistencia_bloqueada_en timestamptz;

alter table if exists public.personal_administrativo
  add column if not exists asistencia_bloqueada boolean default false,
  add column if not exists asistencia_bloqueada_motivo text,
  add column if not exists asistencia_bloqueada_en timestamptz,
  add column if not exists supervisor_id text;

create or replace function public.notificar_rrhh_ola2_once(
  p_empresa_id text,
  p_user_id uuid,
  p_tipo text,
  p_titulo text,
  p_mensaje text,
  p_referencia_tipo text,
  p_referencia_id text,
  p_prioridad text default 'media'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if not exists (
    select 1
      from public.notificaciones_sistema n
     where n.empresa_id = p_empresa_id
       and n.user_id = p_user_id
       and n.tipo = p_tipo
       and n.referencia_tipo = p_referencia_tipo
       and n.referencia_id = p_referencia_id
       and coalesce(n.leida, false) = false
       and n.created_at >= now() - interval '20 hours'
  ) then
    insert into public.notificaciones_sistema
      (empresa_id, user_id, texto, tipo, titulo, mensaje, referencia_tipo, referencia_id, prioridad, leida)
    values
      (p_empresa_id, p_user_id, p_mensaje, p_tipo, p_titulo, p_mensaje, p_referencia_tipo, p_referencia_id, p_prioridad, false);
  end if;
end;
$$;

create or replace function public.desbloquear_asistencia_por_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo_doc = 'contrato'
     and new.estado_validacion = 'validado'
     and coalesce(new.activo, true) = true then
    if new.personal_tipo = 'operativo' then
      update public.personal_operativo
         set asistencia_bloqueada = false,
             asistencia_bloqueada_motivo = null,
             asistencia_bloqueada_en = null
       where id = new.personal_id
         and empresa_id = new.empresa_id
         and asistencia_bloqueada_motivo = 'Contrato vencido';
    else
      update public.personal_administrativo
         set asistencia_bloqueada = false,
             asistencia_bloqueada_motivo = null,
             asistencia_bloqueada_en = null
       where id = new.personal_id
         and empresa_id = new.empresa_id
         and asistencia_bloqueada_motivo = 'Contrato vencido';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_desbloquear_asistencia_contrato on public.personal_documentos;
create trigger trg_desbloquear_asistencia_contrato
after insert or update on public.personal_documentos
for each row execute function public.desbloquear_asistencia_por_contrato();

create or replace function public.procesar_contratos_vencimiento(p_empresa_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_dias integer;
  v_nombre text;
  v_auth_user_id uuid;
  v_jefe_user_id uuid;
  v_admin record;
begin
  for r in
    select d.*
      from public.personal_documentos d
     where d.tipo_doc = 'contrato'
       and coalesce(d.activo, true) = true
       and d.estado_validacion = 'validado'
       and d.fecha_vencimiento is not null
       and (p_empresa_id is null or d.empresa_id = p_empresa_id)
  loop
    v_dias := r.fecha_vencimiento::date - current_date;

    if r.personal_tipo = 'operativo' then
      select p.nombre, p.auth_user_id, sup.auth_user_id
        into v_nombre, v_auth_user_id, v_jefe_user_id
        from public.personal_operativo p
        left join public.personal_operativo sup
          on sup.id = p.supervisor_id
         and sup.empresa_id = p.empresa_id
       where p.id = r.personal_id and p.empresa_id = r.empresa_id;
    else
      select p.nombre, p.auth_user_id, sup.auth_user_id
        into v_nombre, v_auth_user_id, v_jefe_user_id
        from public.personal_administrativo p
        left join public.personal_administrativo sup
          on sup.id = p.supervisor_id
         and sup.empresa_id = p.empresa_id
       where p.id = r.personal_id and p.empresa_id = r.empresa_id;
    end if;

    if v_dias between 8 and 14 then
      perform public.notificar_rrhh_ola2_once(r.empresa_id, v_auth_user_id, 'contrato_por_vencer', 'Contrato por vencer', coalesce(v_nombre, 'Colaborador') || ' tiene contrato por vencer el ' || r.fecha_vencimiento::text, 'personal_documentos', r.id::text, 'media');
      perform public.notificar_rrhh_ola2_once(r.empresa_id, v_jefe_user_id, 'contrato_por_vencer', 'Contrato por vencer', coalesce(v_nombre, 'Colaborador') || ' tiene contrato por vencer el ' || r.fecha_vencimiento::text, 'personal_documentos', r.id::text, 'media');
    elsif v_dias between 1 and 7 then
      perform public.notificar_rrhh_ola2_once(r.empresa_id, v_auth_user_id, 'contrato_por_vencer', 'Contrato por vencer', coalesce(v_nombre, 'Colaborador') || ' tiene contrato por vencer el ' || r.fecha_vencimiento::text, 'personal_documentos', r.id::text, 'alta');
      perform public.notificar_rrhh_ola2_once(r.empresa_id, v_jefe_user_id, 'contrato_por_vencer', 'Contrato por vencer', coalesce(v_nombre, 'Colaborador') || ' tiene contrato por vencer el ' || r.fecha_vencimiento::text, 'personal_documentos', r.id::text, 'alta');

      for v_admin in
        select ue.user_id
          from public.usuarios_empresas ue
          join public.roles ro on ro.id = ue.rol_id
         where ue.empresa_id = r.empresa_id
           and (
             coalesce(ro.es_admin_empresa, false) = true
             or lower(coalesce(ro.nombre, ro.id::text)) like '%rrhh%'
             or lower(coalesce(ro.nombre, ro.id::text)) like '%recursos%'
           )
      loop
        perform public.notificar_rrhh_ola2_once(r.empresa_id, v_admin.user_id, 'contrato_por_vencer', 'Contrato por vencer', coalesce(v_nombre, 'Colaborador') || ' tiene contrato por vencer el ' || r.fecha_vencimiento::text, 'personal_documentos', r.id::text, 'alta');
      end loop;
    elsif v_dias < 0 then
      if r.personal_tipo = 'operativo' then
        update public.personal_operativo
           set asistencia_bloqueada = true,
               asistencia_bloqueada_motivo = 'Contrato vencido',
               asistencia_bloqueada_en = coalesce(asistencia_bloqueada_en, now())
         where id = r.personal_id and empresa_id = r.empresa_id;
      else
        update public.personal_administrativo
           set asistencia_bloqueada = true,
               asistencia_bloqueada_motivo = 'Contrato vencido',
               asistencia_bloqueada_en = coalesce(asistencia_bloqueada_en, now())
         where id = r.personal_id and empresa_id = r.empresa_id;
      end if;

      for v_admin in
        select ue.user_id
          from public.usuarios_empresas ue
          join public.roles ro on ro.id = ue.rol_id
         where ue.empresa_id = r.empresa_id
           and (
             coalesce(ro.es_admin_empresa, false) = true
             or lower(coalesce(ro.nombre, ro.id::text)) like '%rrhh%'
             or lower(coalesce(ro.nombre, ro.id::text)) like '%recursos%'
           )
      loop
        perform public.notificar_rrhh_ola2_once(r.empresa_id, v_admin.user_id, 'contrato_vencido', 'Contrato vencido', coalesce(v_nombre, 'Colaborador') || ' tiene contrato vencido. La asistencia fue bloqueada.', 'personal_documentos', r.id::text, 'alta');
      end loop;
    end if;
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');
