-- TIDEO ERP - Minimos backend para deploy beta controlado
-- Ejecutar en proyectos existentes despues de 023_rpc_crear_hoja_costeo.sql.
-- Cierra RLS por permisos en modulos fuera de CRM/Comercial, auditoria DB
-- transversal y aprueba HC -> Cotizacion en una transaccion backend.

-- ============================================================
-- Permisos admin por pantalla
-- ============================================================

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, x.pantalla, true, true, true, false, true, true, true, true
from public.roles r
cross join (
  values
    ('backlog'), ('ot'), ('partes'), ('cierre'), ('valorizacion'),
    ('proveedores'), ('solpe'), ('cot_compras'), ('ordenes_compra'),
    ('ordenes_servicio'), ('recepciones'), ('inventario'),
    ('facturacion'), ('cxc'), ('cxp'), ('tesoreria'), ('resultados'),
    ('financiamiento'), ('ventas'), ('caja'),
    ('rrhh_operativo'), ('rrhh_admin'), ('turnos'), ('asistencia'),
    ('nomina'), ('prestamos_personal'),
    ('maestros'), ('servicios'), ('tarifarios'), ('parametros'),
    ('cs_onboarding'), ('cs_planes'), ('cs_health'), ('cs_renovaciones'),
    ('cs_fidelizacion'), ('bi_cs'),
    ('ia_comercial'), ('ia_operativa'), ('ia_financiera')
) as x(pantalla)
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true,
  puede_crear = true,
  puede_editar = true,
  puede_aprobar = true,
  puede_exportar = true,
  puede_ver_costos = true,
  puede_ver_finanzas = true;

-- ============================================================
-- Helper RLS por pantalla
-- ============================================================

create or replace function public.aplicar_rls_pantalla(
  p_table text,
  p_policy_prefix text,
  p_pantalla text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_table regclass;
  v_table_name text;
begin
  v_table := to_regclass(p_table);
  if v_table is null then
    raise notice 'Tabla % no existe, se omite RLS.', p_table;
    return;
  end if;

  v_table_name := coalesce(nullif(split_part(v_table::text, '.', 2), ''), v_table::text);

  execute format('alter table %s enable row level security', v_table);

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = v_table_name
  loop
    execute format('drop policy if exists %I on %s', p.policyname, v_table);
  end loop;

  execute format(
    'create policy %I on %s for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, %L, %L))',
    p_policy_prefix || '_select', v_table, p_pantalla, 'ver'
  );

  execute format(
    'create policy %I on %s for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, %L, %L))',
    p_policy_prefix || '_insert', v_table, p_pantalla, 'crear'
  );

  execute format(
    'create policy %I on %s for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, %L, %L)) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, %L, %L))',
    p_policy_prefix || '_update', v_table, p_pantalla, 'editar', p_pantalla, 'editar'
  );
end;
$$;

select public.aplicar_rls_pantalla('public.backlog', 'ops_backlog', 'backlog');
select public.aplicar_rls_pantalla('public.ordenes_trabajo', 'ops_ot', 'ot');
select public.aplicar_rls_pantalla('public.partes_diarios', 'ops_partes', 'partes');
select public.aplicar_rls_pantalla('public.cierres_tecnicos', 'ops_cierre', 'cierre');

select public.aplicar_rls_pantalla('public.proveedores', 'com_proveedores', 'proveedores');
select public.aplicar_rls_pantalla('public.documentos_proveedor', 'com_docs_proveedor', 'proveedores');
select public.aplicar_rls_pantalla('public.evaluaciones_proveedor', 'com_evals_proveedor', 'proveedores');
select public.aplicar_rls_pantalla('public.solpe_interna', 'com_solpe', 'solpe');
select public.aplicar_rls_pantalla('public.procesos_compra', 'com_procesos', 'cot_compras');
select public.aplicar_rls_pantalla('public.ordenes_compra', 'com_oc', 'ordenes_compra');
select public.aplicar_rls_pantalla('public.ordenes_servicio_interna', 'com_osi', 'ordenes_servicio');
select public.aplicar_rls_pantalla('public.recepciones', 'com_recepciones', 'recepciones');
select public.aplicar_rls_pantalla('public.almacenes', 'log_almacenes', 'inventario');
select public.aplicar_rls_pantalla('public.materiales', 'log_materiales', 'inventario');
select public.aplicar_rls_pantalla('public.stock', 'log_stock', 'inventario');
select public.aplicar_rls_pantalla('public.kardex', 'log_kardex', 'inventario');

select public.aplicar_rls_pantalla('public.valorizaciones', 'fin_valorizaciones', 'valorizacion');
select public.aplicar_rls_pantalla('public.facturas', 'fin_facturas', 'facturacion');
select public.aplicar_rls_pantalla('public.cxc', 'fin_cxc', 'cxc');
select public.aplicar_rls_pantalla('public.cxp', 'fin_cxp', 'cxp');
select public.aplicar_rls_pantalla('public.movimientos_banco', 'fin_mov_banco', 'tesoreria');
select public.aplicar_rls_pantalla('public.movimientos_tesoreria', 'fin_mov_tesoreria', 'tesoreria');
select public.aplicar_rls_pantalla('public.compras_gastos', 'fin_gastos', 'caja');
select public.aplicar_rls_pantalla('public.financiamientos', 'fin_deuda', 'financiamiento');
select public.aplicar_rls_pantalla('public.tabla_amortizacion', 'fin_amortizacion', 'financiamiento');
select public.aplicar_rls_pantalla('public.pagos_financiamiento', 'fin_pagos_deuda', 'financiamiento');

select public.aplicar_rls_pantalla('public.personal_operativo', 'rrhh_operativo', 'rrhh_operativo');
select public.aplicar_rls_pantalla('public.personal_administrativo', 'rrhh_admin', 'rrhh_admin');
select public.aplicar_rls_pantalla('public.turnos', 'rrhh_turnos', 'turnos');
select public.aplicar_rls_pantalla('public.registros_asistencia', 'rrhh_asistencia', 'asistencia');
select public.aplicar_rls_pantalla('public.periodos_nomina', 'rrhh_nomina', 'nomina');
select public.aplicar_rls_pantalla('public.detalle_nomina', 'rrhh_detalle_nomina', 'nomina');
select public.aplicar_rls_pantalla('public.prestamos_personal', 'rrhh_prestamos', 'prestamos_personal');

select public.aplicar_rls_pantalla('public.onboardings', 'cs_onboardings', 'cs_onboarding');
select public.aplicar_rls_pantalla('public.planes_exito', 'cs_planes', 'cs_planes');
select public.aplicar_rls_pantalla('public.health_scores', 'cs_health', 'cs_health');
select public.aplicar_rls_pantalla('public.renovaciones', 'cs_renovaciones', 'cs_renovaciones');
select public.aplicar_rls_pantalla('public.nps_encuestas', 'cs_nps', 'cs_fidelizacion');
select public.aplicar_rls_pantalla('public.ia_logs', 'ia_logs', 'ia_comercial');

select public.aplicar_rls_pantalla('public.cargos_empresa', 'mst_cargos', 'maestros');
select public.aplicar_rls_pantalla('public.especialidades_tecnicas', 'mst_especialidades', 'maestros');
select public.aplicar_rls_pantalla('public.tipos_servicio_interno', 'mst_tipos_servicio', 'maestros');
select public.aplicar_rls_pantalla('public.sedes', 'mst_sedes', 'maestros');

drop function if exists public.aplicar_rls_pantalla(text, text, text);

-- ============================================================
-- Auditoria transversal
-- ============================================================

create or replace function public.audit_backend_minimo()
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

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_anterior, valor_nuevo
  )
  values (
    v_empresa_id, auth.uid(), 'backend_beta', TG_TABLE_NAME, v_entidad_id,
    lower(TG_OP), v_old, v_new
  );

  return coalesce(NEW, OLD);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'backlog','ordenes_trabajo','partes_diarios','cierres_tecnicos',
    'proveedores','evaluaciones_proveedor','solpe_interna','procesos_compra',
    'ordenes_compra','ordenes_servicio_interna','recepciones','stock','kardex',
    'valorizaciones','facturas','cxc','cxp','movimientos_banco','movimientos_tesoreria',
    'compras_gastos','financiamientos','pagos_financiamiento',
    'personal_operativo','personal_administrativo','turnos','registros_asistencia',
    'periodos_nomina','detalle_nomina','prestamos_personal',
    'onboardings','planes_exito','health_scores','renovaciones','nps_encuestas','ia_logs',
    'cargos_empresa','especialidades_tecnicas','tipos_servicio_interno','sedes'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabla public.% no existe, se omite auditoria.', t;
      continue;
    end if;
    execute format('drop trigger if exists audit_backend_minimo_%I on public.%I', t, t);
    execute format(
      'create trigger audit_backend_minimo_%I after insert or update on public.%I for each row execute function public.audit_backend_minimo()',
      t, t
    );
  end loop;
end;
$$;

-- ============================================================
-- RPC: aprobar Hoja de Costeo y generar Cotizacion atomica
-- ============================================================

create or replace function public.aprobar_hoja_costeo_y_crear_cotizacion(
  p_empresa_id text,
  p_hoja_costeo_id text,
  p_cotizacion_id text,
  p_numero text,
  p_moneda text default 'PEN',
  p_validez text default '30 dias'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
  v_items jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not (
    public.usuario_puede(p_empresa_id, 'hoja_costeo', 'aprobar')
    or public.usuario_puede(p_empresa_id, 'cotizaciones', 'crear')
  ) then
    raise exception 'No tienes permiso para aprobar hojas de costeo.';
  end if;

  select * into v_hc
  from public.hojas_costeo
  where id = p_hoja_costeo_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'Hoja de Costeo no encontrada.';
  end if;

  if v_hc.estado = 'aprobada' and v_hc.cotizacion_id is not null then
    select * into v_cot from public.cotizaciones where id = v_hc.cotizacion_id;
    return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
  end if;

  v_items := coalesce(v_hc.mano_obra, '[]'::jsonb)
    || coalesce(v_hc.materiales, '[]'::jsonb)
    || coalesce(v_hc.servicios_terceros, '[]'::jsonb)
    || coalesce(v_hc.logistica, '[]'::jsonb);

  insert into public.cotizaciones (
    id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha,
    items, subtotal, descuento_global_pct, descuento_global, base_imponible,
    igv_pct, igv, total, moneda, condicion_pago, hoja_costeo_id
  )
  values (
    p_cotizacion_id, p_empresa_id, v_hc.oportunidad_id, v_hc.cuenta_id,
    p_numero, 1, 'borrador', current_date,
    v_items, coalesce(v_hc.precio_sugerido_sin_igv, 0), 0, 0,
    coalesce(v_hc.precio_sugerido_sin_igv, 0), 18,
    round(coalesce(v_hc.precio_sugerido_sin_igv, 0) * 0.18),
    coalesce(v_hc.precio_sugerido_total, 0),
    coalesce(p_moneda, 'PEN'), p_validez, p_hoja_costeo_id
  )
  returning * into v_cot;

  update public.hojas_costeo
  set estado = 'aprobada',
      cotizacion_id = p_cotizacion_id,
      updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;

  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(
  text, text, text, text, text, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');
