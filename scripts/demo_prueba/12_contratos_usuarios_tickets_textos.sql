-- Demo PRUEBA · 12 Contratos laborales, responsables ficticios, tickets, facturas, cuentas y horas (2026-11-08)
-- Aprobado por Cristhian: "todo como propones y cambia los nombres a ficticios".
do $$
declare
  v_emp constant text := 'emp_2000000000';
  v_ais constant uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  v_tipo constant text := 'tdoc_acf86dd0f5b947ecb7'; -- Contrato de trabajo (categoría Contractual)
  n int;
begin
  set local session_replication_role = replica;

  -- 1. Contrato de trabajo vigente (indefinido, aprobado) para cada trabajador demo, en la sociedad de la nómina
  delete from personal_documentos where empresa_id = v_emp and id like 'pdoc_demo_%';
  insert into personal_documentos (id, empresa_id, personal_id, personal_tipo, tipo_doc, tipo_documento_id, nombre_archivo,
    fecha_emision, version, activo, estado_validacion, subido_desde, revisado_en, creado_en, condiciones_laborales,
    seccion_documental, estado_firma, contrato_periodo_id, periodo_fecha_inicio, periodo_fecha_fin, periodo_estado,
    periodo_grupo_id, es_indefinido, sociedad_id)
  select 'pdoc_demo_' || p.id, v_emp, p.id, p.tipo, v_tipo, v_tipo, 'Contrato de trabajo - ' || p.nombre || '.pdf',
    p.fecha_ingreso, 1, true, 'aprobado', 'backoffice', p.fecha_ingreso::timestamp + interval '15 hours',
    p.fecha_ingreso::timestamp + interval '14 hours',
    jsonb_build_object('cargo', p.cargo, 'cargo_id', coalesce(p.cargo_id, ''), 'cargo_nombre', p.cargo,
      'area_id', coalesce(p.area_id, ''), 'area_nombre', p.area, 'sede', p.sede, 'sede_id', coalesce(p.sede_id, ''),
      'sede_nombre', p.sede, 'modalidad', '', 'tipo_contrato', 'indeterminado',
      'regimen_jornada', coalesce(p.regimen_jornada, 'general'), 'remuneracion_base', p.sueldo, 'modalidad_contrato', 'planilla'),
    'requisito_cargo', 'no_requiere', 'pdoc_demo_' || p.id, p.fecha_ingreso, null, 'vigente', gen_random_uuid(), true, v_ais
  from (
    select id, nombre, 'operativo' tipo, cargo, cargo_id, area, area_id, sede, sede_id, regimen_jornada, sueldo_base sueldo, fecha_ingreso
    from personal_operativo where empresa_id = v_emp
    union all
    select id, nombre, 'administrativo', cargo, cargo_id, area, area_id, sede, sede_id, regimen_jornada,
      coalesce(sueldo_base, remuneracion), fecha_ingreso
    from personal_administrativo where empresa_id = v_emp
  ) p;
  get diagnostics n = row_count;
  if n <> 47 then raise exception 'se esperaban 47 contratos y se crearon %', n; end if;

  -- 2. Responsables ficticios (usuarios sin cuenta de acceso; correo en dominio reservado .example)
  insert into usuarios (id, empresa_id, nombre, email, rol, area, cargo, estado, created_at, updated_at) values
    ('usr_demo_01', v_emp, 'Lucía Paredes Quispe', 'lucia.paredes@andes-demo.example', 'rol_emp_2000000000_admin', 'Administración', 'Asistente administrativa', 'Activo', '2025-02-03', now()),
    ('usr_demo_02', v_emp, 'Martín Huamán Rojas', 'martin.huaman@andes-demo.example', 'rol_emp_2000000000_ops_jefe', 'Operaciones', 'Jefe de taller', 'Activo', '2024-06-10', now()),
    ('usr_demo_03', v_emp, 'Diego Ccori Mamani', 'diego.ccori@andes-demo.example', 'rol_emp_2000000000_ops_tecnico', 'Operaciones', 'Supervisor de campo', 'Activo', '2024-09-02', now()),
    ('usr_demo_04', v_emp, 'Rocío Salazar Vega', 'rocio.salazar@andes-demo.example', 'rol_emp_2000000000_ops_tecnico', 'Postventa', 'Coordinadora de postventa', 'Activo', '2025-01-15', now())
  on conflict (id) do update set nombre = excluded.nombre, email = excluded.email;

  update caja_chica_fondos set responsable_id = case
      when nombre ilike '%Taller%' then 'usr_demo_02'
      when nombre ilike '%Campamento%' then 'usr_demo_03'
      else 'usr_demo_01' end
  where empresa_id = v_emp;

  -- 3. Tickets: responsables ficticios coherentes y variedad de estado, prioridad y tipo
  with t as (select id, titulo, estado, row_number() over (order by creado_en desc) rn,
    row_number() over (partition by estado order by creado_en desc) ro from tickets where empresa_id = v_emp)
  update tickets k set
    responsable_id = (array['usr_demo_04','usr_demo_02','usr_demo_03'])[1 + t.rn % 3],
    responsable_nombre = (array['Rocío Salazar Vega','Martín Huamán Rojas','Diego Ccori Mamani'])[1 + t.rn % 3],
    tipo = case when t.titulo ~* '^(consulta|pedido|solicitud)' then 'consulta'
                when t.titulo ~* 'horómetro|valorización' then 'reclamo'
                when t.titulo ~* 'preventiv' then 'preventivo' else 'averia' end,
    prioridad = case when t.titulo ~* 'detenido|pierde potencia' then 'critica'
                     when t.titulo ~* 'ruido|falla' then 'alta'
                     when t.titulo ~* '^consulta' then 'baja' else 'media' end,
    estado = case when k.estado = 'abierto' and t.ro in (2, 4) then 'en_proceso'
                  when k.estado = 'abierto' and t.ro = 5 then 'qc' else k.estado end,
    qc_estado = case when k.estado = 'abierto' and t.ro = 5 then 'en_revision' else k.qc_estado end
  from t where k.id = t.id;

  -- 4. Facturas cobradas con el estado que usa la app
  update facturas set estado = 'cobrada' where empresa_id = v_emp and estado = 'pagada';

  -- 5. Nombres de cuentas bancarias sin repetir el banco
  update cuentas_bancarias set nombre = case id
      when 'cb_demo_bcp_pen' then 'Soles Operaciones'
      when 'cb_demo_bbva_usd' then 'Dólares'
      when 'cb_demo_ibk_pen' then 'Soles Recaudación' else nombre end
  where empresa_id = v_emp and id like 'cb_demo_%';

  -- 6. Horas de jornada (08:00–15:59 Lima) en diagnósticos y recepciones de activos
  with d as (select id, row_number() over (order by id) rn from diagnosticos_tecnicos where empresa_id = v_emp)
  update diagnosticos_tecnicos x set
    created_at = date_trunc('day', x.created_at) + make_interval(hours => 13 + (d.rn % 8)::int, mins => (d.rn * 17 % 60)::int),
    updated_at = date_trunc('day', x.updated_at) + make_interval(hours => 13 + (d.rn % 8)::int, mins => (d.rn * 17 % 60)::int),
    emitido_en = case when x.emitido_en is null then null
                      else date_trunc('day', x.emitido_en) + make_interval(hours => 15 + (d.rn % 6)::int, mins => (d.rn * 23 % 60)::int) end
  from d where x.id = d.id;
  with r as (select id, row_number() over (order by id) rn from recepciones_activos_cliente where empresa_id = v_emp)
  update recepciones_activos_cliente x set
    created_at = date_trunc('day', x.created_at) + make_interval(hours => 13 + (r.rn % 7)::int, mins => (r.rn * 11 % 60)::int),
    updated_at = date_trunc('day', x.updated_at) + make_interval(hours => 13 + (r.rn % 7)::int, mins => (r.rn * 11 % 60)::int)
  from r where x.id = r.id;

  -- Comprobaciones
  if exists (select 1 from facturas where empresa_id = v_emp and estado = 'pagada') then raise exception 'quedan facturas pagada'; end if;
  if exists (select 1 from tickets where empresa_id = v_emp and responsable_id not like 'usr_demo_%') then raise exception 'tickets con responsable real'; end if;
  if exists (select 1 from caja_chica_fondos where empresa_id = v_emp and responsable_id not like 'usr_demo_%') then raise exception 'caja con responsable real'; end if;
  if (select count(*) from tickets where empresa_id = v_emp and estado in ('en_proceso','qc')) < 2 then raise exception 'tickets sin variedad de estado'; end if;
  if exists (select 1 from diagnosticos_tecnicos where empresa_id = v_emp and extract(hour from created_at at time zone 'America/Lima') not between 8 and 15) then
    raise exception 'diagnósticos fuera de jornada';
  end if;
  if exists (select 1 from personal_documentos where id like 'pdoc_demo_%' and empresa_id <> v_emp) then raise exception 'contratos fuera de PRUEBA'; end if;
end $$;
