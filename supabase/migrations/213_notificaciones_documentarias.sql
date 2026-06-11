-- Fase 2: notificaciones documentarias in-app.
-- Usa calcular_habilitaciones_personal como fuente de verdad y genera avisos
-- diarios idempotentes para documentos por vencer o vencidos.

alter table public.notificaciones_sistema
  add column if not exists tipo text,
  add column if not exists titulo text,
  add column if not exists mensaje text,
  add column if not exists referencia_tipo text,
  add column if not exists referencia_id text,
  add column if not exists referencia_payload jsonb not null default '{}'::jsonb,
  add column if not exists prioridad text not null default 'media',
  add column if not exists creada_en timestamptz not null default now();

alter table public.notificaciones_sistema
  add constraint notificaciones_sistema_prioridad_chk
  check (prioridad in ('baja', 'media', 'alta')) not valid;

create index if not exists idx_notif_sistema_doc_idempotencia
  on public.notificaciones_sistema (user_id, tipo, referencia_tipo, referencia_id, created_at desc)
  where leida = false and referencia_tipo = 'personal_documento';

create table if not exists public.notificaciones_documentarias_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id text references public.empresas(id) on delete cascade,
  estado text not null default 'ok',
  generadas integer not null default 0,
  omitidas integer not null default 0,
  detalle text,
  creado_en timestamptz not null default now()
);

alter table public.notificaciones_documentarias_log enable row level security;

drop policy if exists notif_doc_log_select_admin on public.notificaciones_documentarias_log;
create policy notif_doc_log_select_admin on public.notificaciones_documentarias_log
  for select using (public.usuario_es_admin_empresa(empresa_id));

create or replace function public.generar_notificaciones_documentarias(p_empresa_id text default null)
returns table (
  empresa_id text,
  generadas integer,
  omitidas integer,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp record;
  v_alerta record;
  v_user uuid;
  v_generadas integer;
  v_omitidas integer;
  v_detalle text;
  v_tipo text;
  v_titulo text;
  v_mensaje text;
  v_prioridad text;
  v_doc_id text;
  v_payload jsonb;
begin
  for v_emp in
    select e.id
    from public.empresas e
    where (p_empresa_id is null or e.id = p_empresa_id)
      and coalesce(e.estado, 'activo') in ('activa', 'activo', 'demo')
      and (auth.uid() is null or public.usuario_es_admin_empresa(e.id))
  loop
    v_generadas := 0;
    v_omitidas := 0;
    v_detalle := null;

    begin
      for v_alerta in
        with hab as (
          select *
          from public.calcular_habilitaciones_personal(v_emp.id)
          where estado in ('por_vencer', 'vencido')
        ),
        personal as (
          select po.id, 'operativo'::text as personal_tipo, po.nombre, po.cargo, po.auth_user_id
          from public.personal_operativo po
          where po.empresa_id = v_emp.id and po.estado <> 'inactivo'

          union all

          select pa.id, 'administrativo'::text as personal_tipo, pa.nombre, pa.cargo, pa.auth_user_id
          from public.personal_administrativo pa
          where pa.empresa_id = v_emp.id
        ),
        doc_activo as (
          select distinct on (pd.personal_id, pd.tipo_documento_id)
            pd.id,
            pd.personal_id,
            pd.tipo_documento_id
          from public.personal_documentos pd
          where pd.empresa_id = v_emp.id
            and pd.activo = true
            and pd.tipo_documento_id is not null
          order by pd.personal_id, pd.tipo_documento_id, pd.version desc
        )
        select
          h.*,
          p.nombre as personal_nombre,
          p.cargo as personal_cargo,
          p.auth_user_id,
          d.id as documento_id
        from hab h
        join personal p on p.id = h.personal_id and p.personal_tipo = h.personal_tipo
        left join doc_activo d
          on d.personal_id = h.personal_id
         and d.tipo_documento_id = h.tipo_documento_id
      loop
        v_doc_id := coalesce(
          v_alerta.documento_id,
          v_alerta.personal_id || ':' || coalesce(v_alerta.tipo_documento_id, 'sin_tipo')
        );
        v_tipo := case when v_alerta.estado = 'vencido' then 'doc_vencido' else 'doc_por_vencer' end;
        v_titulo := case when v_alerta.estado = 'vencido' then 'Documento vencido' else 'Documento por vencer' end;
        v_prioridad := case when v_alerta.estado = 'vencido' then 'alta' else 'media' end;
        v_payload := jsonb_build_object(
          'personal_id', v_alerta.personal_id,
          'personal_tipo', v_alerta.personal_tipo,
          'personal_nombre', v_alerta.personal_nombre,
          'tipo_documento_id', v_alerta.tipo_documento_id,
          'tipo_doc_nombre', v_alerta.tipo_doc_nombre,
          'estado', v_alerta.estado,
          'dias_restantes', v_alerta.dias_restantes,
          'fecha_vencimiento', v_alerta.fecha_vencimiento
        );

        for v_user in
          select distinct ue.user_id
          from public.usuarios_empresas ue
          join public.roles r on r.id = ue.rol_id
          where ue.empresa_id = v_emp.id
            and ue.estado = 'activo'
            and coalesce(r.es_admin_empresa, false) = true
        loop
          v_mensaje := case
            when v_alerta.estado = 'vencido'
              then format('%s · %s vencio hace %s dias. El colaborador no esta habilitado para campo.',
                v_alerta.personal_nombre,
                coalesce(v_alerta.tipo_doc_nombre, v_alerta.tipo_documento_id),
                abs(coalesce(v_alerta.dias_restantes, 0))
              )
            else format('%s · %s vence en %s dias. Solicita la renovacion.',
                v_alerta.personal_nombre,
                coalesce(v_alerta.tipo_doc_nombre, v_alerta.tipo_documento_id),
                coalesce(v_alerta.dias_restantes, 0)
              )
          end;

          if exists (
            select 1
            from public.notificaciones_sistema ns
            where ns.user_id = v_user
              and ns.tipo = v_tipo
              and ns.referencia_tipo = 'personal_documento'
              and ns.referencia_id = v_doc_id
              and ns.leida = false
              and ns.created_at >= now() - interval '20 hours'
          ) then
            v_omitidas := v_omitidas + 1;
          else
            insert into public.notificaciones_sistema (
              empresa_id, user_id, texto, tipo, titulo, mensaje,
              referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
            ) values (
              v_emp.id, v_user, v_mensaje, v_tipo, v_titulo, v_mensaje,
              'personal_documento', v_doc_id, v_payload, v_prioridad, false, now(), now()
            );
            v_generadas := v_generadas + 1;
          end if;
        end loop;

        if not exists (
          select 1
          from public.usuarios_empresas ue
          join public.roles r on r.id = ue.rol_id
          where ue.empresa_id = v_emp.id
            and ue.estado = 'activo'
            and coalesce(r.es_admin_empresa, false) = true
        ) then
          v_detalle := concat_ws(' | ', v_detalle, 'Tenant sin destinatario admin/RRHH activo');
        end if;

        if v_alerta.auth_user_id is not null and exists (
          select 1
          from public.usuarios_empresas ue
          where ue.empresa_id = v_emp.id
            and ue.user_id = v_alerta.auth_user_id
            and ue.estado = 'activo'
        ) then
          v_mensaje := case
            when v_alerta.estado = 'vencido'
              then format('Tu %s vencio hace %s dias. Contacta a RRHH para regularizar tu situacion.',
                coalesce(v_alerta.tipo_doc_nombre, v_alerta.tipo_documento_id),
                abs(coalesce(v_alerta.dias_restantes, 0))
              )
            else format('Tu %s vence en %s dias. Coordina con RRHH para renovarlo a tiempo.',
                coalesce(v_alerta.tipo_doc_nombre, v_alerta.tipo_documento_id),
                coalesce(v_alerta.dias_restantes, 0)
              )
          end;

          if exists (
            select 1
            from public.notificaciones_sistema ns
            where ns.user_id = v_alerta.auth_user_id
              and ns.tipo = v_tipo
              and ns.referencia_tipo = 'personal_documento'
              and ns.referencia_id = v_doc_id
              and ns.leida = false
              and ns.created_at >= now() - interval '20 hours'
          ) then
            v_omitidas := v_omitidas + 1;
          else
            insert into public.notificaciones_sistema (
              empresa_id, user_id, texto, tipo, titulo, mensaje,
              referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
            ) values (
              v_emp.id, v_alerta.auth_user_id, v_mensaje, v_tipo, v_titulo, v_mensaje,
              'personal_documento', v_doc_id, v_payload, v_prioridad, false, now(), now()
            );
            v_generadas := v_generadas + 1;
          end if;
        end if;
      end loop;

      insert into public.notificaciones_documentarias_log (empresa_id, estado, generadas, omitidas, detalle)
      values (v_emp.id, 'ok', v_generadas, v_omitidas, v_detalle);
    exception when others then
      v_detalle := sqlerrm;
      insert into public.notificaciones_documentarias_log (empresa_id, estado, generadas, omitidas, detalle)
      values (v_emp.id, 'error', v_generadas, v_omitidas, v_detalle);
    end;

    empresa_id := v_emp.id;
    generadas := v_generadas;
    omitidas := v_omitidas;
    detalle := v_detalle;
    return next;
  end loop;
end;
$$;

revoke all on function public.generar_notificaciones_documentarias(text) from public;
grant execute on function public.generar_notificaciones_documentarias(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      execute $cron$
        select cron.schedule(
          'notificaciones-documentarias-diarias',
          '0 12 * * *',
          'select public.generar_notificaciones_documentarias();'
        )
        where not exists (
          select 1 from cron.job where jobname = 'notificaciones-documentarias-diarias'
        )
      $cron$;
    exception when others then
      raise notice 'No se pudo registrar pg_cron notificaciones-documentarias-diarias: %', sqlerrm;
    end;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
