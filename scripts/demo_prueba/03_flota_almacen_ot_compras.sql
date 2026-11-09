-- Demo PRUEBA · 03 Activos/flota, almacén, OT, compras y CxP
do $$
declare
  emp text := 'emp_2000000000';
  soc uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  prov text[][] := array[
    -- razón social, rubro, condición, categoría
    ['Repuestos Mineros del Perú S.A.C.','Repuestos para maquinaria pesada','30 días','Repuestos'],
    ['Hidráulica Industrial Andina S.A.C.','Componentes hidráulicos','30 días','Repuestos'],
    ['Lubricantes y Filtros Lima S.A.','Lubricantes y filtros','15 días','Consumibles'],
    ['Aceros y Planchas del Centro S.A.C.','Planchas y perfiles de acero','30 días','Materia prima'],
    ['Soldaduras Técnicas S.A.C.','Soldadura y gases industriales','15 días','Consumibles'],
    ['Rodamientos y Transmisiones S.A.','Rodamientos y transmisión','30 días','Repuestos'],
    ['Seguridad Total EPP S.A.C.','Equipos de protección personal','15 días','EPP'],
    ['Transportes Cama Baja Sur S.A.C.','Transporte de carga pesada','30 días','Servicios'],
    ['Laboratorio de Ensayos NDT Perú S.A.C.','Ensayos no destructivos','30 días','Servicios'],
    ['Electro Motores Industriales S.A.C.','Motores y bobinados','30 días','Repuestos'],
    ['Grifos y Combustibles Ruta Central S.A.','Combustible','Contado','Combustible'],
    ['Inmobiliaria Parque Industrial Ate S.A.','Alquiler de local','Contado','Servicios']];
  mat text[][] := array[
    -- código, descripción, unidad, grupo, familia, costo, stock inicial, punto reorden
    ['FIL-ACE-1R0739','Filtro de aceite motor CAT 1R-0739','UND','mg_a0a9950d5f3a445490','mf_fefb20d631fa406d81','86','60','20'],
    ['FIL-COM-1R0750','Filtro de combustible CAT 1R-0750','UND','mg_a0a9950d5f3a445490','mf_fefb20d631fa406d81','74','55','20'],
    ['FIL-HID-5I8670','Filtro hidráulico 5I-8670','UND','mg_d0ef62084def45708d','mf_fefb20d631fa406d81','192','30','12'],
    ['FIL-AIR-6I2501','Filtro de aire primario 6I-2501','UND','mg_a0a9950d5f3a445490','mf_fefb20d631fa406d81','265','24','10'],
    ['ACE-15W40-208','Aceite motor 15W-40 cilindro 208 L','CIL','mg_f40e86b113b04ca8af','mf_fefb20d631fa406d81','2150','14','6'],
    ['ACE-HID-68-208','Aceite hidráulico ISO 68 cilindro 208 L','CIL','mg_f40e86b113b04ca8af','mf_fefb20d631fa406d81','1980','10','5'],
    ['GRA-EP2-18','Grasa EP2 balde 18 kg','BAL','mg_f40e86b113b04ca8af','mf_fefb20d631fa406d81','310','25','8'],
    ['MAN-HID-12-2W','Manguera hidráulica 1/2" 2 mallas','M','mg_d0ef62084def45708d','mf_d85b09279d0a4b5a83','58','180','60'],
    ['MAN-HID-34-4W','Manguera hidráulica 3/4" 4 espirales','M','mg_d0ef62084def45708d','mf_d85b09279d0a4b5a83','96','40','50'],
    ['SEL-KIT-CIL-336','Kit de sellos cilindro de brazo 336','KIT','mg_d0ef62084def45708d','mf_3235563dd0394aafaf','1350','6','4'],
    ['BOM-HID-966H','Bomba hidráulica de implementos 966H','UND','mg_d0ef62084def45708d','mf_3235563dd0394aafaf','18500','1','1'],
    ['ROD-22220-SKF','Rodamiento de rodillos esféricos 22220','UND','mg_a0a9950d5f3a445490','mf_c20f680fdd1646dc9d','640','12','6'],
    ['ROD-6312-2RS','Rodamiento rígido de bolas 6312-2RS','UND','mg_a0a9950d5f3a445490','mf_c20f680fdd1646dc9d','115','30','10'],
    ['PER-G8-34X3','Perno grado 8 3/4" x 3"','UND','mg_13e57f65c9054e01b4','mf_b84fbdd4035a419c88','6.5','900','300'],
    ['PER-ZAP-D8T','Perno de zapata tractor D8T con tuerca','UND','mg_13e57f65c9054e01b4','mf_b84fbdd4035a419c88','28','320','150'],
    ['SOL-E7018-18','Soldadura E7018 1/8" caja 20 kg','CJA','mg_523c3406c51f4368b9','mf_7fe88331b06b4e4c97','265','22','10'],
    ['SOL-HARD-14','Soldadura antidesgaste hardfacing 1/4"','KG','mg_523c3406c51f4368b9','mf_7fe88331b06b4e4c97','48','90','40'],
    ['PLA-A36-38','Plancha acero A36 3/8" 1.2x2.4 m','PLA','mg_a0a9950d5f3a445490','mf_ebb7f4badc9a424097','780','16','8'],
    ['PLA-HB400-58','Plancha antidesgaste HB400 5/8" 1.2x2.4 m','PLA','mg_a0a9950d5f3a445490','mf_ebb7f4badc9a424097','3450','4','4'],
    ['TUB-SCH40-4','Tubo acero SCH40 4" x 6 m','UND','mg_a0a9950d5f3a445490','mf_4116b9095514491a81','420','12','6'],
    ['CUC-DIE-336','Diente de cucharón 336 J350','UND','mg_a0a9950d5f3a445490','mf_15b1cd241525479ab7','210','40','24'],
    ['CUC-ADA-336','Adaptador de diente J350','UND','mg_a0a9950d5f3a445490','mf_15b1cd241525479ab7','480','10','8'],
    ['CAB-THW-10','Cable THW 10 AWG rollo 100 m','ROL','mg_a52a6694274b46a49b','mf_f9653958e5804d3a97','310','8','4'],
    ['MOT-ARR-24V','Motor de arranque 24 V','UND','mg_a52a6694274b46a49b','mf_636d97f2d607441c9b','2850','2','2'],
    ['ALT-24V-70A','Alternador 24 V 70 A','UND','mg_a52a6694274b46a49b','mf_636d97f2d607441c9b','1950','3','2'],
    ['EPP-CAS-MSA','Casco de seguridad MSA V-Gard','UND','mg_2fbc6fc2dc384cd098','mf_422c6bff66dc4d059b','48','40','20'],
    ['EPP-GUA-NIT','Guantes de nitrilo industrial (par)','PAR','mg_2fbc6fc2dc384cd098','mf_422c6bff66dc4d059b','12','300','120'],
    ['EPP-LEN-CLA','Lentes de seguridad claros','UND','mg_2fbc6fc2dc384cd098','mf_422c6bff66dc4d059b','9','150','60'],
    ['DIS-COR-7','Disco de corte 7" para acero','UND','mg_523c3406c51f4368b9','mf_7fe88331b06b4e4c97','7.8','400','150'],
    ['REF-COO-ELC','Refrigerante ELC galón','GAL','mg_f40e86b113b04ca8af','mf_fefb20d631fa406d81','62','60','24']];
  eq text[][] := array[
    -- código, nombre, categoría, marca, modelo, año, valor USD, horómetro, propietario (p=propio, c=cliente n)
    ['EX-01','Excavadora CAT 336D2','EXCAVADORA','Caterpillar','336D2','2019','215000','11850','p'],
    ['EX-02','Excavadora CAT 336D2','EXCAVADORA','Caterpillar','336D2','2020','228000','9620','p'],
    ['EX-03','Excavadora Komatsu PC350LC-8','EXCAVADORA','Komatsu','PC350LC-8','2018','198000','14310','p'],
    ['EX-07','Excavadora CAT 336 (alta falla)','EXCAVADORA','Caterpillar','336','2016','176000','18940','p'],
    ['CF-01','Cargador frontal CAT 966H','CARGADOR','Caterpillar','966H','2017','185000','16200','p'],
    ['CF-02','Cargador frontal CAT 966H','CARGADOR','Caterpillar','966H','2019','205000','10450','p'],
    ['CF-03','Cargador frontal Volvo L120H','CARGADOR','Volvo','L120H','2021','212000','6120','p'],
    ['TR-01','Tractor de orugas CAT D8T','TRACTOR','Caterpillar','D8T','2015','320000','21300','p'],
    ['RE-01','Retroexcavadora CAT 420F2','RETROEXCAVADORA','Caterpillar','420F2','2021','98000','5240','p'],
    ['RE-02','Retroexcavadora JCB 3CX','RETROEXCAVADORA','JCB','3CX','2020','89000','6880','p'],
    ['MC-01','Montacargas Toyota 8FGU25','MONTACARGA','Toyota','8FGU25','2018','32000','8900','p'],
    ['CB-01','Tracto + cama baja 60 t','VEHICULOS','Volvo','FH 540 + Cama baja','2019','265000','412000','p'],
    ['CM-01','Camioneta Toyota Hilux 4x4','VEHICULOS','Toyota','Hilux 2.8','2022','42000','88500','p'],
    ['CM-02','Camioneta Toyota Hilux 4x4','VEHICULOS','Toyota','Hilux 2.8','2023','45000','51200','p'],
    ['GE-01','Grupo electrógeno 150 kVA','EQUIPO','Cummins','C150D6','2020','28000','7400','p'],
    ['TO-01','Torno paralelo 3 m','TORNO 3M LARGO','Pinacho','S90/260','2016','38000',null,'p'],
    ['CL-777-12','Camión minero CAT 777F N° 12','DUMPER','Caterpillar','777F','2014','0','48200','c1'],
    ['CL-777-15','Camión minero CAT 777F N° 15','DUMPER','Caterpillar','777F','2015','0','45100','c1'],
    ['CL-PC-07','Excavadora Komatsu PC450 cliente','EXCAVADORA','Komatsu','PC450-8','2017','0','19800','c2'],
    ['CL-966-04','Cargador CAT 966H cliente','CARGADOR','Caterpillar','966H','2016','0','22400','c4'],
    ['CL-D8-02','Tractor CAT D8T cliente','TRACTOR','Caterpillar','D8T','2014','0','26700','c10'],
    ['CL-HOR-01','Horno rotatorio – estructura de soporte','EQUIPO','FLSmidth','Línea 2','2010','0',null,'c5']];
  i int; j int; d date; m record; v_ot text; v_os record; n_ot int := 0; costo numeric; v_eq text; tt text;
  n_oc int := 0; v_oc text; v_cxp text; sub numeric; tot numeric; v_prov int; pag numeric; f date; n_cxp int := 0; mt record;
begin
  perform setseed(0.23);
  set local session_replication_role = replica;

  -- Proveedores
  for i in 1..array_length(prov,1) loop
    insert into proveedores(id,empresa_id,codigo,razon_social,nombre_comercial,ruc,tipo,estado,rubro,categoria,telefono,email,condicion_pago,banco,calificacion_promedio,homologado_at,fecha_homologacion,pais,moneda,contacto_nombre,contacto_cargo,direccion,total_evaluaciones,created_at)
    values ('prv_demo_'||lpad(i::text,2,'0'),emp,'PRV-'||lpad(i::text,3,'0'),prov[i][1],split_part(prov[i][1],' S.A',1),'2099922'||lpad((2000+i*41)::text,4,'0'),'empresa',
      case when i in (9,10) then 'potencial' else 'homologado' end,prov[i][2],prov[i][4],'01 '||(3400000+i*911)::text,'ventas@'||lower(replace(split_part(prov[i][1],' ',1),'í','i'))||'-demo.pe',
      prov[i][3],(array['BCP','BBVA','Interbank'])[1+i%3],round((3.4+((i*7)%16)/10.0)::numeric,1),'2026-03-01','2026-03-01','Perú','PEN',
      (array['Jorge Lazo','Milagros Pérez','Raúl Benites','Cinthia Rivas'])[1+i%4],'Ejecutivo de cuenta','Lima',3,'2026-03-01');
  end loop;

  -- Almacenes, ubicaciones y materiales
  insert into almacenes(id,empresa_id,codigo,nombre,ubicacion,estado,tipo,responsable,direccion,clase,proposito,created_at) values
   ('alm_demo_ate',emp,'ALM-01','Almacén Central Taller Ate','Ate, Lima','activo','Central','Jefe de Logística','Av. Industrial 1450, Ate','central','consumo_interno','2026-07-01'),
   ('alm_demo_cdp',emp,'ALM-02','Almacén Campamento Cerro de Pasco','Cerro de Pasco','activo','Central','Supervisor de Operaciones','Campamento km 4, Cerro de Pasco','central','consumo_interno','2026-07-01');
  insert into ubicaciones(id,empresa_id,almacen_id,codigo,nombre,tipo,es_general,activo,uso,created_at) values
   ('ubi_demo_ate_gen',emp,'alm_demo_ate','GEN','General','general',true,true,'almacenaje','2026-07-01'),
   ('ubi_demo_ate_a1',emp,'alm_demo_ate','A-01','Rack A – Filtros y lubricantes','rack',false,true,'almacenaje','2026-07-01'),
   ('ubi_demo_ate_b1',emp,'alm_demo_ate','B-01','Rack B – Repuestos hidráulicos','rack',false,true,'almacenaje','2026-07-01'),
   ('ubi_demo_ate_rec',emp,'alm_demo_ate','REC','Zona de recepción','zona',false,true,'recepcion','2026-07-01'),
   ('ubi_demo_cdp_gen',emp,'alm_demo_cdp','GEN','General','general',true,true,'almacenaje','2026-07-01');
  for i in 1..array_length(mat,1) loop
    insert into materiales(id,empresa_id,codigo,descripcion,unidad,familia,costo_promedio,moneda,stock_minimo,estado,grupo_id,familia_id,nro_parte,almacen_id,ubicacion,precio_unitario,tipo_control,stock_maximo,punto_reorden,stock_seguridad,created_at)
    values ('mat_demo_'||lpad(i::text,2,'0'),emp,mat[i][1],mat[i][2],mat[i][3],(select nombre from material_familias where id=mat[i][5]),mat[i][6]::numeric,'PEN',mat[i][8]::numeric,'activo',
      mat[i][4],mat[i][5],split_part(mat[i][1],'-',3),'alm_demo_ate',case when i<=7 then 'A-01' else 'B-01' end,round(mat[i][6]::numeric*1.35,2),'cantidad',mat[i][7]::numeric*2,mat[i][8]::numeric,round(mat[i][8]::numeric/2),'2026-07-15');
    -- saldo inicial al 01/08
    insert into kardex(id,empresa_id,material_id,almacen_id,ubicacion_id,fecha,tipo,cantidad,costo_unitario,costo_total,moneda,referencia_tipo,observacion,saldo_cantidad,sociedad_id,created_at)
    values ('kdx_demo_ini_'||lpad(i::text,2,'0'),emp,'mat_demo_'||lpad(i::text,2,'0'),'alm_demo_ate','ubi_demo_ate_gen','2026-08-01 08:00','entrada',mat[i][7]::numeric,mat[i][6]::numeric,mat[i][7]::numeric*mat[i][6]::numeric,'PEN','saldo_inicial','Inventario inicial',mat[i][7]::numeric,soc,'2026-08-01 08:00');
  end loop;

  -- Activos: flota propia y equipos de clientes
  for i in 1..array_length(eq,1) loop
    insert into activos(id,empresa_id,codigo,nombre,tipo_categoria,marca,modelo,placa_serie,ubicacion,estado,responsable_nombre,fecha_alta,valor_adquisicion,moneda,vida_util_anos,documentos,observacion,created_at,propietario_tipo,cliente_propietario_id,horas_disponibles_mes,año_fabricacion,tipo_activo,horometro_actual)
    values ('act_demo_'||lower(replace(eq[i][1],'-','_')),emp,eq[i][1],eq[i][2],eq[i][3],eq[i][4],eq[i][5],'SN-'||upper(substr(md5(eq[i][1]),1,8)),
      case when eq[i][9]='p' then (array['Taller Ate','Obra Consorcio Vial Los Andes','Mina Huaytapallana','Taller Ate','Cantera Agregados Lima Norte'])[1+i%5] else 'Taller Ate – en reparación' end,
      case when eq[i][1] in ('EX-07','TR-01') then 'en_mantenimiento' else 'operativo' end,
      case when eq[i][9]='p' then 'Jefe de Operaciones' else null end,
      make_date(eq[i][6]::int,3,1),case when eq[i][9]='p' then eq[i][7]::numeric else null end,case when eq[i][9]='p' then 'USD' end,10,'[]'::jsonb,
      case when eq[i][1]='EX-07' then 'Equipo con fallas recurrentes del sistema hidráulico; evaluar reemplazo.' end,
      '2026-07-01',case when eq[i][9]='p' then 'propio' else 'cliente' end,
      case when eq[i][9]<>'p' then 'cta_demo_'||lpad(substr(eq[i][9],2)::text,2,'0') end,
      case when eq[i][3] in ('EXCAVADORA','CARGADOR','TRACTOR','RETROEXCAVADORA') then 400 else 200 end,
      eq[i][6]::int,'maquinaria_completa',nullif(eq[i][8],'')::numeric);
  end loop;

  -- OT por cada OS del cliente
  for v_os in select o.* from os_clientes o where empresa_id=emp order by fecha_emision loop
    n_ot := n_ot+1;
    v_ot := 'ot_demo_'||lpad(n_ot::text,3,'0');
    v_eq := case
      when v_os.nombre like '%777F%' then 'act_demo_cl_777_12'
      when v_os.nombre like '%D8T%' then 'act_demo_cl_d8_02'
      when v_os.nombre like '%966H%' and v_os.nombre like 'Alquiler%' then 'act_demo_cf_0'||(1+n_ot%3)
      when v_os.nombre like '%966H%' then 'act_demo_cl_966_04'
      when v_os.nombre like '%excavadora%' and v_os.nombre like 'Alquiler%' then 'act_demo_ex_0'||(1+n_ot%3)
      when v_os.nombre like '%CAT 336%' then 'act_demo_ex_0'||(1+n_ot%3)
      when v_os.nombre like '%Komatsu%' then 'act_demo_cl_pc_07'
      when v_os.nombre like '%tolva%' then 'act_demo_cl_hor_01'
      else null end;
    tt := case when v_os.nombre like 'Mantenimiento preventivo%' then 'Preventivo_PM' when v_os.nombre like 'Overhaul%' then 'Overhaul'
               when v_os.nombre like 'Fabricación%' then 'Acondicionamiento' else 'Correctivo' end;
    -- Margen: normalmente 28–42 %; el overhaul de Inca Ingenieros se pasa de costo
    costo := round(v_os.monto_aprobado * case when v_os.cuenta_id='cta_demo_11' and tt='Overhaul' then 1.08 else (0.58 + (abs(hashtext(v_ot))%14)/100.0) end, 2);
    insert into ordenes_trabajo(id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,direccion_ejecucion,fecha_programada,hora_inicio,hora_fin,tecnico_responsable_id,estado,avance_pct,costo_estimado,costo_real,moneda,fecha_fin,supervisor,facturable,est_mo,est_materiales,est_terceros,est_logistica,sociedad_id,tipo_trabajo,cargo_financiero,fecha_inicio_real,linea_negocio,tipo_cobro,created_at,updated_at)
    values (v_ot,emp,v_os.id,'OT-26-'||lpad((700+n_ot)::text,4,'0'),v_os.cuenta_id,v_os.nombre,'Ejecución según '||v_os.numero,
      case when v_os.nombre like 'Alquiler%' or v_os.nombre like 'Transporte%' then 'Instalaciones del cliente' else 'Taller Ate' end,
      v_os.fecha_inicio,'07:30','17:30','po_demo_'||lpad((1+n_ot%12)::text,3,'0'),
      case when v_os.estado='cerrada' then 'cerrada' when v_os.fecha_inicio > date '2026-11-04' then 'programada' else 'ejecucion' end,
      case when v_os.estado='cerrada' then 100 when v_os.fecha_inicio > date '2026-11-04' then 0 else 35 + (n_ot*13)%55 end,
      round(v_os.monto_aprobado*0.62,2),case when v_os.estado='cerrada' then costo else round(costo*0.5,2) end,'PEN',
      case when v_os.estado='cerrada' then v_os.fecha_fin end,'Supervisor de Operaciones',true,
      round(costo*0.42,2),round(costo*0.38,2),round(costo*0.12,2),round(costo*0.08,2),soc,tt,'Cliente_Contrato',
      case when v_os.fecha_inicio <= date '2026-11-04' then v_os.fecha_inicio::timestamp + interval '8 hours' end,
      coalesce((select linea_negocio from cotizaciones where id=v_os.cotizacion_id),'maestranza_fab'),'puntual',v_os.fecha_emision::timestamp,v_os.fecha_emision::timestamp);
    if v_eq is not null then update ordenes_trabajo set direccion_ejecucion = direccion_ejecucion || ' · Equipo ' || (select codigo from activos where id=v_eq) where id=v_ot; end if;
    insert into costos_ot(id,empresa_id,orden_trabajo_id,mano_obra,materiales,servicios_terceros,logistica,otros,total,moneda,calculado_at,created_at)
    select 'cot_ot_demo_'||lpad(n_ot::text,3,'0'),emp,v_ot,round(o.costo_real*0.42,2),round(o.costo_real*0.38,2),round(o.costo_real*0.12,2),round(o.costo_real*0.08,2),0,o.costo_real,'PEN',now(),o.created_at
    from ordenes_trabajo o where o.id=v_ot;
    -- tareas
    for j in 1..4 loop
      insert into ot_tareas(id,empresa_id,ot_id,titulo,tecnico_id,tecnico_nombre,tecnico_tipo,estado,horas_estimadas,horas_reales,avance_pct,completada,completada_en,orden,creado_en)
      select 'ott_demo_'||lpad(n_ot::text,3,'0')||'_'||j,emp,v_ot,
        (array['Inspección inicial y diagnóstico','Desmontaje y limpieza de componentes','Reparación / cambio de componentes','Pruebas de funcionamiento y entrega'])[j],
        p.id,p.nombre,'operativo',
        case when o.avance_pct >= j*25 then 'completada' else 'pendiente' end,
        (array[4,10,16,6])[j],case when o.avance_pct >= j*25 then (array[5,12,19,6])[j] end,
        case when o.avance_pct >= j*25 then 100 else 0 end, o.avance_pct >= j*25,
        case when o.avance_pct >= j*25 then o.fecha_programada::timestamp + ((j*2)||' days')::interval end, j, o.created_at
      from ordenes_trabajo o, personal_operativo p where o.id=v_ot and p.id='po_demo_'||lpad((1+(n_ot+j)%26)::text,3,'0');
    end loop;
  end loop;

  -- OT internas: preventivos y correctivos de la flota propia (EX-07 con fallas repetidas)
  for i in 1..16 loop
    n_ot := n_ot+1; v_ot := 'ot_demo_'||lpad(n_ot::text,3,'0');
    v_eq := case when i in (2,5,8,11,14) then 'act_demo_ex_07' else (array['act_demo_ex_01','act_demo_ex_02','act_demo_ex_03','act_demo_cf_01','act_demo_cf_02','act_demo_cf_03','act_demo_tr_01','act_demo_re_01','act_demo_re_02','act_demo_cb_01','act_demo_mc_01'])[1+i%11] end;
    tt := case when v_eq='act_demo_ex_07' then 'Correctivo' when i%4=0 then 'Correctivo' else 'Preventivo_PM' end;
    d := date '2026-08-05' + i*6;
    costo := case when v_eq='act_demo_ex_07' then 9800 + i*350 when tt='Correctivo' then 4200 + i*120 else 1850 + i*40 end;
    insert into ordenes_trabajo(id,empresa_id,numero,servicio,descripcion,direccion_ejecucion,fecha_programada,hora_inicio,hora_fin,tecnico_responsable_id,estado,avance_pct,costo_estimado,costo_real,moneda,fecha_fin,supervisor,facturable,sociedad_id,tipo_trabajo,cargo_financiero,linea_negocio,tipo_cobro,fecha_inicio_real,created_at,updated_at)
    values (v_ot,emp,'OT-26-'||lpad((700+n_ot)::text,4,'0'),
      case when tt='Preventivo_PM' then 'Mantenimiento preventivo 250 h – ' else 'Correctivo sistema hidráulico – ' end || (select codigo||' '||nombre from activos where id=v_eq),
      case when v_eq='act_demo_ex_07' then 'Fuga en cilindro de brazo / bomba principal con baja presión. Falla recurrente.' else 'Mantenimiento programado de flota propia' end,
      'Taller Ate · Equipo '||(select codigo from activos where id=v_eq),d,'08:00','17:00','po_demo_'||lpad((1+i%12)::text,3,'0'),
      case when d < date '2026-11-01' then 'cerrada' else 'ejecucion' end,case when d < date '2026-11-01' then 100 else 50 end,
      costo,case when d < date '2026-11-01' then costo else round(costo*0.5,2) end,'PEN',case when d < date '2026-11-01' then d+2 end,'Supervisor de Operaciones',false,soc,tt,'Interno_Plataforma','flota_alquileres','puntual',d::timestamp + interval '8 hours',d::timestamp,d::timestamp);
    insert into costos_ot(id,empresa_id,orden_trabajo_id,mano_obra,materiales,servicios_terceros,logistica,otros,total,moneda,calculado_at,created_at)
    select 'cot_ot_demo_'||lpad(n_ot::text,3,'0'),emp,v_ot,round(costo_real*0.35,2),round(costo_real*0.55,2),round(costo_real*0.05,2),round(costo_real*0.05,2),0,costo_real,'PEN',now(),created_at from ordenes_trabajo where id=v_ot;
  end loop;

  -- Salidas de almacén a OT (consumo de repuestos)
  for m in select o.id, o.fecha_programada, row_number() over (order by o.id) rn from ordenes_trabajo o where o.empresa_id=emp and o.estado in ('cerrada','ejecucion') loop
    for j in 1..3 loop
      i := 1 + (m.rn*3 + j*7) % 30;
      if mat[i][7]::numeric < 12 then i := (array[1,2,8,14,15,27,28,29,30])[1 + (m.rn+j)%9]; end if;
      insert into kardex(id,empresa_id,material_id,almacen_id,ubicacion_id,fecha,tipo,cantidad,costo_unitario,costo_total,moneda,referencia_tipo,referencia_id,observacion,sociedad_id,created_at)
      select 'kdx_demo_ot_'||m.rn||'_'||j,emp,'mat_demo_'||lpad(i::text,2,'0'),'alm_demo_ate','ubi_demo_ate_gen',m.fecha_programada::timestamp + interval '10 hours','salida',
        greatest(1, round(mat[i][7]::numeric * 0.06)),mat[i][6]::numeric,greatest(1, round(mat[i][7]::numeric * 0.06))*mat[i][6]::numeric,'PEN','ot',m.id,'Consumo en OT',soc,m.fecha_programada::timestamp + interval '10 hours';
    end loop;
  end loop;

  -- Órdenes de compra, recepción (entrada a almacén) y CxP
  for i in 1..26 loop
    n_oc := n_oc+1; v_oc := 'oc_demo_'||lpad(n_oc::text,3,'0');
    v_prov := (array[1,2,3,4,5,6,7,1,2,3,10,6,4,5,1,2,3,7,1,2,4,5,6,3,1,2])[i];
    j := 1 + (i*7) % 30;
    d := date '2026-08-04' + i*3 + (i%2);
    sub := round(mat[j][6]::numeric * greatest(4, round(mat[j][7]::numeric*0.4)),2); tot := round(sub*1.18,2);
    insert into ordenes_compra(id,empresa_id,codigo,proveedor_id,descripcion,items,subtotal,igv,total,moneda,fecha_emision,fecha_entrega_esperada,estado,porcentaje_recibido,fecha_recepcion_real,lead_time_dias,origen_tipo,condicion_pago,sociedad_id,created_at,updated_at)
    values (v_oc,emp,'OC-2026-'||lpad((4100+n_oc)::text,6,'0'),'prv_demo_'||lpad(v_prov::text,2,'0'),'Reposición de stock: '||mat[j][2],
      jsonb_build_array(jsonb_build_object('codigo',mat[j][1],'unidad',mat[j][3],'cantidad',greatest(4, round(mat[j][7]::numeric*0.4)),'descripcion',mat[j][2],'material_id','mat_demo_'||lpad(j::text,2,'0'),'precio_unitario',mat[j][6]::numeric,'subtotal',sub)),
      sub,tot-sub,tot,'PEN',d,d+7,
      case when d+7 < date '2026-11-02' then 'recibida_total' when d+7 < date '2026-11-10' then 'en_transito' else 'emitida' end,
      case when d+7 < date '2026-11-02' then 100 else 0 end,
      case when d+7 < date '2026-11-02' then d + 6 + (i%4) end, 6 + (i%4),'reposicion',prov[v_prov][3],soc,d::timestamp,d::timestamp);
    if d+7 < date '2026-11-02' then
      insert into kardex(id,empresa_id,material_id,almacen_id,ubicacion_id,fecha,tipo,cantidad,costo_unitario,costo_total,moneda,referencia_tipo,referencia_id,observacion,proveedor_id,nro_documento,orden_compra_id,sociedad_id,created_at)
      values ('kdx_demo_oc_'||n_oc,emp,'mat_demo_'||lpad(j::text,2,'0'),'alm_demo_ate','ubi_demo_ate_gen',(d+6+(i%4))::timestamp + interval '9 hours','entrada',greatest(4, round(mat[j][7]::numeric*0.4)),mat[j][6]::numeric,sub,'PEN','recepcion',v_oc,'Recepción de OC','prv_demo_'||lpad(v_prov::text,2,'0'),'F002-'||(5100+n_oc),v_oc,soc,(d+6+(i%4))::timestamp);
      n_cxp := n_cxp+1; v_cxp := 'cxp_demo_'||lpad(n_cxp::text,3,'0');
      f := (d+6+(i%4)) + case prov[v_prov][3] when '15 días' then 15 when 'Contado' then 0 else 30 end;
      pag := case when f < date '2026-11-03' then tot else 0 end;
      insert into cxp(id,empresa_id,proveedor_id,factura_numero,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado,tipo_beneficiario,concepto,origen,tipo_comprobante,ruc_emisor,nombre_emisor,motivo_cxp,categoria_er,sociedad_id,orden_compra_id,prioridad_pago,created_at)
      values (v_cxp,emp,'prv_demo_'||lpad(v_prov::text,2,'0'),'F002-'||(5100+n_oc),d+6+(i%4),f,tot,pag,tot-pag,'PEN',case when pag=tot then 'pagada' else 'por_pagar' end,'proveedor',
        mat[j][2],'recepcion','Factura',(select ruc from proveedores where id='prv_demo_'||lpad(v_prov::text,2,'0')),prov[v_prov][1],'Compra de materiales','Materiales',soc,v_oc,
        case when f < date '2026-11-15' then 'alta' else 'media' end,(d+6+(i%4))::timestamp);
      if pag > 0 then
        insert into cxp_pagos(id,empresa_id,cxp_id,fecha_pago,monto,cuenta_bancaria_id,cuenta_bancaria,referencia,metodo_pago,creado_en)
        values ('cxpp_demo_'||lpad(n_cxp::text,3,'0'),emp,v_cxp,f,pag,'cb_demo_bcp_pen','BCP Soles Operaciones','TRF-'||(770000+n_cxp*13),'transferencia',f::timestamp);
        insert into movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,referencia,vinculo_tipo,vinculo_id,estado,categoria,es_manual,created_at)
        values ('mt_demo_cxp_'||lpad(n_cxp::text,3,'0'),emp,'egreso','Pago a '||prov[v_prov][1]||' F002-'||(5100+n_oc),pag,'PEN',f,'cb_demo_bcp_pen','TRF-'||(770000+n_cxp*13),'cxp_pago','cxpp_demo_'||lpad(n_cxp::text,3,'0'),'conciliado','Pago a proveedores',false,f::timestamp);
      end if;
    end if;
  end loop;

  -- Gastos operativos recurrentes con su CxP (alquiler, combustible, servicios de terceros)
  for mt in select * from (values
      (8,'Alquiler de local Parque Industrial Ate – agosto',18500.00,12,'Administrativos'),(9,'Alquiler de local Parque Industrial Ate – septiembre',18500.00,12,'Administrativos'),(10,'Alquiler de local Parque Industrial Ate – octubre',18500.00,12,'Administrativos'),(11,'Alquiler de local Parque Industrial Ate – noviembre',18500.00,12,'Administrativos'),
      (8,'Combustible flota – agosto',26400.00,11,'Logistica'),(9,'Combustible flota – septiembre',29800.00,11,'Logistica'),(10,'Combustible flota – octubre',34100.00,11,'Logistica'),
      (8,'Transporte en cama baja de equipos – agosto',12600.00,8,'Servicios terceros'),(9,'Transporte en cama baja de equipos – septiembre',9800.00,8,'Servicios terceros'),(10,'Transporte en cama baja de equipos – octubre',15200.00,8,'Servicios terceros'),
      (9,'Ensayos NDT tolva y estructuras',7400.00,9,'Calidad y pruebas'),(10,'Rebobinado de motor eléctrico 75 HP',6900.00,10,'Servicios terceros'),
      (8,'EPP para personal de taller y campo',8900.00,7,'SSOMA operativo'),(10,'EPP para personal de taller y campo',9300.00,7,'SSOMA operativo')) x(mes,descr,monto,pv,cat) loop
    n_cxp := n_cxp+1; v_cxp := 'cxp_demo_'||lpad(n_cxp::text,3,'0');
    d := make_date(2026,mt.mes,case when mt.mes=11 then 3 else 5 end);
    tot := mt.monto; sub := round(tot/1.18,2);
    f := d + case prov[mt.pv][3] when '15 días' then 15 when 'Contado' then 0 else 30 end;
    pag := case when f < date '2026-11-03' then tot else 0 end;
    insert into compras_gastos(id,empresa_id,tipo,descripcion,categoria,monto,moneda,fecha,origen_registro,estado,estado_pago,cxp_id,sociedad_id,ruc_proveedor,num_comprobante,proveedor_referencia,metodo_pago,created_at)
    values ('cg_demo_'||lpad(n_cxp::text,3,'0'),emp,'gasto',mt.descr,mt.cat,tot,'PEN',d,'backoffice','registrado',case when pag=tot then 'pagado' else 'pendiente' end,v_cxp,soc,
      (select ruc from proveedores where id='prv_demo_'||lpad(mt.pv::text,2,'0')),'F001-'||(8800+n_cxp),prov[mt.pv][1],'transferencia',d::timestamp);
    insert into cxp(id,empresa_id,proveedor_id,factura_numero,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado,tipo_beneficiario,concepto,gasto_id,origen,tipo_comprobante,ruc_emisor,nombre_emisor,motivo_cxp,categoria_er,sociedad_id,prioridad_pago,created_at)
    values (v_cxp,emp,'prv_demo_'||lpad(mt.pv::text,2,'0'),'F001-'||(8800+n_cxp),d,f,tot,pag,tot-pag,'PEN',case when pag=tot then 'pagada' else 'por_pagar' end,'proveedor',mt.descr,'cg_demo_'||lpad(n_cxp::text,3,'0'),'gasto','Factura',
      (select ruc from proveedores where id='prv_demo_'||lpad(mt.pv::text,2,'0')),prov[mt.pv][1],'Gasto operativo',mt.cat,soc,'media',d::timestamp);
    if pag > 0 then
      insert into cxp_pagos(id,empresa_id,cxp_id,fecha_pago,monto,cuenta_bancaria_id,cuenta_bancaria,referencia,metodo_pago,creado_en)
      values ('cxpp_demo_'||lpad(n_cxp::text,3,'0'),emp,v_cxp,f,pag,'cb_demo_bcp_pen','BCP Soles Operaciones','TRF-'||(770000+n_cxp*13),'transferencia',f::timestamp);
      insert into movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,referencia,vinculo_tipo,vinculo_id,estado,categoria,es_manual,gasto_id,created_at)
      values ('mt_demo_cxp_'||lpad(n_cxp::text,3,'0'),emp,'egreso',mt.descr,pag,'PEN',f,'cb_demo_bcp_pen','TRF-'||(770000+n_cxp*13),'cxp_pago','cxpp_demo_'||lpad(n_cxp::text,3,'0'),'conciliado','Pago a proveedores',false,'cg_demo_'||lpad(n_cxp::text,3,'0'),f::timestamp);
    end if;
  end loop;

  -- Stock final por material = suma del kárdex
  insert into stock(empresa_id,material_id,almacen_id,ubicacion_id,disponible,reservado,fisico,sociedad_id,updated_at)
  select emp,k.material_id,'alm_demo_ate','ubi_demo_ate_gen',
    sum(case when k.tipo like '%entrada' then k.cantidad else -k.cantidad end),0,
    sum(case when k.tipo like '%entrada' then k.cantidad else -k.cantidad end),soc,now()
  from kardex k where k.empresa_id=emp group by k.material_id;
  update kardex k set saldo_cantidad = s.saldo from (
    select id, sum(case when tipo like '%entrada' then cantidad else -cantidad end) over (partition by material_id order by fecha, id) saldo from kardex where empresa_id=emp) s
  where k.id=s.id;

  -- Verificación
  if exists (select 1 from stock where empresa_id=emp and disponible < 0) then raise exception 'stock negativo: %', (select string_agg(material_id||'='||disponible,',') from stock where empresa_id=emp and disponible<0); end if;
  if (select count(*) from ordenes_trabajo where empresa_id=emp) < 30 then raise exception 'pocas OT'; end if;
  if exists (select 1 from cxp where empresa_id=emp and saldo < 0) then raise exception 'cxp saldo negativo'; end if;
end $$;
