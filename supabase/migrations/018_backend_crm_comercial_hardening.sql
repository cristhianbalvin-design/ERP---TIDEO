-- TIDEO ERP - Cierre backend CRM + Comercial
-- Ejecutar en proyectos existentes despues de 017_actividades_comerciales.sql.
-- Endurece RLS por permisos y agrega auditoria basica DB para los flujos beta.

-- ============================================================
-- RLS por permiso: CRM
-- ============================================================

create or replace function public.usuario_puede(target_empresa_id text, target_pantalla text, target_accion text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and (r.es_admin_empresa = true or r.es_superadmin = true)
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.permisos_roles pr on pr.rol_id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and pr.pantalla = target_pantalla
      and (
        case target_accion
          when 'ver' then pr.puede_ver
          when 'crear' then pr.puede_crear
          when 'editar' then pr.puede_editar
          when 'anular' then pr.puede_anular
          when 'aprobar' then pr.puede_aprobar
          when 'exportar' then pr.puede_exportar
          when 'ver_costos' then pr.puede_ver_costos
          when 'ver_finanzas' then pr.puede_ver_finanzas
          else false
        end
      )
  );
$$;

alter table public.cuentas enable row level security;
alter table public.contactos enable row level security;
alter table public.leads enable row level security;
alter table public.oportunidades enable row level security;
alter table public.agenda_comercial enable row level security;
alter table public.actividades_comerciales enable row level security;
alter table public.hojas_costeo enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.os_clientes enable row level security;

drop policy if exists tenant_cuentas on public.cuentas;
drop policy if exists crm_cuentas_select on public.cuentas;
drop policy if exists crm_cuentas_insert on public.cuentas;
drop policy if exists crm_cuentas_update on public.cuentas;
create policy crm_cuentas_select on public.cuentas for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'ver'));
create policy crm_cuentas_insert on public.cuentas for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'crear'));
create policy crm_cuentas_update on public.cuentas for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'editar'));

drop policy if exists tenant_contactos on public.contactos;
drop policy if exists crm_contactos_select on public.contactos;
drop policy if exists crm_contactos_insert on public.contactos;
drop policy if exists crm_contactos_update on public.contactos;
create policy crm_contactos_select on public.contactos for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'ver'));
create policy crm_contactos_insert on public.contactos for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'crear'));
create policy crm_contactos_update on public.contactos for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'editar'));

drop policy if exists tenant_leads on public.leads;
drop policy if exists crm_leads_select on public.leads;
drop policy if exists crm_leads_insert on public.leads;
drop policy if exists crm_leads_update on public.leads;
create policy crm_leads_select on public.leads for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'leads', 'ver'));
create policy crm_leads_insert on public.leads for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'leads', 'crear'));
create policy crm_leads_update on public.leads for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'leads', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'leads', 'editar'));

drop policy if exists tenant_oportunidades on public.oportunidades;
drop policy if exists crm_oportunidades_select on public.oportunidades;
drop policy if exists crm_oportunidades_insert on public.oportunidades;
drop policy if exists crm_oportunidades_update on public.oportunidades;
create policy crm_oportunidades_select on public.oportunidades for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pipeline', 'ver'));
create policy crm_oportunidades_insert on public.oportunidades for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pipeline', 'crear'));
create policy crm_oportunidades_update on public.oportunidades for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pipeline', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pipeline', 'editar'));

drop policy if exists tenant_agenda_comercial on public.agenda_comercial;
drop policy if exists agenda_comercial_select on public.agenda_comercial;
drop policy if exists agenda_comercial_insert on public.agenda_comercial;
drop policy if exists agenda_comercial_update on public.agenda_comercial;
drop policy if exists crm_agenda_select on public.agenda_comercial;
drop policy if exists crm_agenda_insert on public.agenda_comercial;
drop policy if exists crm_agenda_update on public.agenda_comercial;
create policy crm_agenda_select on public.agenda_comercial for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'agenda_comercial', 'ver'));
create policy crm_agenda_insert on public.agenda_comercial for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'agenda_comercial', 'crear'));
create policy crm_agenda_update on public.agenda_comercial for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'agenda_comercial', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'agenda_comercial', 'editar'));

drop policy if exists tenant_actividades_comerciales on public.actividades_comerciales;
drop policy if exists actividades_comerciales_select on public.actividades_comerciales;
drop policy if exists actividades_comerciales_insert on public.actividades_comerciales;
drop policy if exists actividades_comerciales_update on public.actividades_comerciales;
drop policy if exists crm_actividades_select on public.actividades_comerciales;
drop policy if exists crm_actividades_insert on public.actividades_comerciales;
drop policy if exists crm_actividades_update on public.actividades_comerciales;
create policy crm_actividades_select on public.actividades_comerciales for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actividades', 'ver'));
create policy crm_actividades_insert on public.actividades_comerciales for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actividades', 'crear'));
create policy crm_actividades_update on public.actividades_comerciales for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actividades', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actividades', 'editar'));

-- ============================================================
-- RLS por permiso: Comercial
-- ============================================================

drop policy if exists tenant_hojas_costeo on public.hojas_costeo;
drop policy if exists crm_hojas_costeo_select on public.hojas_costeo;
drop policy if exists crm_hojas_costeo_insert on public.hojas_costeo;
drop policy if exists crm_hojas_costeo_update on public.hojas_costeo;
create policy crm_hojas_costeo_select on public.hojas_costeo for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'hoja_costeo', 'ver'));
create policy crm_hojas_costeo_insert on public.hojas_costeo for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'hoja_costeo', 'crear'));
create policy crm_hojas_costeo_update on public.hojas_costeo for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'hoja_costeo', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'hoja_costeo', 'editar'));

drop policy if exists tenant_cotizaciones on public.cotizaciones;
drop policy if exists crm_cotizaciones_select on public.cotizaciones;
drop policy if exists crm_cotizaciones_insert on public.cotizaciones;
drop policy if exists crm_cotizaciones_update on public.cotizaciones;
create policy crm_cotizaciones_select on public.cotizaciones for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones', 'ver'));
create policy crm_cotizaciones_insert on public.cotizaciones for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones', 'crear'));
create policy crm_cotizaciones_update on public.cotizaciones for update using (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'cotizaciones', 'editar') or public.usuario_puede(empresa_id, 'cotizaciones', 'aprobar'))) with check (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'cotizaciones', 'editar') or public.usuario_puede(empresa_id, 'cotizaciones', 'aprobar')));

drop policy if exists tenant_os_clientes on public.os_clientes;
drop policy if exists ops_os_clientes_select on public.os_clientes;
drop policy if exists ops_os_clientes_insert on public.os_clientes;
drop policy if exists ops_os_clientes_update on public.os_clientes;
create policy ops_os_clientes_select on public.os_clientes for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'ver'));
create policy ops_os_clientes_insert on public.os_clientes for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'crear'));
create policy ops_os_clientes_update on public.os_clientes for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'editar'));

-- ============================================================
-- Auditoria basica DB
-- ============================================================

create or replace function public.audit_crm_comercial_basico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_empresa_id text;
  v_entidad_id text;
  v_modulo text;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  else
    return coalesce(NEW, OLD);
  end if;

  v_empresa_id := coalesce(v_new ->> 'empresa_id', v_old ->> 'empresa_id');
  v_entidad_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_modulo := case
    when TG_TABLE_NAME in ('cuentas','contactos','leads','oportunidades','agenda_comercial','actividades_comerciales') then 'crm'
    else 'comercial'
  end;

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_anterior, valor_nuevo
  )
  values (
    v_empresa_id, auth.uid(), v_modulo, TG_TABLE_NAME, v_entidad_id,
    lower(TG_OP), v_old, v_new
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_cuentas_basico on public.cuentas;
create trigger audit_cuentas_basico after insert or update on public.cuentas
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_contactos_basico on public.contactos;
create trigger audit_contactos_basico after insert or update on public.contactos
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_leads_basico on public.leads;
create trigger audit_leads_basico after insert or update on public.leads
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_oportunidades_basico on public.oportunidades;
create trigger audit_oportunidades_basico after insert or update on public.oportunidades
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_agenda_comercial_basico on public.agenda_comercial;
create trigger audit_agenda_comercial_basico after insert or update on public.agenda_comercial
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_actividades_comerciales_basico on public.actividades_comerciales;
create trigger audit_actividades_comerciales_basico after insert or update on public.actividades_comerciales
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_hojas_costeo_basico on public.hojas_costeo;
create trigger audit_hojas_costeo_basico after insert or update on public.hojas_costeo
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_cotizaciones_basico on public.cotizaciones;
create trigger audit_cotizaciones_basico after insert or update on public.cotizaciones
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_os_clientes_basico on public.os_clientes;
create trigger audit_os_clientes_basico after insert or update on public.os_clientes
  for each row execute function public.audit_crm_comercial_basico();
