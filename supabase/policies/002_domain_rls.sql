-- TIDEO ERP - Politicas RLS por tenant para dominios restantes.

alter table public.backlog enable row level security;
alter table public.ordenes_trabajo enable row level security;
alter table public.partes_diarios enable row level security;
alter table public.cierres_tecnicos enable row level security;
alter table public.costos_ot enable row level security;
alter table public.tickets_soporte enable row level security;

alter table public.almacenes enable row level security;
alter table public.materiales enable row level security;
alter table public.stock enable row level security;
alter table public.kardex enable row level security;
alter table public.proveedores enable row level security;
alter table public.documentos_proveedor enable row level security;
alter table public.evaluaciones_proveedor enable row level security;
alter table public.solpe_interna enable row level security;
alter table public.procesos_compra enable row level security;
alter table public.ordenes_compra enable row level security;
alter table public.ordenes_servicio_interna enable row level security;
alter table public.recepciones enable row level security;

alter table public.valorizaciones enable row level security;
alter table public.facturas enable row level security;
alter table public.cxc enable row level security;
alter table public.cxp enable row level security;
alter table public.movimientos_banco enable row level security;

alter table public.personal_operativo enable row level security;
alter table public.personal_administrativo enable row level security;
alter table public.turnos enable row level security;
alter table public.registros_asistencia enable row level security;
alter table public.periodos_nomina enable row level security;
alter table public.detalle_nomina enable row level security;
alter table public.prestamos_personal enable row level security;

alter table public.onboardings enable row level security;
alter table public.planes_exito enable row level security;
alter table public.health_scores enable row level security;
alter table public.renovaciones enable row level security;
alter table public.nps_encuestas enable row level security;
alter table public.ia_logs enable row level security;
alter table public.agenda_comercial enable row level security;
alter table public.actividades_comerciales enable row level security;

alter table public.cargos_empresa enable row level security;
alter table public.especialidades_tecnicas enable row level security;
alter table public.tipos_servicio_interno enable row level security;
alter table public.sedes enable row level security;

create policy tenant_backlog on public.backlog for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_ordenes_trabajo on public.ordenes_trabajo for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_partes_diarios on public.partes_diarios for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_cierres_tecnicos on public.cierres_tecnicos for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_costos_ot on public.costos_ot for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_tickets_soporte on public.tickets_soporte for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_almacenes on public.almacenes for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_materiales on public.materiales for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_stock on public.stock for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_kardex on public.kardex for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_proveedores on public.proveedores for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_documentos_proveedor on public.documentos_proveedor for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_evaluaciones_proveedor on public.evaluaciones_proveedor for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_solpe_interna on public.solpe_interna for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_procesos_compra on public.procesos_compra for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_ordenes_compra on public.ordenes_compra for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_ordenes_servicio_interna on public.ordenes_servicio_interna for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_recepciones on public.recepciones for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_valorizaciones on public.valorizaciones for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_facturas on public.facturas for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_cxc on public.cxc for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_cxp on public.cxp for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_movimientos_banco on public.movimientos_banco for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_personal_operativo on public.personal_operativo for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_personal_administrativo on public.personal_administrativo for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_turnos on public.turnos for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_registros_asistencia on public.registros_asistencia for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_periodos_nomina on public.periodos_nomina for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_detalle_nomina on public.detalle_nomina for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_prestamos_personal on public.prestamos_personal for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_onboardings on public.onboardings for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_planes_exito on public.planes_exito for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_health_scores on public.health_scores for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_renovaciones on public.renovaciones for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_nps_encuestas on public.nps_encuestas for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_ia_logs on public.ia_logs for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_cargos_empresa on public.cargos_empresa for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_especialidades_tecnicas on public.especialidades_tecnicas for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_tipos_servicio_interno on public.tipos_servicio_interno for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_sedes on public.sedes for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
