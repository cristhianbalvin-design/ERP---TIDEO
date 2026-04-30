-- TIDEO ERP - Permisos por rol para dominios no financieros.
-- Reemplaza policies tenant genericas por checks de tenant + pantalla + accion.

-- CRM y comercial
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

-- Operaciones
drop policy if exists tenant_os_clientes on public.os_clientes;
drop policy if exists ops_os_clientes_select on public.os_clientes;
drop policy if exists ops_os_clientes_insert on public.os_clientes;
drop policy if exists ops_os_clientes_update on public.os_clientes;
create policy ops_os_clientes_select on public.os_clientes for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'ver'));
create policy ops_os_clientes_insert on public.os_clientes for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'crear'));
create policy ops_os_clientes_update on public.os_clientes for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'editar'));

-- Auditoria basica en base de datos para CRM + comercial.
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

drop policy if exists tenant_backlog on public.backlog;
create policy ops_backlog_select on public.backlog for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'backlog', 'ver'));
create policy ops_backlog_insert on public.backlog for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'backlog', 'crear'));
create policy ops_backlog_update on public.backlog for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'backlog', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'backlog', 'editar'));

drop policy if exists tenant_ordenes_trabajo on public.ordenes_trabajo;
create policy ops_ot_select on public.ordenes_trabajo for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'ver'));
create policy ops_ot_insert on public.ordenes_trabajo for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'crear'));
create policy ops_ot_update on public.ordenes_trabajo for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar'));

drop policy if exists tenant_partes_diarios on public.partes_diarios;
create policy ops_partes_select on public.partes_diarios for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'partes', 'ver'));
create policy ops_partes_insert on public.partes_diarios for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'partes', 'crear'));
create policy ops_partes_update on public.partes_diarios for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'partes', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'partes', 'editar'));

drop policy if exists tenant_cierres_tecnicos on public.cierres_tecnicos;
create policy ops_cierres_select on public.cierres_tecnicos for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cierres_calidad', 'ver'));
create policy ops_cierres_insert on public.cierres_tecnicos for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cierres_calidad', 'crear'));
create policy ops_cierres_update on public.cierres_tecnicos for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cierres_calidad', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cierres_calidad', 'editar'));

drop policy if exists tenant_costos_ot on public.costos_ot;
create policy ops_costos_ot_select on public.costos_ot for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'ver_costos'));
create policy ops_costos_ot_insert on public.costos_ot for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar'));
create policy ops_costos_ot_update on public.costos_ot for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar'));

drop policy if exists tenant_tickets_soporte on public.tickets_soporte;
create policy ops_tickets_select on public.tickets_soporte for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tickets', 'ver'));
create policy ops_tickets_insert on public.tickets_soporte for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tickets', 'crear'));
create policy ops_tickets_update on public.tickets_soporte for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tickets', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tickets', 'editar'));

-- Compras e inventario
drop policy if exists tenant_proveedores on public.proveedores;
create policy pur_proveedores_select on public.proveedores for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'ver'));
create policy pur_proveedores_insert on public.proveedores for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'crear'));
create policy pur_proveedores_update on public.proveedores for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'editar'));

drop policy if exists tenant_documentos_proveedor on public.documentos_proveedor;
create policy pur_docs_proveedor_select on public.documentos_proveedor for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'ver'));
create policy pur_docs_proveedor_insert on public.documentos_proveedor for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'crear'));
create policy pur_docs_proveedor_update on public.documentos_proveedor for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'editar'));

drop policy if exists tenant_evaluaciones_proveedor on public.evaluaciones_proveedor;
create policy pur_eval_proveedor_select on public.evaluaciones_proveedor for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'ver'));
create policy pur_eval_proveedor_insert on public.evaluaciones_proveedor for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'crear'));

drop policy if exists tenant_solpe_interna on public.solpe_interna;
create policy pur_solpe_select on public.solpe_interna for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'solpe', 'ver'));
create policy pur_solpe_insert on public.solpe_interna for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'solpe', 'crear'));
create policy pur_solpe_update on public.solpe_interna for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'solpe', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'solpe', 'editar'));

drop policy if exists tenant_procesos_compra on public.procesos_compra;
create policy pur_procesos_select on public.procesos_compra for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones_compra', 'ver'));
create policy pur_procesos_insert on public.procesos_compra for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones_compra', 'crear'));
create policy pur_procesos_update on public.procesos_compra for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones_compra', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones_compra', 'editar'));

drop policy if exists tenant_ordenes_compra on public.ordenes_compra;
create policy pur_oc_select on public.ordenes_compra for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_compra', 'ver'));
create policy pur_oc_insert on public.ordenes_compra for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_compra', 'crear'));
create policy pur_oc_update on public.ordenes_compra for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar'));

drop policy if exists tenant_ordenes_servicio_interna on public.ordenes_servicio_interna;
create policy pur_osi_select on public.ordenes_servicio_interna for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_servicio', 'ver'));
create policy pur_osi_insert on public.ordenes_servicio_interna for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_servicio', 'crear'));
create policy pur_osi_update on public.ordenes_servicio_interna for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_servicio', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_servicio', 'editar'));

drop policy if exists tenant_recepciones on public.recepciones;
create policy pur_recepciones_select on public.recepciones for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'recepciones', 'ver'));
create policy pur_recepciones_insert on public.recepciones for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'recepciones', 'crear'));
create policy pur_recepciones_update on public.recepciones for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'recepciones', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'recepciones', 'editar'));

drop policy if exists tenant_almacenes on public.almacenes;
create policy inv_almacenes_all on public.almacenes for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'editar'));
drop policy if exists tenant_materiales on public.materiales;
create policy inv_materiales_all on public.materiales for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'editar'));
drop policy if exists tenant_stock on public.stock;
create policy inv_stock_all on public.stock for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'editar'));
drop policy if exists tenant_kardex on public.kardex;
create policy inv_kardex_select on public.kardex for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'ver'));
create policy inv_kardex_insert on public.kardex for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'editar'));

-- RRHH
drop policy if exists tenant_personal_operativo on public.personal_operativo;
create policy hr_operativo_all on public.personal_operativo for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'personal_operativo', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'personal_operativo', 'editar'));
drop policy if exists tenant_personal_administrativo on public.personal_administrativo;
create policy hr_admin_all on public.personal_administrativo for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'personal_administrativo', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'personal_administrativo', 'editar'));
drop policy if exists tenant_turnos on public.turnos;
create policy hr_turnos_all on public.turnos for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'turnos', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'turnos', 'editar'));
drop policy if exists tenant_registros_asistencia on public.registros_asistencia;
create policy hr_asistencia_all on public.registros_asistencia for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'asistencia', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'asistencia', 'editar'));
drop policy if exists tenant_periodos_nomina on public.periodos_nomina;
create policy hr_nomina_all on public.periodos_nomina for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nomina', 'ver_finanzas')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nomina', 'editar'));
drop policy if exists tenant_detalle_nomina on public.detalle_nomina;
create policy hr_detalle_nomina_all on public.detalle_nomina for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nomina', 'ver_finanzas')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nomina', 'editar'));
drop policy if exists tenant_prestamos_personal on public.prestamos_personal;
create policy hr_prestamos_personal_all on public.prestamos_personal for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'prestamos_personal', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'prestamos_personal', 'editar'));

-- Customer Success e IA
drop policy if exists tenant_onboardings on public.onboardings;
create policy cs_onboardings_all on public.onboardings for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'onboarding', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'onboarding', 'editar'));
drop policy if exists tenant_planes_exito on public.planes_exito;
create policy cs_planes_all on public.planes_exito for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'planes_exito', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'planes_exito', 'editar'));
drop policy if exists tenant_health_scores on public.health_scores;
create policy cs_health_all on public.health_scores for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'health_score', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'health_score', 'editar'));
drop policy if exists tenant_renovaciones on public.renovaciones;
create policy cs_renovaciones_all on public.renovaciones for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'renovaciones', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'renovaciones', 'editar'));
drop policy if exists tenant_nps_encuestas on public.nps_encuestas;
create policy cs_nps_all on public.nps_encuestas for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nps', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nps', 'editar'));

drop policy if exists tenant_ia_logs on public.ia_logs;
create policy ia_logs_select on public.ia_logs for select using (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'ia_comercial', 'ver') or public.usuario_puede(empresa_id, 'ia_operativa', 'ver') or public.usuario_puede(empresa_id, 'ia_financiera', 'ver')));
create policy ia_logs_insert on public.ia_logs for insert with check (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'ia_comercial', 'crear') or public.usuario_puede(empresa_id, 'ia_operativa', 'crear') or public.usuario_puede(empresa_id, 'ia_financiera', 'crear')));
