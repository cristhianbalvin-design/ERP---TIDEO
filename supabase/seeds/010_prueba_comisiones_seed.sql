-- ============================================================
-- SEED TENANT PRUEBA — ESCENARIOS DE COMISIONES
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Corre como postgres (bypassa RLS)
-- ============================================================
DO $$
DECLARE
  v_emp    TEXT;
  v_camilo TEXT := 'pad_camilo_prb';
  v_cri    TEXT := 'pad_cri_prb';
  v_tur    TEXT;
  v_ceco   TEXT;
  v_cta_t  TEXT;  -- TIDEO
  v_cta_m  TEXT;  -- Minera del Sur
  v_cta_p  TEXT;  -- El Pino
BEGIN

  /* 0 ── Tenant PRUEBA */
  SELECT id INTO v_emp FROM public.empresas
  WHERE nombre_comercial ILIKE '%PRUEBA%' OR razon_social ILIKE '%PRUEBA%'
  LIMIT 1;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Tenant PRUEBA no encontrado en public.empresas';
  END IF;
  RAISE NOTICE 'Tenant PRUEBA: %', v_emp;

  /* Turno y CECO (opcionales — pueden ser NULL) */
  SELECT id INTO v_tur  FROM public.turnos         WHERE empresa_id = v_emp ORDER BY created_at LIMIT 1;
  SELECT id INTO v_ceco FROM public.centros_costo  WHERE empresa_id = v_emp AND estado = 'activo' ORDER BY created_at LIMIT 1;

  /* Cuentas */
  SELECT id INTO v_cta_t FROM public.cuentas
  WHERE empresa_id = v_emp AND (razon_social ILIKE '%TIDEO%' OR nombre_comercial ILIKE '%TIDEO%') LIMIT 1;
  SELECT id INTO v_cta_m FROM public.cuentas
  WHERE empresa_id = v_emp AND (razon_social ILIKE '%Minera%' OR nombre_comercial ILIKE '%Minera%') LIMIT 1;
  SELECT id INTO v_cta_p FROM public.cuentas
  WHERE empresa_id = v_emp AND (razon_social ILIKE '%Pino%'  OR nombre_comercial ILIKE '%Pino%')  LIMIT 1;

  IF v_cta_t IS NULL THEN
    v_cta_t := 'cta_tideo_prb';
    INSERT INTO public.cuentas (id, empresa_id, nombre_comercial, razon_social, ruc, tipo, estado)
    VALUES (v_cta_t, v_emp, 'TIDEO', 'TIDEO SAC', '20123456789', 'estrategico', 'activo')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  IF v_cta_m IS NULL THEN
    v_cta_m := 'cta_minera_prb';
    INSERT INTO public.cuentas (id, empresa_id, nombre_comercial, razon_social, ruc, tipo, estado)
    VALUES (v_cta_m, v_emp, 'Minera del Sur', 'Minera del Sur SAC', '20234567890', 'clave', 'activo')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  IF v_cta_p IS NULL THEN
    v_cta_p := 'cta_pino_prb';
    INSERT INTO public.cuentas (id, empresa_id, nombre_comercial, razon_social, ruc, tipo, estado)
    VALUES (v_cta_p, v_emp, 'Inversiones El Pino', 'Inversiones El Pino SAC', '20345678901', 'recurrente', 'activo')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RAISE NOTICE 'Cuentas: TIDEO=%, Minera=%, ElPino=%', v_cta_t, v_cta_m, v_cta_p;

  /* ══════════════════════════════════════════
     1. PERSONAL ADMINISTRATIVO
     ══════════════════════════════════════════ */

  -- Camilo Sinche — Honorarios 3 %
  INSERT INTO public.personal_administrativo (
    id, empresa_id, codigo, nombre, documento,
    cargo, area, telefono, email,
    sueldo_base, moneda, sistema_pensionario,
    fecha_ingreso, turno_id, centro_costo_id,
    tipo_contrato, remuneracion, estado,
    tiene_comisiones, porcentaje_comision, modalidad_comision,
    ruc_vendedor, retencion_ir_comision
  ) VALUES (
    v_camilo, v_emp, 'ADM-CAM-01', 'Camilo Sinche', '45123456',
    'Ejecutivo Comercial', 'Comercial', '+51 987 300 001', 'camilo.sinche@prueba.pe',
    0, 'PEN', 'AFP - Integra',
    '2024-01-01', v_tur, v_ceco,
    'Honorarios', 0, 'activo',
    true, 3.00, 'Honorarios',
    '10456789012', 8.00
  )
  ON CONFLICT (id) DO UPDATE SET
    tiene_comisiones       = true,
    porcentaje_comision    = 3.00,
    modalidad_comision     = 'Honorarios',
    ruc_vendedor           = '10456789012',
    retencion_ir_comision  = 8.00;

  -- Cristhian Balvin — Planilla 2 % S/5,000
  INSERT INTO public.personal_administrativo (
    id, empresa_id, codigo, nombre, documento,
    cargo, area, telefono, email,
    sueldo_base, moneda, sistema_pensionario,
    fecha_ingreso, turno_id, centro_costo_id,
    tipo_contrato, remuneracion, estado,
    tiene_comisiones, porcentaje_comision, modalidad_comision
  ) VALUES (
    v_cri, v_emp, 'ADM-CRI-01', 'Cristhian Balvin', '74123456',
    'Ejecutivo Comercial', 'Comercial', '+51 987 300 002', 'cristhianbalvin@gmail.com',
    5000, 'PEN', 'AFP - Prima',
    '2023-06-01', v_tur, v_ceco,
    'Planilla', 5000, 'activo',
    true, 2.00, 'Planilla'
  )
  ON CONFLICT (id) DO UPDATE SET
    tiene_comisiones    = true,
    porcentaje_comision = 2.00,
    modalidad_comision  = 'Planilla',
    remuneracion        = 5000;

  /* ══════════════════════════════════════════
     SC1: Camilo / Minera del Sur / S/15,000 / Pendiente
     ══════════════════════════════════════════ */
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc1_prb',v_emp,v_cta_m,'Mantenimiento preventivo planta Minera Sur','ganada',100,15000,'PEN','2026-02-28','2026-03-05','Camilo Sinche','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;

  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc1_prb',v_emp,'opp_sc1_prb',v_cta_m,'COT-PRB-001',1,'aceptada','2026-02-20','[]'::jsonb,12711.86,18,2288.14,15000,'PEN')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc1_prb',v_emp,v_cta_m,'cot_sc1_prb','opp_sc1_prb','OS-PRB-001',15000,'PEN','30 dias','2026-03-05','2026-03-10','activo','Mantenimiento preventivo Minera Sur','Camilo Sinche')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real)
  VALUES ('ot_sc1_prb',v_emp,'osc_sc1_prb','OT-PRB-001',v_cta_m,'Mantenimiento Preventivo','Mantenimiento preventivo equipos rotativos planta Minera Sur','cerrado_conforme',100,12000,11800)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc1_prb',v_emp,'osc_sc1_prb','VAL-PRB-001','2026-03-28','Marzo 2026',12711.86,2288.14,15000,'PEN','facturada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc1_prb',v_emp,v_cta_m,'val_sc1_prb','osc_sc1_prb','F001-PRB-001','2026-04-01','2026-05-01',12711.86,2288.14,15000,'PEN','pagada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc1_prb',v_emp,v_cta_m,'fac_sc1_prb','osc_sc1_prb','2026-04-01','2026-05-01',15000,15000,0,'PEN','cobrada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc1_prb',v_emp,'cxc_sc1_prb','fac_sc1_prb',v_cta_m,15000,0,'transferencia','2026-04-15',now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,creado_en)
  VALUES ('com_sc1_prb',v_emp,'cob_sc1_prb','cxc_sc1_prb','fac_sc1_prb','osc_sc1_prb','opp_sc1_prb',v_camilo,'Camilo Sinche',15000,3,450,0,450,'Honorarios','2026-04','pendiente_aprobacion',now())
  ON CONFLICT (id) DO NOTHING;

  /* ══════════════════════════════════════════
     SC2: Camilo / El Pino / S/20,000 / Aprobada + bonif S/300
     ══════════════════════════════════════════ */
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc2_prb',v_emp,v_cta_p,'Instalación eléctrica El Pino','ganada',100,20000,'PEN','2026-02-15','2026-02-20','Camilo Sinche','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;

  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc2_prb',v_emp,'opp_sc2_prb',v_cta_p,'COT-PRB-002',1,'aceptada','2026-02-10','[]'::jsonb,16949.15,18,3050.85,20000,'PEN')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc2_prb',v_emp,v_cta_p,'cot_sc2_prb','opp_sc2_prb','OS-PRB-002',20000,'PEN','30 dias','2026-02-20','2026-02-25','activo','Instalación eléctrica El Pino','Camilo Sinche')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real)
  VALUES ('ot_sc2_prb',v_emp,'osc_sc2_prb','OT-PRB-002',v_cta_p,'Instalación Eléctrica','Tablero eléctrico 220V y cableado estructurado','cerrado_conforme',100,16000,15500)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc2_prb',v_emp,'osc_sc2_prb','VAL-PRB-002','2026-03-20','Marzo 2026',16949.15,3050.85,20000,'PEN','facturada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc2_prb',v_emp,v_cta_p,'val_sc2_prb','osc_sc2_prb','F001-PRB-002','2026-03-25','2026-04-24',16949.15,3050.85,20000,'PEN','pagada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc2_prb',v_emp,v_cta_p,'fac_sc2_prb','osc_sc2_prb','2026-03-25','2026-04-24',20000,20000,0,'PEN','cobrada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc2_prb',v_emp,'cxc_sc2_prb','fac_sc2_prb',v_cta_p,20000,0,'transferencia','2026-04-05',now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,nota_aprobacion,aprobado_por,aprobado_en,creado_en)
  VALUES ('com_sc2_prb',v_emp,'cob_sc2_prb','cxc_sc2_prb','fac_sc2_prb','osc_sc2_prb','opp_sc2_prb',v_camilo,'Camilo Sinche',20000,3,600,300,900,'Honorarios','2026-04','aprobada','Buen cierre en El Pino — bonificación aprobada','Gerencia',now()-interval'5 days',now())
  ON CONFLICT (id) DO NOTHING;

  /* ══════════════════════════════════════════
     SC3: Camilo / TIDEO / S/8,000 / Rechazada
     ══════════════════════════════════════════ */
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc3_prb',v_emp,v_cta_t,'Consultoría de procesos TIDEO','ganada',100,8000,'PEN','2026-03-01','2026-03-08','Camilo Sinche','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;

  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc3_prb',v_emp,'opp_sc3_prb',v_cta_t,'COT-PRB-003',1,'aceptada','2026-02-25','[]'::jsonb,6779.66,18,1220.34,8000,'PEN')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc3_prb',v_emp,v_cta_t,'cot_sc3_prb','opp_sc3_prb','OS-PRB-003',8000,'PEN','15 dias','2026-03-08','2026-03-10','activo','Consultoría procesos TIDEO','Camilo Sinche')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real)
  VALUES ('ot_sc3_prb',v_emp,'osc_sc3_prb','OT-PRB-003',v_cta_t,'Consultoría','Consultoría mejora procesos administrativos','cerrado_conforme',100,6000,5800)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc3_prb',v_emp,'osc_sc3_prb','VAL-PRB-003','2026-03-25','Marzo 2026',6779.66,1220.34,8000,'PEN','facturada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc3_prb',v_emp,v_cta_t,'val_sc3_prb','osc_sc3_prb','F001-PRB-003','2026-03-28','2026-04-12',6779.66,1220.34,8000,'PEN','pagada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc3_prb',v_emp,v_cta_t,'fac_sc3_prb','osc_sc3_prb','2026-03-28','2026-04-12',8000,8000,0,'PEN','cobrada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc3_prb',v_emp,'cxc_sc3_prb','fac_sc3_prb',v_cta_t,8000,0,'transferencia','2026-04-10',now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,motivo_rechazo,creado_en)
  VALUES ('com_sc3_prb',v_emp,'cob_sc3_prb','cxc_sc3_prb','fac_sc3_prb','osc_sc3_prb','opp_sc3_prb',v_camilo,'Camilo Sinche',8000,3,240,0,240,'Honorarios','2026-04','rechazada','Error en asignación de responsable',now())
  ON CONFLICT (id) DO NOTHING;

  /* ══════════════════════════════════════════
     SC4: Camilo / Minera del Sur / S/25,000 / Pagada vía recibo
     ══════════════════════════════════════════ */
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc4_prb',v_emp,v_cta_m,'Overhaul turbina Minera Sur Q1','ganada',100,25000,'PEN','2026-01-31','2026-02-05','Camilo Sinche','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;

  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc4_prb',v_emp,'opp_sc4_prb',v_cta_m,'COT-PRB-004',1,'aceptada','2026-01-25','[]'::jsonb,21186.44,18,3813.56,25000,'PEN')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc4_prb',v_emp,v_cta_m,'cot_sc4_prb','opp_sc4_prb','OS-PRB-004',25000,'PEN','30 dias','2026-02-05','2026-02-10','activo','Overhaul turbina Q1','Camilo Sinche')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real)
  VALUES ('ot_sc4_prb',v_emp,'osc_sc4_prb','OT-PRB-004',v_cta_m,'Overhaul','Overhaul completo turbina de vapor — revisión, limpieza y calibración','cerrado_conforme',100,20000,19200)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc4_prb',v_emp,'osc_sc4_prb','VAL-PRB-004','2026-02-28','Febrero 2026',21186.44,3813.56,25000,'PEN','facturada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc4_prb',v_emp,v_cta_m,'val_sc4_prb','osc_sc4_prb','F001-PRB-004','2026-03-01','2026-03-31',21186.44,3813.56,25000,'PEN','pagada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc4_prb',v_emp,v_cta_m,'fac_sc4_prb','osc_sc4_prb','2026-03-01','2026-03-31',25000,25000,0,'PEN','cobrada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc4_prb',v_emp,'cxc_sc4_prb','fac_sc4_prb',v_cta_m,25000,0,'transferencia','2026-03-28',now())
  ON CONFLICT (id) DO NOTHING;

  -- Comisión primero, luego el recibo la referencia
  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,aprobado_por,aprobado_en,pagado_en,recibo_id,creado_en)
  VALUES ('com_sc4_prb',v_emp,'cob_sc4_prb','cxc_sc4_prb','fac_sc4_prb','osc_sc4_prb','opp_sc4_prb',v_camilo,'Camilo Sinche',25000,3,750,0,750,'Honorarios','2026-03','pagada','Gerencia',now()-interval'30 days',now()-interval'20 days','rec_sc4_prb',now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.recibos_honorarios (id,empresa_id,vendedor_id,vendedor_nombre,vendedor_ruc,periodo,comisiones_ids,monto_bruto,retencion_ir,monto_neto,estado,creado_en)
  VALUES ('rec_sc4_prb',v_emp,v_camilo,'Camilo Sinche','10456789012','2026-03',ARRAY['com_sc4_prb'],750,60,690,'confirmado',now()-interval'20 days')
  ON CONFLICT (id) DO NOTHING;

  -- Egreso Tesorería por el recibo pagado
  INSERT INTO public.movimientos_tesoreria (id,empresa_id,tipo,descripcion,monto,moneda,fecha,categoria,es_manual,estado)
  VALUES ('mov_rec4_prb',v_emp,'egreso','Recibo honorarios Camilo Sinche — Marzo 2026',690,'PEN','2026-04-20','planilla',false,'activo')
  ON CONFLICT (id) DO NOTHING;

  /* ══════════════════════════════════════════
     SC5: Cristhian / El Pino / S/30,000 / Planilla Pendiente
     ══════════════════════════════════════════ */
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc5_prb',v_emp,v_cta_p,'Contrato anual mantenimiento El Pino','ganada',100,30000,'PEN','2026-04-15','2026-04-20','Cristhian Balvin','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;

  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc5_prb',v_emp,'opp_sc5_prb',v_cta_p,'COT-PRB-005',1,'aceptada','2026-04-10','[]'::jsonb,25423.73,18,4576.27,30000,'PEN')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc5_prb',v_emp,v_cta_p,'cot_sc5_prb','opp_sc5_prb','OS-PRB-005',30000,'PEN','30 dias','2026-04-20','2026-04-25','activo','Contrato anual El Pino','Cristhian Balvin')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real)
  VALUES ('ot_sc5_prb',v_emp,'osc_sc5_prb','OT-PRB-005',v_cta_p,'Mantenimiento Integral','Primer entregable contrato anual El Pino','cerrado_conforme',100,22000,21000)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc5_prb',v_emp,'osc_sc5_prb','VAL-PRB-005','2026-04-30','Abril 2026',25423.73,4576.27,30000,'PEN','facturada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc5_prb',v_emp,v_cta_p,'val_sc5_prb','osc_sc5_prb','F001-PRB-005','2026-05-02','2026-06-01',25423.73,4576.27,30000,'PEN','pagada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc5_prb',v_emp,v_cta_p,'fac_sc5_prb','osc_sc5_prb','2026-05-02','2026-06-01',30000,30000,0,'PEN','cobrada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc5_prb',v_emp,'cxc_sc5_prb','fac_sc5_prb',v_cta_p,30000,0,'transferencia','2026-05-10',now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,creado_en)
  VALUES ('com_sc5_prb',v_emp,'cob_sc5_prb','cxc_sc5_prb','fac_sc5_prb','osc_sc5_prb','opp_sc5_prb',v_cri,'Cristhian Balvin',30000,2,600,0,600,'Planilla','2026-05','pendiente_aprobacion',now())
  ON CONFLICT (id) DO NOTHING;

  /* ══════════════════════════════════════════
     SC6: Cristhian / TIDEO / S/18,000 / Planilla Aprobada para nómina
     ══════════════════════════════════════════ */
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc6_prb',v_emp,v_cta_t,'Digitalización procesos TIDEO Admin','ganada',100,18000,'PEN','2026-04-01','2026-04-05','Cristhian Balvin','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;

  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc6_prb',v_emp,'opp_sc6_prb',v_cta_t,'COT-PRB-006',1,'aceptada','2026-03-28','[]'::jsonb,15254.24,18,2745.76,18000,'PEN')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc6_prb',v_emp,v_cta_t,'cot_sc6_prb','opp_sc6_prb','OS-PRB-006',18000,'PEN','30 dias','2026-04-05','2026-04-10','activo','Digitalización TIDEO Admin','Cristhian Balvin')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real)
  VALUES ('ot_sc6_prb',v_emp,'osc_sc6_prb','OT-PRB-006',v_cta_t,'Consultoría Digital','Levantamiento y digitalización flujos administrativos','cerrado_conforme',100,14000,13500)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc6_prb',v_emp,'osc_sc6_prb','VAL-PRB-006','2026-04-28','Abril 2026',15254.24,2745.76,18000,'PEN','facturada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc6_prb',v_emp,v_cta_t,'val_sc6_prb','osc_sc6_prb','F001-PRB-006','2026-05-01','2026-05-31',15254.24,2745.76,18000,'PEN','pagada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc6_prb',v_emp,v_cta_t,'fac_sc6_prb','osc_sc6_prb','2026-05-01','2026-05-31',18000,18000,0,'PEN','cobrada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc6_prb',v_emp,'cxc_sc6_prb','fac_sc6_prb',v_cta_t,18000,0,'transferencia','2026-05-08',now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,nota_aprobacion,aprobado_por,aprobado_en,creado_en)
  VALUES ('com_sc6_prb',v_emp,'cob_sc6_prb','cxc_sc6_prb','fac_sc6_prb','osc_sc6_prb','opp_sc6_prb',v_cri,'Cristhian Balvin',18000,2,360,0,360,'Planilla','2026-05','aprobada','Buen cierre en TIDEO','Gerencia',now()-interval'2 days',now())
  ON CONFLICT (id) DO NOTHING;

  /* ══════════════════════════════════════════
     SC7: Camilo / Minera del Sur / USD 10,000 / Cobro parcial USD 4,000
     ══════════════════════════════════════════ */
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc7_prb',v_emp,v_cta_m,'Suministro especializado USD Minera Sur','ganada',100,10000,'USD','2026-05-10','2026-05-12','Camilo Sinche','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;

  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc7_prb',v_emp,'opp_sc7_prb',v_cta_m,'COT-PRB-007',1,'aceptada','2026-05-05','[]'::jsonb,8474.58,18,1525.42,10000,'USD')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc7_prb',v_emp,v_cta_m,'cot_sc7_prb','opp_sc7_prb','OS-PRB-007',10000,'USD','30 dias','2026-05-12','2026-05-15','activo','Suministro especializado USD','Camilo Sinche')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real)
  VALUES ('ot_sc7_prb',v_emp,'osc_sc7_prb','OT-PRB-007',v_cta_m,'Suministro','Suministro e instalación repuestos importados','cerrado_conforme',100,7500,7200)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc7_prb',v_emp,'osc_sc7_prb','VAL-PRB-007','2026-05-15','Mayo 2026',8474.58,1525.42,10000,'USD','facturada')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc7_prb',v_emp,v_cta_m,'val_sc7_prb','osc_sc7_prb','F001-PRB-007','2026-05-16','2026-06-15',8474.58,1525.42,10000,'USD','emitida')
  ON CONFLICT (id) DO NOTHING;

  -- CxC con cobro parcial — saldo USD 6,000 pendiente
  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc7_prb',v_emp,v_cta_m,'fac_sc7_prb','osc_sc7_prb','2026-05-16','2026-06-15',10000,4000,6000,'USD','cobro_parcial')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc7_prb',v_emp,'cxc_sc7_prb','fac_sc7_prb',v_cta_m,4000,0,'transferencia','2026-05-18',now())
  ON CONFLICT (id) DO NOTHING;

  -- Comisión proporcional sobre USD 4,000 cobrados
  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,creado_en)
  VALUES ('com_sc7_prb',v_emp,'cob_sc7_prb','cxc_sc7_prb','fac_sc7_prb','osc_sc7_prb','opp_sc7_prb',v_camilo,'Camilo Sinche',4000,3,120,0,120,'Honorarios','2026-05','pendiente_aprobacion',now())
  ON CONFLICT (id) DO NOTHING;

  /* ══════════════════════════════════════════
     SC8: Camilo — 2 comisiones aprobadas mes anterior (2026-04) acumuladas
     ══════════════════════════════════════════ */
  -- 8A: S/500 — El Pino
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc8a_prb',v_emp,v_cta_p,'Revisión técnica El Pino Abril','ganada',100,16667,'PEN','2026-04-01','2026-04-05','Camilo Sinche','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;
  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc8a_prb',v_emp,'opp_sc8a_prb',v_cta_p,'COT-PRB-008A',1,'aceptada','2026-03-28','[]'::jsonb,14124.58,18,2542.42,16667,'PEN')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc8a_prb',v_emp,v_cta_p,'cot_sc8a_prb','opp_sc8a_prb','OS-PRB-008A',16667,'PEN','30 dias','2026-04-05','2026-04-07','activo','Revisión técnica El Pino Abril','Camilo Sinche')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc8a_prb',v_emp,'osc_sc8a_prb','VAL-PRB-008A','2026-04-20','Abril 2026',14124.58,2542.42,16667,'PEN','facturada')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc8a_prb',v_emp,v_cta_p,'val_sc8a_prb','osc_sc8a_prb','F001-PRB-008A','2026-04-22','2026-05-22',14124.58,2542.42,16667,'PEN','pagada')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc8a_prb',v_emp,v_cta_p,'fac_sc8a_prb','osc_sc8a_prb','2026-04-22','2026-05-22',16667,16667,0,'PEN','cobrada')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc8a_prb',v_emp,'cxc_sc8a_prb','fac_sc8a_prb',v_cta_p,16667,0,'transferencia','2026-04-25',now()-interval'25 days')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,aprobado_por,aprobado_en,creado_en)
  VALUES ('com_sc8a_prb',v_emp,'cob_sc8a_prb','cxc_sc8a_prb','fac_sc8a_prb','osc_sc8a_prb','opp_sc8a_prb',v_camilo,'Camilo Sinche',16667,3,500,0,500,'Honorarios','2026-04','aprobada','Gerencia',now()-interval'20 days',now()-interval'25 days')
  ON CONFLICT (id) DO NOTHING;

  -- 8B: S/350 — TIDEO
  INSERT INTO public.oportunidades (id,empresa_id,cuenta_id,nombre,etapa,probabilidad,monto_estimado,moneda,fecha_cierre_estimada,fecha_cierre_real,responsable,estado)
  VALUES ('opp_sc8b_prb',v_emp,v_cta_t,'Auditoría técnica TIDEO Abril','ganada',100,11667,'PEN','2026-04-05','2026-04-08','Camilo Sinche','ganada')
  ON CONFLICT (id) DO UPDATE SET responsable = EXCLUDED.responsable;
  INSERT INTO public.cotizaciones (id,empresa_id,oportunidad_id,cuenta_id,numero,version,estado,fecha,items,subtotal,igv_pct,igv,total,moneda)
  VALUES ('cot_sc8b_prb',v_emp,'opp_sc8b_prb',v_cta_t,'COT-PRB-008B',1,'aceptada','2026-04-01','[]'::jsonb,9887.29,18,1779.71,11667,'PEN')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.os_clientes (id,empresa_id,cuenta_id,cotizacion_id,oportunidad_id,numero,monto_aprobado,moneda,condicion_pago,fecha_emision,fecha_inicio,estado,nombre,responsable_comercial)
  VALUES ('osc_sc8b_prb',v_emp,v_cta_t,'cot_sc8b_prb','opp_sc8b_prb','OS-PRB-008B',11667,'PEN','15 dias','2026-04-08','2026-04-10','activo','Auditoría técnica TIDEO Abril','Camilo Sinche')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.valorizaciones (id,empresa_id,os_cliente_id,numero,fecha,periodo,subtotal,igv,total,moneda,estado)
  VALUES ('val_sc8b_prb',v_emp,'osc_sc8b_prb','VAL-PRB-008B','2026-04-25','Abril 2026',9887.29,1779.71,11667,'PEN','facturada')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.facturas (id,empresa_id,cuenta_id,valorizacion_id,os_cliente_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_sc8b_prb',v_emp,v_cta_t,'val_sc8b_prb','osc_sc8b_prb','F001-PRB-008B','2026-04-26','2026-05-11',9887.29,1779.71,11667,'PEN','pagada')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,os_cliente_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_sc8b_prb',v_emp,v_cta_t,'fac_sc8b_prb','osc_sc8b_prb','2026-04-26','2026-05-11',11667,11667,0,'PEN','cobrada')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.cobros_cxc (id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,fecha_cobro,creado_en)
  VALUES ('cob_sc8b_prb',v_emp,'cxc_sc8b_prb','fac_sc8b_prb',v_cta_t,11667,0,'transferencia','2026-04-28',now()-interval'21 days')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.comisiones (id,empresa_id,cobro_cxc_id,cxc_id,factura_id,os_cliente_id,oportunidad_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,aprobado_por,aprobado_en,creado_en)
  VALUES ('com_sc8b_prb',v_emp,'cob_sc8b_prb','cxc_sc8b_prb','fac_sc8b_prb','osc_sc8b_prb','opp_sc8b_prb',v_camilo,'Camilo Sinche',11667,3,350,0,350,'Honorarios','2026-04','aprobada','Gerencia',now()-interval'18 days',now()-interval'21 days')
  ON CONFLICT (id) DO NOTHING;

  /* ══════════════════════════════════════════
     DATOS ADICIONALES
     ══════════════════════════════════════════ */

  -- 3 Leads
  INSERT INTO public.leads (id,empresa_id,nombre_contacto,empresa_nombre,industria,telefono,email,fuente,estado)
  VALUES
    ('lead_a_prb',v_emp,'Roberto Quispe','Constructora Andina SAC','Construcción','+51 987 400 001','r.quispe@constructora.pe','Referido','nuevo'),
    ('lead_b_prb',v_emp,'María Condori','Transportes del Norte EIRL','Transporte','+51 987 400 002','m.condori@transnorte.pe','Web','en_contacto'),
    ('lead_c_prb',v_emp,'Jorge Huanca','Servicios Industriales Perú SA','Industrial','+51 987 400 003','j.huanca@sipsa.pe','LinkedIn','calificado')
  ON CONFLICT (id) DO NOTHING;

  -- OT Programada con técnico (usa osc_sc5_prb que ya existe)
  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real,fecha_programada)
  VALUES ('ot_prog_prb',v_emp,'osc_sc5_prb','OT-PRB-P01',v_cta_p,'Mantenimiento Correctivo','Reparación bomba hidráulica unidad 3','programada',0,5500,0,'2026-05-25')
  ON CONFLICT (id) DO NOTHING;

  -- OT En ejecución
  INSERT INTO public.ordenes_trabajo (id,empresa_id,os_cliente_id,numero,cuenta_id,servicio,descripcion,estado,avance_pct,costo_estimado,costo_real)
  VALUES ('ot_exec_prb',v_emp,'osc_sc1_prb','OT-PRB-E01',v_cta_m,'Mantenimiento Preventivo','Revisión y lubricación sistema correas transportadoras','ejecucion',45,8000,0)
  ON CONFLICT (id) DO NOTHING;

  -- 2 Partes aprobados de la OT en ejecución
  INSERT INTO public.partes_diarios (id,empresa_id,orden_trabajo_id,fecha,horas_normales,actividad,avance_pct,materiales,estado)
  VALUES
    ('part_a_prb',v_emp,'ot_exec_prb','2026-05-17',8,'Inspección inicial y desmontaje de guardas. Revisión de tensión de correas.',20,'[]'::jsonb,'aprobado'),
    ('part_b_prb',v_emp,'ot_exec_prb','2026-05-18',8,'Lubricación de rodamientos y ajuste de alineación. Pruebas en vacío.',25,'[{"nombre":"Grasa EP-2","cantidad":2,"unidad":"kg"}]'::jsonb,'aprobado')
  ON CONFLICT (id) DO NOTHING;

  -- Factura y CxC vencida (15 días de mora a la fecha 2026-05-19)
  INSERT INTO public.facturas (id,empresa_id,cuenta_id,numero,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado)
  VALUES ('fac_venc_prb',v_emp,v_cta_p,'F001-PRB-VENC','2026-04-01','2026-05-01',12711.86,2288.14,15000,'PEN','emitida')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cxc (id,empresa_id,cuenta_id,factura_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado)
  VALUES ('cxc_venc_prb',v_emp,v_cta_p,'fac_venc_prb','2026-04-01','2026-05-01',15000,0,15000,'PEN','por_cobrar')
  ON CONFLICT (id) DO NOTHING;

  -- Gestión de cobranza sobre la CxC vencida
  INSERT INTO public.gestion_cobranza (id,empresa_id,cxc_id,tipo_gestion,resultado,fecha_gestion,fecha_proxima_accion,notas,usuario,creado_en)
  VALUES ('gest_prb',v_emp,'cxc_venc_prb','llamada','sin_respuesta','2026-05-12','2026-05-19','Se intentó contactar al responsable financiero. No contestó. Se dejó mensaje de voz solicitando confirmar fecha de pago.','cristhianbalvin@gmail.com',now())
  ON CONFLICT (id) DO NOTHING;

  -- 2 Movimientos manuales Tesorería
  INSERT INTO public.movimientos_tesoreria (id,empresa_id,tipo,descripcion,monto,moneda,fecha,categoria,es_manual,estado)
  VALUES
    ('mov_ing_prb',v_emp,'ingreso','Anticipo de cliente Minera del Sur — OS PRB-001',5000,'PEN','2026-05-05','anticipo_cliente',true,'activo'),
    ('mov_egr_prb',v_emp,'egreso','Combustible unidades de campo — Mayo 2026',1200,'PEN','2026-05-10','gasto_operativo',true,'activo')
  ON CONFLICT (id) DO NOTHING;

  -- Período nómina Mayo 2026 — calculado sin cerrar
  -- (estado calculado, incluye comisión Planilla de Cristhian S/360)
  INSERT INTO public.periodos_nomina (id,empresa_id,periodo,fecha_inicio,fecha_fin,total_trabajadores,masa_salarial_bruta,total_neto,total_cargas_empresa,moneda,estado)
  VALUES ('pnm_prb_2026_05',v_emp,'2026-05','2026-05-01','2026-05-31',2,5360,4556,481,'PEN','calculado')
  ON CONFLICT (id) DO UPDATE SET estado = 'calculado';

  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE '✓ Seed PRUEBA completado — empresa: %', v_emp;
  RAISE NOTICE '  Camilo Sinche     : % (Honorarios 3%%)', v_camilo;
  RAISE NOTICE '  Cristhian Balvin  : % (Planilla 2%%)', v_cri;
  RAISE NOTICE '  TIDEO=%  Minera=%  ElPino=%', v_cta_t, v_cta_m, v_cta_p;
  RAISE NOTICE '  Escenarios 1-8 creados + datos adicionales';
  RAISE NOTICE '══════════════════════════════════════════════';
END;
$$;
