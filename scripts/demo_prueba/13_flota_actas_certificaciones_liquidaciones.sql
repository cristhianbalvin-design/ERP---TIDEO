-- Demo PRUEBA · 13 Flota: catálogos, actas de despacho/retorno, certificaciones, garantías y liquidaciones (2026-11-08)
-- Los catálogos y las liquidaciones se crean con las funciones oficiales del módulo, actuando como el usuario
-- de prueba "Compras PRUEBA" (admin de PRUEBA). Actas y movimientos se insertan directo (sin firmas ni fotos).
do $$
declare
  v_emp constant text := 'emp_2000000000';
  v_usr constant uuid := 'ae6bc722-85c7-4816-a830-c350d2a3d0b5';
  v_check jsonb;
  r record;
  v_acta uuid;
  v_sal uuid;
  v_n int := 0;
  v_liq uuid;
  v_res jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);

  -- 1. Catálogos sugeridos del módulo
  perform public.flota_cargar_catalogo_sugerido(v_emp, 'certificaciones');
  perform public.flota_cargar_catalogo_sugerido(v_emp, 'garantias');
  perform public.flota_cargar_catalogo_sugerido(v_emp, 'checklist');

  select coalesce(jsonb_agg(jsonb_build_object('texto', texto, 'ok', true, 'observacion', null) order by orden), '[]'::jsonb)
    into v_check from flota_checklist_items where empresa_id = v_emp and tipo_acta in ('despacho', 'ambos') and activo;

  -- 2. Actas de despacho confirmadas (y retorno del contrato vencido) con su movimiento de equipo
  delete from movimientos_equipo_rental where empresa_id = v_emp;
  delete from actas_rental where empresa_id = v_emp;
  for r in
    select c.id contrato_id, c.numero, c.sociedad_id, c.fecha_inicio, c.fecha_fin, c.estado, e.id ce_id, a.id activo_id,
           a.codigo, coalesce(a.horometro_actual, 4000) horo, cu.nombre_comercial cliente
    from contratos_alquiler c
    join contratos_alquiler_equipos e on e.contrato_alquiler_id = c.id
    join activos a on a.id = e.equipo_id
    left join cuentas cu on cu.id = c.cuenta_id
    where c.empresa_id = v_emp order by c.fecha_inicio, a.codigo
  loop
    v_n := v_n + 1;
    insert into actas_rental (empresa_id, sociedad_id, numero, tipo, contrato_alquiler_id, contrato_equipo_id, activo_id,
      fecha_movimiento, horometro, ubicacion_destino, checklist, observaciones, guia_no_requerida_motivo, estado,
      requisitos_snapshot, confirmada_at, confirmada_por, created_by, created_at, updated_at)
    values (v_emp, r.sociedad_id, 'DES-2026-' || lpad(v_n::text, 4, '0'), 'despacho', r.contrato_id, r.ce_id, r.activo_id,
      r.fecha_inicio + time '14:00', greatest(r.horo - 900, 0), 'Operación de ' || coalesce(r.cliente, 'cliente'),
      v_check, 'Equipo entregado operativo, con tanque lleno y kit de herramientas.', 'Traslado en cama baja propia; guía emitida por transporte',
      'confirmada', '[]'::jsonb, r.fecha_inicio + time '15:30', v_usr, v_usr, r.fecha_inicio + time '13:00', r.fecha_inicio + time '15:30')
    returning id into v_acta;
    insert into movimientos_equipo_rental (empresa_id, sociedad_id, activo_id, contrato_alquiler_id, contrato_equipo_id, acta_id,
      tipo, fecha, horometro, abierto, created_at)
    values (v_emp, r.sociedad_id, r.activo_id, r.contrato_id, r.ce_id, v_acta, 'salida', r.fecha_inicio + time '14:00',
      greatest(r.horo - 900, 0), r.estado = 'vigente', r.fecha_inicio + time '15:30')
    returning id into v_sal;

    if r.estado <> 'vigente' then
      insert into actas_rental (empresa_id, sociedad_id, numero, tipo, contrato_alquiler_id, contrato_equipo_id, activo_id,
        fecha_movimiento, horometro, ubicacion_destino, checklist, observaciones, guia_no_requerida_motivo, estado,
        requisitos_snapshot, confirmada_at, confirmada_por, created_by, created_at, updated_at)
      values (v_emp, r.sociedad_id, 'RET-2026-0001', 'retorno', r.contrato_id, r.ce_id, r.activo_id,
        r.fecha_fin + time '16:00', r.horo, 'Taller Ate', v_check,
        'Retorno al término del contrato; desgaste normal de uñas del cucharón.', 'Retorno con transporte propio',
        'confirmada', '[]'::jsonb, r.fecha_fin + time '17:00', v_usr, v_usr, r.fecha_fin + time '16:00', r.fecha_fin + time '17:00')
      returning id into v_acta;
      insert into movimientos_equipo_rental (empresa_id, sociedad_id, activo_id, contrato_alquiler_id, contrato_equipo_id, acta_id,
        tipo, fecha, horometro, salida_id, abierto, created_at)
      values (v_emp, r.sociedad_id, r.activo_id, r.contrato_id, r.ce_id, v_acta, 'retorno', r.fecha_fin + time '16:00', r.horo,
        v_sal, false, r.fecha_fin + time '17:00');
    end if;
  end loop;

  -- 3. Certificaciones vigentes de los equipos en alquiler (una por vencer para mostrar la alerta)
  delete from activo_certificaciones where empresa_id = v_emp;
  insert into activo_certificaciones (empresa_id, activo_id, tipo_id, numero, emisor, fecha_emision, fecha_vencimiento,
    obligatoria, notas, estado, created_by, created_at, updated_at)
  select v_emp, a.id, t.id,
    case when t.nombre = 'Seguridad minera' then 'SM-' else 'RT-' end || a.codigo || '-2026',
    case when t.nombre = 'Seguridad minera' then 'SGS del Perú' else 'Centro de Inspección Técnica Lima' end,
    date '2026-03-10' + (row_number() over (order by a.codigo, t.nombre))::int * 3,
    case when a.codigo = 'CF-02' and t.nombre = 'Revisión técnica' then date '2026-11-20'
         else date '2027-03-10' + (row_number() over (order by a.codigo, t.nombre))::int * 3 end,
    true, null, 'activa', v_usr, now(), now()
  from activos a
  cross join flota_certificacion_tipos t
  where a.empresa_id = v_emp and t.empresa_id = v_emp and t.nombre in ('Seguridad minera', 'Revisión técnica')
    and a.id in (select equipo_id from contratos_alquiler_equipos e join contratos_alquiler c on c.id = e.contrato_alquiler_id where c.empresa_id = v_emp);

  -- 4. Garantías: overhaul del tractor y carta fianza del contrato principal
  delete from garantias_flota where empresa_id = v_emp;
  insert into garantias_flota (empresa_id, sociedad_id, tipo_id, activo_id, contrato_alquiler_id, componente, numero, emisor,
    beneficiario, monto, moneda, fecha_inicio, fecha_fin, estado, responsable, notas, created_by)
  select v_emp, c.sociedad_id, t.id,
    case when t.categoria = 'overhaul' then (select id from activos where empresa_id = v_emp and codigo = 'TR-01') end,
    case when t.categoria = 'carta_fianza' then c.id end,
    case when t.categoria = 'overhaul' then 'Tren de fuerza' end,
    case when t.categoria = 'overhaul' then 'GO-2026-014' else 'CF-0018834' end,
    case when t.categoria = 'overhaul' then 'Ferreyros S.A.' else 'BBVA Perú' end,
    case when t.categoria = 'overhaul' then 'Andes Rental & Logistics S.A.C.' else cu.nombre_comercial end,
    case when t.categoria = 'carta_fianza' then 45000 end, case when t.categoria = 'carta_fianza' then 'PEN' end,
    case when t.categoria = 'overhaul' then date '2026-06-01' else c.fecha_inicio end,
    case when t.categoria = 'overhaul' then date '2027-05-31' else c.fecha_fin end,
    'vigente', 'Martín Huamán Rojas', null, v_usr
  from flota_garantia_tipos t
  join contratos_alquiler c on c.id = 'ca_demo_01'
  left join cuentas cu on cu.id = c.cuenta_id
  where t.empresa_id = v_emp and t.categoria in ('overhaul', 'carta_fianza');

  -- 5. Liquidaciones mensuales (setiembre aprobada, octubre en revisión) con la función oficial
  delete from flota_liquidacion_lineas where liquidacion_id in (select id from flota_liquidaciones where empresa_id = v_emp);
  delete from flota_liquidaciones where empresa_id = v_emp;
  for r in
    select c.id, p.periodo from contratos_alquiler c
    cross join (values (date '2026-09-01'), (date '2026-10-01')) p(periodo)
    where c.empresa_id = v_emp
      and (p.periodo + interval '1 month' - interval '1 day')::date >= c.fecha_inicio
      and (c.fecha_fin is null or p.periodo <= c.fecha_fin)
    order by p.periodo, c.id
  loop
    v_res := public.flota_crear_liquidacion(v_emp, r.id, r.periodo);
    v_liq := (v_res ->> 'id')::uuid;
    -- Solo se envía si el mes tiene todos sus partes; si faltan, queda en borrador mostrando los días faltantes
    if coalesce((select dias_faltantes from flota_liquidaciones where id = v_liq), 0) = 0 then
      perform public.flota_enviar_liquidacion(v_liq);
      if r.periodo = date '2026-09-01' then
        perform public.flota_aprobar_liquidacion(v_liq);
      end if;
    end if;
  end loop;

  -- Comprobaciones
  if (select count(*) from movimientos_equipo_rental where empresa_id = v_emp and tipo = 'salida' and abierto) <> 7 then
    raise exception 'se esperaban 7 equipos en contrato';
  end if;
  if (select count(*) from flota_liquidaciones where empresa_id = v_emp) < 6 then raise exception 'faltan liquidaciones'; end if;
  if exists (select 1 from flota_liquidaciones where empresa_id = v_emp and coalesce(total, 0) <= 0) then
    raise exception 'liquidación sin monto';
  end if;
  if exists (select 1 from actas_rental where empresa_id <> v_emp and numero like 'DES-2026-%' and created_by = v_usr) then
    raise exception 'actas fuera de PRUEBA';
  end if;
end $$;
