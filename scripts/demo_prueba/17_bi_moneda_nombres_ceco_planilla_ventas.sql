-- Demo PRUEBA · 17 Tableros BI: moneda base, nombres ficticios, CECO de OT, planilla en el ER y ventas de noviembre (2026-11-08)
-- Aprobado por Cristhian: "todo como propones".
do $$
declare
  v_emp constant text := 'emp_2000000000';
  r record;
  v_sql text;
  n bigint;
  v_total bigint := 0;
begin
  set local session_replication_role = replica;

  -- 1. Moneda base en soles: los tableros BI abren en PEN (todos los datos del demo están en PEN)
  update empresas set moneda_base = 'PEN' where id = v_emp;

  -- 2. Nombres de personas reales del equipo → personas ficticias, en todos los textos del tenant
  insert into usuarios (id, empresa_id, nombre, email, rol, area, cargo, estado, created_at, updated_at) values
    ('usr_demo_05', v_emp, 'Jorge Salinas Medina', 'jorge.salinas@andes-demo.example', 'rol_emp_2000000000_comercial_asesor', 'Comercial', 'Ejecutivo comercial', 'Activo', '2024-03-04', now()),
    ('usr_demo_06', v_emp, 'Valeria Torres Chumpitaz', 'valeria.torres@andes-demo.example', 'rol_emp_2000000000_comercial_asesor', 'Comercial', 'Ejecutiva comercial', 'Activo', '2024-08-19', now())
  on conflict (id) do update set nombre = excluded.nombre, email = excluded.email;

  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.data_type in ('text', 'character varying')
      and c.column_name not in ('id', 'empresa_id', 'email')
      and c.is_generated = 'NEVER'
      and c.table_name not in ('usuarios')
      and exists (select 1 from information_schema.columns e where e.table_schema = 'public' and e.table_name = c.table_name and e.column_name = 'empresa_id')
      and exists (select 1 from information_schema.tables t where t.table_schema = 'public' and t.table_name = c.table_name and t.table_type = 'BASE TABLE')
  loop
    v_sql := format($f$
      update public.%1$I set %2$I =
        replace(replace(replace(replace(replace(replace(replace(replace(%2$I,
          'Daniel Alonso Martínez Saldaña', 'Valeria Torres Chumpitaz'),
          'Daniel Martínez', 'Valeria Torres Chumpitaz'),
          'Carlos Gonzales', 'Jorge Salinas Medina'),
          'Sandibel Jimenez', 'Lucía Paredes Quispe'),
          'Gian Cardenas', 'Diego Ccori Mamani'),
          'Andrea Molina', 'Rocío Salazar Vega'),
          'Katherine Arellano', 'Milagros Rojas Aliaga'),
          'Karyme Arellano', 'Milagros Rojas Aliaga')
      where empresa_id = %3$L
        and %2$I ~ '(Daniel Alonso Martínez Saldaña|Daniel Martínez|Carlos Gonzales|Sandibel Jimenez|Gian Cardenas|Andrea Molina|Katherine Arellano|Karyme Arellano)'
    $f$, r.table_name, r.column_name, v_emp);
    execute v_sql;
    get diagnostics n = row_count;
    v_total := v_total + n;
  end loop;
  raise notice 'textos reemplazados: %', v_total;

  -- El id del responsable apuntaba a usuarios reales; el nombre visible ya es ficticio
  update oportunidades set responsable_id = null where empresa_id = v_emp and responsable_id is not null;

  -- 3. Centro de costo de las OT (taller de mantenimiento o maestranza) para que su costo se asigne a la sociedad
  update centros_costo set naturaleza_economica = 'productivo'
  where empresa_id = v_emp and id in ('ceco_7aecbcb4f0de487c9b', 'ceco_43b74628ca2c427f86');
  update centros_costo set naturaleza_economica = 'apoyo'
  where empresa_id = v_emp and id = 'ceco_cc997c2835cc4bb782';
  update ordenes_trabajo set centro_costo_id = case
      when tipo_trabajo in ('Overhaul', 'Acondicionamiento') then 'ceco_43b74628ca2c427f86'   -- 1012 Taller de maestranza
      else 'ceco_7aecbcb4f0de487c9b' end                                                      -- 1017 Taller Lurín
  where empresa_id = v_emp and centro_costo_id is null;

  -- 4. Planilla administrativa en el Estado de Resultados (períodos cerrados ago–oct).
  --    La mano de obra operativa ya está en el costo de cada OT (costos_ot.mano_obra); incluirla aquí la contaría dos veces.
  delete from detalle_nomina where empresa_id = v_emp and id like 'dn_demo_%';
  insert into detalle_nomina (id, empresa_id, periodo_nomina_id, trabajador_tipo, trabajador_id, sueldo_base, remuneracion_bruta,
    descuentos, retencion_ir, neto, essalud, cts, gratificacion, vacaciones, costo_real_empresa, moneda, desglose, created_at, centro_costo_id)
  select 'dn_demo_' || d.id, v_emp, d.periodo_id, d.trabajador_tipo, d.trabajador_id, d.sueldo_base, d.remuneracion_bruta,
    d.total_descuentos, d.retencion_ir, d.neto, d.essalud, d.cts_mensualizado, d.gratificacion_mensualizada, d.vacaciones_mensualizadas,
    d.costo_real_empresa, 'PEN', '{}'::jsonb, d.creado_en, 'ceco_cc997c2835cc4bb782'
  from nomina_detalle d
  join periodos_nomina p on p.id = d.periodo_id
  where p.empresa_id = v_emp and p.estado = 'cerrado' and d.trabajador_tipo = 'administrativo';
  get diagnostics n = row_count;
  if n <> 33 then raise exception 'se esperaban 33 filas de planilla administrativa y se crearon %', n; end if;

  -- 5. Tres ventas ganadas en noviembre (con su cotización aprobada)
  update oportunidades o set estado = 'ganada', etapa = 'ganada', probabilidad = 100, forecast_ponderado = monto_estimado,
    fecha_cierre_real = x.fecha, updated_at = x.fecha::timestamp + interval '16 hours'
  from (values ('opp_demo_026', date '2026-11-03'), ('opp_demo_032', date '2026-11-05'), ('opp_demo_042', date '2026-11-06')) x(id, fecha)
  where o.id = x.id and o.empresa_id = v_emp;
  update cotizaciones set estado = 'aprobada', updated_at = now()
  where empresa_id = v_emp and oportunidad_id in ('opp_demo_026', 'opp_demo_032', 'opp_demo_042');

  -- Comprobaciones
  if (select moneda_base from empresas where id = v_emp) <> 'PEN' then raise exception 'moneda base no cambió'; end if;
  if exists (select 1 from oportunidades where empresa_id = v_emp and responsable ~ '(Daniel Mart|Carlos Gonzales|Andrea Molina)') then
    raise exception 'quedan nombres reales en oportunidades';
  end if;
  if exists (select 1 from ordenes_trabajo where empresa_id = v_emp and centro_costo_id is null) then raise exception 'OT sin CECO'; end if;
  if (select count(*) from oportunidades where empresa_id = v_emp and estado = 'ganada' and fecha_cierre_real >= date '2026-11-01') <> 3 then
    raise exception 'no quedaron 3 ventas ganadas en noviembre';
  end if;
end $$;
