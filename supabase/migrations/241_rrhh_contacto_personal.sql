-- Hallazgo 1 RRHH: canales de contacto personal explicitos.

alter table public.personal_operativo
  add column if not exists email_personal text,
  add column if not exists celular_personal text;

alter table public.personal_administrativo
  add column if not exists email_personal text,
  add column if not exists celular_personal text;

alter table public.empresa_config
  alter column portal_datos_campos_permitidos
  set default array['telefono_personal','celular_personal','email_personal','direccion','contacto_emergencia','datos_bancarios'];

update public.empresa_config
   set portal_datos_campos_permitidos = (
     select array_agg(distinct campo)
       from unnest(
         coalesce(portal_datos_campos_permitidos, array['telefono_personal','email_personal','direccion','contacto_emergencia','datos_bancarios']::text[])
         || array['celular_personal']::text[]
       ) as campos(campo)
   )
 where portal_datos_campos_permitidos is not null
   and not ('celular_personal' = any(portal_datos_campos_permitidos));

create or replace function public.portal_campo_datos_permitido(p_empresa_id text, p_campo text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_campo = any(
    coalesce(
      (
        select ec.portal_datos_campos_permitidos
        from public.empresa_config ec
        where ec.empresa_id = p_empresa_id
        limit 1
      ),
      array['telefono_personal','celular_personal','email_personal','direccion','contacto_emergencia','datos_bancarios']::text[]
    )
  );
$$;

drop function if exists public.resolver_mi_personal_rrhh();

create or replace function public.resolver_mi_personal_rrhh()
returns table (
  empresa_id text,
  personal_id text,
  personal_tipo text,
  nombre text,
  documento text,
  email text,
  telefono text,
  email_personal text,
  celular_personal text,
  telefono_personal text,
  cargo text,
  area text,
  sede text,
  fecha_ingreso date,
  fecha_fin_contrato date,
  regimen_jornada text,
  dias_ciclo_trabajo integer,
  dias_ciclo_descanso integer,
  dias_vacaciones_disponibles numeric
)
language sql
security definer
set search_path = public
as $$
  select p.empresa_id, p.id, 'operativo', p.nombre, p.documento, p.email, p.telefono,
         p.email_personal, p.celular_personal, p.telefono_personal,
         p.cargo, p.area, p.sede, p.fecha_ingreso, p.fecha_fin_contrato, p.regimen_jornada,
         p.dias_ciclo_trabajo, p.dias_ciclo_descanso, p.dias_vacaciones_disponibles
    from public.personal_operativo p
   where p.auth_user_id::text = auth.uid()::text
      or lower(coalesce(p.email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  union all
  select p.empresa_id, p.id, 'administrativo', p.nombre, coalesce(p.documento, p.dni), p.email, p.telefono,
         p.email_personal, p.celular_personal, p.telefono_personal,
         p.cargo, p.area, p.sede, p.fecha_ingreso, p.fecha_fin_contrato, p.regimen_jornada,
         p.dias_ciclo_trabajo, p.dias_ciclo_descanso, p.dias_vacaciones_disponibles
    from public.personal_administrativo p
   where p.auth_user_id::text = auth.uid()::text
      or lower(coalesce(p.email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  limit 1;
$$;

comment on column public.personal_operativo.email_personal is
  'Correo personal del colaborador para verificacion de firma electronica y notificaciones.';
comment on column public.personal_operativo.celular_personal is
  'Celular personal del colaborador para WhatsApp y verificacion.';
comment on column public.personal_administrativo.email_personal is
  'Correo personal del colaborador para verificacion de firma electronica y notificaciones.';
comment on column public.personal_administrativo.celular_personal is
  'Celular personal del colaborador para WhatsApp y verificacion.';

create or replace function public.whatsapp_enqueue_from_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_tipo_alerta text;
  v_tpl record;
  v_matriz record;
  v_personal record;
  v_vars jsonb;
  v_tel text;
begin
  select *
    into v_cfg
    from public.empresa_config
   where empresa_id = new.empresa_id;

  if not coalesce(v_cfg.whatsapp_habilitado, false) then
    return new;
  end if;

  v_tipo_alerta := public.whatsapp_tipo_alerta_desde_notificacion(new.tipo, new.referencia_payload);
  if v_tipo_alerta is null then
    return new;
  end if;

  select * into v_tpl
    from public.whatsapp_plantillas
   where empresa_id = new.empresa_id and tipo_alerta = v_tipo_alerta and estado = 'activo'
   limit 1;

  select * into v_matriz
    from public.whatsapp_matriz_destinatarios
   where empresa_id = new.empresa_id and tipo_alerta = v_tipo_alerta and estado = 'activo'
   limit 1;

  if v_tpl.id is null or v_matriz.id is null then
    return new;
  end if;

  v_vars := jsonb_build_object(
    'colaborador', coalesce(new.referencia_payload ->> 'personal_nombre', 'Colaborador'),
    'documento', coalesce(new.referencia_payload ->> 'tipo_doc_nombre', new.titulo, 'Documento'),
    'fecha_vencimiento', coalesce(new.referencia_payload ->> 'fecha_vencimiento', ''),
    'dias_restantes', coalesce(new.referencia_payload ->> 'dias_restantes', '')
  );

  if coalesce(v_matriz.enviar_colaborador, false) then
    if coalesce(new.referencia_payload ->> 'personal_tipo', '') = 'administrativo' then
      select id, 'administrativo'::text as personal_tipo, nombre, auth_user_id, supervisor_id,
             coalesce(celular_personal, celular_whatsapp, telefono_personal, telefono) as telefono,
             whatsapp_opt_in
        into v_personal
        from public.personal_administrativo
       where empresa_id = new.empresa_id and id = new.referencia_payload ->> 'personal_id';
    else
      select id, 'operativo'::text as personal_tipo, nombre, auth_user_id, supervisor_id,
             coalesce(celular_personal, celular_whatsapp, telefono_personal, telefono) as telefono,
             whatsapp_opt_in
        into v_personal
        from public.personal_operativo
       where empresa_id = new.empresa_id and id = new.referencia_payload ->> 'personal_id';
    end if;

    v_tel := regexp_replace(coalesce(v_personal.telefono, ''), '[^0-9+]', '', 'g');
    if v_tel <> '' and (not coalesce(v_matriz.requiere_opt_in_colaborador, true) or coalesce(v_personal.whatsapp_opt_in, false)) then
      insert into public.whatsapp_envios (
        empresa_id, tipo_alerta, destinatario_tipo, destinatario_user_id, personal_id, personal_tipo,
        telefono, plantilla_id, proveedor_template, variables, referencia_tipo, referencia_id,
        estado, proveedor
      ) values (
        new.empresa_id, v_tipo_alerta, 'colaborador', v_personal.auth_user_id, v_personal.id, v_personal.personal_tipo,
        v_tel, v_tpl.id, v_tpl.proveedor_template, v_vars, new.referencia_tipo, new.referencia_id,
        case when coalesce(v_cfg.whatsapp_provider, 'simulado') = 'simulado' then 'simulado' else 'encolado' end,
        coalesce(v_cfg.whatsapp_provider, 'simulado')
      )
      on conflict do nothing;
    end if;
  end if;

  if coalesce(v_matriz.enviar_rrhh, false) or coalesce(v_matriz.enviar_admin, false) then
    insert into public.whatsapp_envios (
      empresa_id, tipo_alerta, destinatario_tipo, destinatario_user_id, telefono, plantilla_id,
      proveedor_template, variables, referencia_tipo, referencia_id, estado, proveedor
    )
    select
      new.empresa_id, v_tipo_alerta,
      case when coalesce(r.es_admin_empresa, false) then 'admin' else 'rrhh' end,
      ue.user_id,
      regexp_replace(coalesce(u.telefono, ''), '[^0-9+]', '', 'g'),
      v_tpl.id, v_tpl.proveedor_template, v_vars, new.referencia_tipo, new.referencia_id,
      case when coalesce(v_cfg.whatsapp_provider, 'simulado') = 'simulado' then 'simulado' else 'encolado' end,
      coalesce(v_cfg.whatsapp_provider, 'simulado')
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    left join public.usuarios u on u.id = ue.user_id::text
    where ue.empresa_id = new.empresa_id
      and ue.estado = 'activo'
      and regexp_replace(coalesce(u.telefono, ''), '[^0-9+]', '', 'g') <> ''
      and (
        (coalesce(v_matriz.enviar_admin, false) and coalesce(r.es_admin_empresa, false))
        or
        (coalesce(v_matriz.enviar_rrhh, false) and lower(coalesce(r.nombre, r.id::text)) like '%rrhh%')
      )
    on conflict do nothing;
  end if;

  return new;
end;
$$;
