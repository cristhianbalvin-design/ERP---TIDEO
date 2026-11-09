-- Demo PRUEBA (emp_2000000000) · 01 Maestros y Comercial
-- Empresa ficticia: Andes Industrial Services S.A.C. (mantenimiento, flota y taller para minería y construcción)
-- Historia: 2026-08-08 a 2026-11-08. Todos los IDs llevan "demo" para poder identificarlos.
do $$
declare
  emp text := 'emp_2000000000';
  soc uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  soc2 uuid := 'b03f3bda-d4be-4acb-891c-07f36b731fd5';
  v_carlos uuid := 'b320c342-b5a8-4d0d-9871-6cd31d4fdcba';
  v_daniel uuid := 'd39afc5c-3a6b-400e-8af3-322713cce54d';
  cli text[][] := array[
    -- nombre comercial, razón social, industria, tamaño, condición pago (días), segmento
    ['Minera Cordillera Azul','Minera Cordillera Azul S.A.A.','Minería','grande','45'],
    ['Minera Huaytapallana','Compañía Minera Huaytapallana S.A.','Minería','grande','60'],
    ['Constructora Pacífico Sur','Constructora Pacífico Sur S.A.C.','Construcción','mediana','30'],
    ['Consorcio Vial Los Andes','Consorcio Vial Los Andes','Construcción','grande','45'],
    ['Cementos Altiplano','Cementos Altiplano S.A.A.','Cemento','grande','30'],
    ['Agroindustrial Valle Norte','Agroindustrial Valle Norte S.A.C.','Agroindustria','mediana','30'],
    ['Interoceánica Cargo','Transportes Interoceánica Cargo S.A.C.','Transporte','mediana','15'],
    ['Pesquera Mar de Grau','Pesquera Mar de Grau S.A.','Pesca','mediana','30'],
    ['Hidroandina del Centro','Energía Hidroandina del Centro S.A.','Energía','grande','45'],
    ['Minera Santa Lucía','Minera Santa Lucía de Áncash S.A.C.','Minería','mediana','30'],
    ['Inca Ingenieros','Obras Civiles Inca Ingenieros S.A.C.','Construcción','pequena','15'],
    ['Petroquímica del Sur','Petroquímica del Sur S.A.','Industria','grande','60'],
    ['Agregados Lima Norte','Agregados Lima Norte S.A.C.','Construcción','pequena','15'],
    ['Metalmecánica Chavín','Metalmecánica Chavín S.A.C.','Metalmecánica','pequena','30']];
  contactos_n text[] := array['Ing. Ricardo Salazar','Lic. Mariela Quispe','Ing. Jorge Huamán','Ing. Patricia Rojas','Ing. Luis Paredes','Ing. Carmen Villanueva','Sr. Miguel Torres','Ing. Rosa Mendoza','Ing. Fernando Castillo','Ing. Gabriela Ramos','Sr. Víctor Chávez','Ing. Silvia Flores','Sr. Óscar Gutiérrez','Ing. Diana Cárdenas'];
  contactos_c text[] := array['Superintendente de Mantenimiento','Jefa de Compras','Gerente de Equipos','Jefa de Logística','Jefe de Planta','Gerente de Operaciones','Jefe de Flota','Jefa de Mantenimiento','Superintendente de Equipos','Jefa de Abastecimiento','Gerente General','Jefa de Confiabilidad','Administrador de Obra','Jefa de Producción'];
  serv text[][] := array[
    -- descripción, línea de negocio, tipo ejecución, precio base PEN
    ['Mantenimiento preventivo 500 h excavadora CAT 336','flota_alquileres','mantenimiento','8500'],
    ['Overhaul de motor diésel Komatsu SAA6D125','maestranza_fab','mantenimiento','68000'],
    ['Reparación de sistema hidráulico cargador frontal 966H','maestranza_fab','mantenimiento','24500'],
    ['Alquiler mensual de excavadora 30 t con operador','flota_alquileres','mantenimiento','42000'],
    ['Fabricación de cucharón reforzado 3.5 m³','maestranza_fab','fabricacion','36500'],
    ['Reconstrucción de tren de rodamiento tractor D8T','maestranza_fab','mantenimiento','52000'],
    ['Venta de kit de filtros y repuestos de servicio','venta_repuestos','mantenimiento','6800'],
    ['Transporte de equipo pesado en cama baja Lima–Cerro de Pasco','transporte_comercial','mantenimiento','9800'],
    ['Inspección estructural y ensayos no destructivos de tolva','maestranza_fab','mantenimiento','14200'],
    ['Alquiler mensual de cargador frontal 966H','flota_alquileres','mantenimiento','31000'],
    ['Fabricación de plataforma de mantenimiento para camiones mineros','maestranza_fab','fabricacion','47800'],
    ['Mantenimiento correctivo de transmisión camión 777F','maestranza_fab','mantenimiento','58500']];
  i int; j int; k int; n int;
  d date; v_cta text; v_opp text; v_cot text; v_os text; v_fac text; v_cxc text;
  etapa text; est text; prob numeric; monto numeric; sub numeric; igv numeric; tot numeric;
  s int; resp uuid; resp_n text; venc date; pagado numeric; cpago int; fcobro date;
  nfac int := 1; ncot int := 1; nos int := 1; nopp int := 1;
begin
  perform setseed(0.42);
  set local session_replication_role = replica;

  -- Sociedades con identidad de la demo
  update sociedades set nombre='Andes Industrial Services', razon_social='Andes Industrial Services S.A.C.', ruc='20999000101',
    direccion_fiscal='Av. Industrial 1450, Ate, Lima', es_principal=true where id=soc;
  update sociedades set nombre='Andes Rental & Logistics', razon_social='Andes Rental & Logistics S.A.C.', ruc='20999000102',
    direccion_fiscal='Panamericana Norte km 22.5, Puente Piedra, Lima', es_principal=false where id=soc2;

  -- Cuentas bancarias
  insert into cuentas_bancarias(id,empresa_id,nombre,banco,numero_cuenta,cci,moneda,tipo,estado,saldo_inicial,fecha_saldo_inicial,sociedad_id,es_cuenta_detracciones) values
   ('cb_demo_bcp_pen',emp,'BCP Soles Operaciones','BCP','193-2045871-0-55','00219300204587105512','PEN','corriente','activo',385000,'2026-08-01',soc,false),
   ('cb_demo_bbva_usd',emp,'BBVA Dólares','BBVA','0011-0198-0100045872','01119800010004587211','USD','corriente','activo',62000,'2026-08-01',soc,false),
   ('cb_demo_ibk_pen',emp,'Interbank Soles Recaudación','Interbank','200-3001458796','00320000300145879631','PEN','corriente','activo',148000,'2026-08-01',soc,false),
   ('cb_demo_bn_det',emp,'Banco de la Nación Detracciones','Banco de la Nación','00-045-871236',null,'PEN','detracciones','activo',18500,'2026-08-01',soc,true);

  -- Clientes y contactos
  for i in 1..14 loop
    v_cta := 'cta_demo_'||lpad(i::text,2,'0');
    insert into cuentas(id,empresa_id,nombre_comercial,razon_social,ruc,tipo,industria,responsable_id,condicion_pago,limite_credito,moneda,riesgo_financiero,estado,tamano,telefono,email,direccion,responsable_comercial,fuente_origen,health_score,tipo_documento,created_at)
    values (v_cta,emp,cli[i][1],cli[i][2],'2099911'||lpad((1000+i*37)::text,4,'0'),'cliente',cli[i][3],
      case when i%2=0 then v_daniel else v_carlos end, cli[i][5]||' días',
      case cli[i][4] when 'grande' then 600000 when 'mediana' then 250000 else 90000 end,'PEN',
      case when i=3 then 'alto' when i in (7,11) then 'medio' else 'bajo' end,'activo',cli[i][4],
      '01 '||(4000000+i*1373)::text,'compras@'||lower(replace(replace(cli[i][1],' ',''),'í','i'))||'.pe','Lima, Perú',
      case when i%2=0 then 'Daniel Martínez' else 'Carlos Gonzales' end,
      (array['Referido','LinkedIn','Feria Perumin','Formulario web'])[1+i%4],
      case when i=3 then 48 when i=1 then 62 else 70+(i*3)%25 end,'RUC', timestamp '2026-06-01' + (i||' days')::interval);
    insert into contactos(id,empresa_id,cuenta_id,nombre,cargo,telefono,email,es_principal,estado)
    values ('con_demo_'||lpad(i::text,2,'0'),emp,v_cta,contactos_n[i],contactos_c[i],'9'||(80000000+i*7919)::text,
      lower(split_part(contactos_n[i],' ',2))||'@'||lower(replace(replace(cli[i][1],' ',''),'í','i'))||'.pe',true,'activo');
  end loop;

  -- Leads (prospectos aún no convertidos)
  insert into leads(id,empresa_id,nombre_contacto,empresa_nombre,razon_social,numero_documento,industria,telefono,email,fuente,responsable_id,necesidad,presupuesto_estimado,moneda,estado,cargo,urgencia,tipo_documento,fecha_creacion,created_at)
  select 'lead_demo_'||lpad(g::text,2,'0'),emp,
    (array['Ing. Alberto Ríos','Lic. Karina Soto','Ing. Raúl Medina','Ing. Lucía Herrera','Sr. Pablo Navarro','Ing. Teresa Vega','Ing. Martín Aguirre','Lic. Sofía León','Ing. Hugo Ponce','Ing. Elena Campos','Sr. Iván Salas','Ing. Norma Bustamante'])[g],
    (array['Minera Los Quenuales','Constructora Huallaga','Canteras del Rímac','Minera Tres Cruces Norte','Transportes Andinos Unidos','Agrícola Chao','Cemento Selva Central','Minera Condorcocha','Puerto Logístico Callao Sur','Hidroeléctrica Mantaro Alto','Aserradero Ucayali','Minera Pampa Grande'])[g],
    null,null,(array['Minería','Construcción','Construcción','Minería','Transporte','Agroindustria','Cemento','Minería','Logística','Energía','Forestal','Minería'])[g],
    '9'||(70000000+g*9133)::text,'contacto'||g||'@prospecto-demo.pe',
    (array['Feria Perumin','LinkedIn','Referido','Formulario web'])[1+g%4],
    case when g%2=0 then v_daniel else v_carlos end,
    (array['Alquiler de flota por campaña','Overhaul de componentes','Mantenimiento de equipos de cantera','Contrato marco de mantenimiento','Transporte de equipo pesado','Mantenimiento de tractores','Reparación de hornos y fajas','Fabricación de estructuras','Servicio de grúas y montacargas','Mantenimiento de compuertas','Repuestos para cargadores','Alquiler de camiones'])[g],
    (20000+g*15500)::numeric,'PEN',
    case when g<=7 then 'nuevo' when g<=10 then 'contactado' else 'descartado' end,
    'Jefatura de Mantenimiento',(array['alta','media','baja'])[1+g%3],'RUC',
    date '2026-08-10' + (g*7),
    timestamp '2026-08-10' + ((g*7)||' days')::interval
  from generate_series(1,12) g;

  -- Oportunidades, cotizaciones, OS, facturas, CxC y cobros
  for i in 1..44 loop
    j := 1 + ((i*3) % 14);              -- cliente
    if i in (2,5,9,13,17,20) then j := 1; end if;  -- Cordillera Azul fue el mayor cliente en ago-set
    -- Minera Cordillera Azul (1) deja de comprar desde octubre: sus oportunidades se concentran en agosto-setiembre
    if j = 1 and i > 24 then j := 9; end if;
    k := 1 + ((i*5) % 12);              -- servicio
    d := date '2026-08-08' + ((i-1) * 2) + (i % 3);
    if d > date '2026-11-05' then d := date '2026-11-05'; end if;
    resp := case when j%2=0 then v_daniel else v_carlos end;
    resp_n := case when j%2=0 then 'Daniel Martínez' else 'Carlos Gonzales' end;
    monto := round((serv[k][4]::numeric) * (0.85 + random()*0.5)::numeric, -2);
    -- etapa según antigüedad
    if d < date '2026-09-20' then
      etapa := case when i%5=0 then 'perdida' else 'ganada' end;
    elsif d < date '2026-10-20' then
      etapa := (array['ganada','ganada','negociacion','perdida','ganada','propuesta'])[1+i%6];
    else
      etapa := (array['calificacion','propuesta','negociacion','propuesta'])[1+i%4];
    end if;
    est := case etapa when 'ganada' then 'ganada' when 'perdida' then 'perdida' else 'abierta' end;
    prob := case etapa when 'calificacion' then 20 when 'propuesta' then 40 when 'negociacion' then 70 when 'ganada' then 100 else 0 end;
    v_cta := 'cta_demo_'||lpad(j::text,2,'0');
    v_opp := 'opp_demo_'||lpad(i::text,3,'0');
    insert into oportunidades(id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,responsable_id,estado,motivo_perdida,contacto_id,servicio_interes,fecha_cierre_real,fecha_creacion,forecast_ponderado,fuente,responsable,competidor,linea_negocio,created_at,updated_at)
    values (v_opp,emp,v_cta,serv[k][1]||' · '||cli[j][1],etapa,prob,monto,'PEN',d+20,resp,est,
      case when etapa='perdida' then (array['Precio más alto que la competencia','Plazo de entrega','El cliente postergó la inversión'])[1+i%3] end,
      'con_demo_'||lpad(j::text,2,'0'),serv[k][1],case when est<>'abierta' then d+12 end,d,round(monto*prob/100,2),
      (array['Referido','LinkedIn','Feria Perumin','Cliente recurrente'])[1+i%4],resp_n,
      case when etapa='perdida' then (array['Maquinarias del Norte','Servitec Andino','Taller local'])[1+i%3] end,
      serv[k][2], d::timestamp + interval '9 hours', d::timestamp + interval '9 hours');

    if etapa in ('calificacion') then continue; end if;

    -- Cotización
    sub := monto; igv := round(sub*0.18,2); tot := sub+igv;
    v_cot := 'cot_demo_'||lpad(ncot::text,3,'0');
    insert into cotizaciones(id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,base_imponible,igv_pct,igv,total,moneda,condicion_pago,contacto_id,descripcion_general,validez_tipo,validez_dias,centro_beneficio_id,responsable_id,sociedad_id,linea_negocio,tipo_ejecucion,fecha_envio,created_at,updated_at)
    values (v_cot,emp,v_opp,v_cta,'COT-2026-'||lpad((300+ncot)::text,4,'0'),1,
      case when etapa='ganada' then 'convertida' when etapa='perdida' then 'perdida' when etapa='negociacion' then 'enviada' else 'borrador' end,
      d+3,
      jsonb_build_array(jsonb_build_object('n',1,'id',ncot,'tipo','servicio','descripcion',serv[k][1],'cantidad',1,'precio_unitario',round(sub*0.82,2),'total',round(sub*0.82,2),'incluido',false,'detalle_items','[]'::jsonb,'detalle_cantidad',''),
                        jsonb_build_object('n',2,'id',ncot*10,'tipo','material','descripcion','Repuestos y consumibles','cantidad',1,'precio_unitario',round(sub*0.18,2),'total',round(sub*0.18,2),'incluido',false,'detalle_items','[]'::jsonb,'detalle_cantidad','')),
      sub,sub,18,igv,tot,'PEN',cli[j][5]||' días','con_demo_'||lpad(j::text,2,'0'),
      'Servicio para '||cli[j][2]||'. Incluye mano de obra especializada, repuestos y pruebas de funcionamiento.',
      'dias',15,null,resp,soc,serv[k][2],serv[k][3],(d+3)::timestamp + interval '15 hours',(d+2)::timestamp,(d+3)::timestamp);
    ncot := ncot+1;

    if etapa <> 'ganada' then continue; end if;

    -- Orden de servicio del cliente
    v_os := 'os_demo_'||lpad(nos::text,3,'0');
    cpago := cli[j][5]::int;
    insert into os_clientes(id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,numero_doc_cliente,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,fecha_fin,estado,saldo_por_ejecutar,saldo_por_facturar,monto_facturado,monto_cobrado,nombre,responsable_comercial,contacto_id,sociedad_id,tipo_cobro,tipo_ejecucion,estado_produccion,created_at,updated_at)
    values (v_os,emp,v_cta,v_cot,v_opp,'OS-2026-'||lpad((150+nos)::text,4,'0'),'OC-'||(4500000+nos*311)::text,sub,'PEN',cpago||' días',
      d+8,d+10,d+30,
      case when d+30 < date '2026-10-25' then 'cerrada' else 'en_ejecucion' end,
      case when d+30 < date '2026-10-25' then 0 else round(sub*0.4,2) end,0,0,0,
      serv[k][1],resp_n,'con_demo_'||lpad(j::text,2,'0'),soc,'puntual',serv[k][3],
      case when d+30 < date '2026-10-25' then 'Entregado' else 'Proceso' end,
      (d+8)::timestamp,(d+8)::timestamp);
    nos := nos+1;

    -- Factura solo si el servicio ya se ejecutó (terminado antes de hoy)
    if d+28 > date '2026-11-07' then continue; end if;
    v_fac := 'fac_demo_'||lpad(nfac::text,3,'0');
    venc := (d+28) + cpago;
    -- Cobro: Pacífico Sur (3) moroso; otros pagan según condición si ya venció
    if j = 3 then pagado := 0;
    elsif venc <= date '2026-11-08' then pagado := case when i%9=0 then round(tot*0.5,2) else tot end;
    else pagado := 0; end if;
    insert into facturas(id,empresa_id,cuenta_id,numero,fecha_emision,subtotal,igv,total,moneda,estado,tipo_documento,glosa,condicion_pago,fecha_vencimiento,os_cliente_id,items,monto_neto_cobrable,sociedad_id,created_at,updated_at)
    values (v_fac,emp,v_cta,'F001-'||lpad((2300+nfac)::text,8,'0'),d+28,sub,igv,tot,'PEN',
      case when pagado=tot then 'pagada' when pagado>0 then 'cobro_parcial' else 'emitida' end,'factura',
      serv[k][1]||' – OS '||'OS-2026-'||lpad((150+nos-1)::text,4,'0'),cpago||' días',venc,v_os,
      jsonb_build_array(jsonb_build_object('descripcion',serv[k][1],'cantidad',1,'precio_unitario',sub,'total',sub)),
      tot,soc,(d+28)::timestamp,(d+28)::timestamp);
    v_cxc := 'cxc_demo_'||lpad(nfac::text,3,'0');
    insert into cxc(id,empresa_id,cuenta_id,factura_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado,glosa,condicion_pago,os_cliente_id,sociedad_id,created_at,updated_at)
    values (v_cxc,emp,v_cta,v_fac,d+28,venc,tot,pagado,tot-pagado,'PEN',
      case when pagado=tot then 'cobrada' when pagado>0 then 'cobro_parcial' when venc < date '2026-11-08' then 'vencida' else 'por_cobrar' end,
      serv[k][1],cpago||' días',v_os,soc,(d+28)::timestamp,(d+28)::timestamp);
    if pagado > 0 then
      fcobro := least(venc - (i%5), date '2026-11-07');
      insert into cobros_cxc(id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,medio_pago,cuenta_bancaria,numero_operacion,fecha_cobro,notas,registrado_por,creado_en)
      values ('cob_demo_'||lpad(nfac::text,3,'0'),emp,v_cxc,v_fac,v_cta,pagado,'Transferencia bancaria','cb_demo_bcp_pen',(880000+nfac*17)::text,fcobro,null,null,fcobro::timestamp);
      insert into movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,referencia,vinculo_tipo,vinculo_id,estado,categoria,es_manual,created_at)
      values ('mt_demo_cob_'||lpad(nfac::text,3,'0'),emp,'ingreso','Cobro factura F001-'||lpad((2300+nfac)::text,8,'0')||' · '||cli[j][1],pagado,'PEN',fcobro,'cb_demo_bcp_pen',(880000+nfac*17)::text,'cobro_cxc','cob_demo_'||lpad(nfac::text,3,'0'),'conciliado','Cobranza clientes',false,fcobro::timestamp);
    end if;
    update os_clientes set monto_facturado=tot, monto_cobrado=pagado, saldo_por_facturar=0 where id=v_os;
    nfac := nfac+1;
  end loop;

  -- Saldos de CxC y última compra en la ficha del cliente
  update cuentas c set saldo_cxc = coalesce((select sum(saldo) from cxc where cuenta_id=c.id),0),
    fecha_ultima_compra = (select max(fecha_emision) from facturas where cuenta_id=c.id)
  where empresa_id=emp and id like 'cta_demo_%';

  -- Verificación
  if (select count(*) from cuentas where empresa_id=emp) <> 14 then raise exception 'cuentas: esperado 14'; end if;
  if (select count(*) from facturas where empresa_id=emp) < 12 then raise exception 'facturas insuficientes'; end if;
  if exists (select 1 from cxc where empresa_id=emp and saldo < 0) then raise exception 'saldo negativo en cxc'; end if;
end $$;
