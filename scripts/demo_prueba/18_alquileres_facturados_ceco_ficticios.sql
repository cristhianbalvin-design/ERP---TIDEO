-- Demo PRUEBA · 18 Alquileres de flota facturados (ago–oct), tarifas realistas y catálogo de CECO sin clientes reales (2026-11-08)
-- Aprobado por Cristhian: "realiza tus recomendaciones" (opción a).
-- El Estado de Resultados solo cuenta facturas como ingreso: las liquidaciones de alquiler de Andes Rental & Logistics
-- no estaban facturadas. Se ajustan tarifas por hora a valores de mercado, se liquidan ago–oct y se emite una factura
-- por liquidación (fecha = cierre del mes), con su CxC y, si ya venció, su cobro.
do $$
declare
  v_emp constant text := 'emp_2000000000';
  v_arl constant uuid := 'b03f3bda-d4be-4acb-891c-07f36b731fd5';
  v_usr constant uuid := 'ae6bc722-85c7-4816-a830-c350d2a3d0b5';
  v_cebe constant text := 'cebe_76a7683a1d3743adb9';   -- CEBE-002 Alquiler de flota
  v_cb constant text := 'cb_demo_bcp_arl';
  r record;
  li record;
  v_items jsonb;
  v_n int := 0;
  v_fac text; v_cxc text; v_num text;
  v_fecha date; v_venc date; v_dias int;
  v_sub numeric; v_igv numeric; v_tot numeric;
  v_pagado boolean;
  v_mes text;
  n int;
begin
  -- 1. Tarifas por hora de mercado (con operador)
  update contratos_alquiler_equipos e set tarifa_hora_override = t.tarifa
  from activos a,
       (values ('EX-01', 110), ('EX-02', 110), ('EX-03', 110), ('CF-02', 95), ('CF-03', 95),
               ('TR-01', 150), ('RE-01', 70), ('RE-02', 70)) t(codigo, tarifa)
  where a.id = e.equipo_id and a.codigo = t.codigo and a.empresa_id = v_emp;
  get diagnostics n = row_count;
  if n <> 8 then raise exception 'se esperaban 8 tarifas y se actualizaron %', n; end if;

  -- 2. Liquidaciones de agosto (CA-2026-009, 011 y 012)
  update flota_liquidaciones set numero = 'TMP-' || numero where empresa_id = v_emp;
  insert into flota_liquidaciones (empresa_id, sociedad_id, numero, contrato_alquiler_id, periodo, moneda, meta_dmr, created_by, created_at, updated_at)
  select v_emp, c.sociedad_id, 'TMP-AGO-' || c.numero, c.id, date '2026-08-01', c.moneda, c.meta_dmr, v_usr,
         timestamp '2026-08-31 18:00', timestamp '2026-08-31 18:00'
  from contratos_alquiler c
  where c.empresa_id = v_emp and c.numero in ('CA-2026-009', 'CA-2026-011', 'CA-2026-012')
    and not exists (select 1 from flota_liquidaciones l where l.contrato_alquiler_id = c.id and l.periodo = date '2026-08-01' and l.estado <> 'anulada');

  -- Recalcular todas con las tarifas nuevas, numerar en orden cronológico y dejarlas aprobadas al cierre de cada mes
  for r in select l.id, l.periodo, row_number() over (order by l.periodo, c.numero) rn
           from flota_liquidaciones l join contratos_alquiler c on c.id = l.contrato_alquiler_id
           where l.empresa_id = v_emp and l.estado <> 'anulada' loop
    perform public.flota__calcular_liquidacion(r.id);
    v_fecha := (r.periodo + interval '1 month' - interval '1 day')::date;
    update flota_liquidaciones set
      numero = 'LIQ-26-' || lpad(r.rn::text, 4, '0'), estado = 'aprobada',
      enviada_at = v_fecha + time '10:00', enviada_por = v_usr,
      aprobada_at = v_fecha + time '16:30', aprobada_por = v_usr,
      devuelta_motivo = null, calculado_at = v_fecha + time '09:00', updated_at = v_fecha + time '16:30'
    where id = r.id;
  end loop;
  if exists (select 1 from flota_liquidaciones where empresa_id = v_emp and (numero like 'TMP-%' or dias_faltantes > 0)) then
    raise exception 'liquidaciones sin numerar o con partes faltantes';
  end if;

  -- 3. Cuenta bancaria de Andes Rental & Logistics
  insert into cuentas_bancarias (id, empresa_id, sociedad_id, nombre, banco, tipo, moneda, numero_cuenta, cci, saldo_inicial, fecha_saldo_inicial, estado, es_cuenta_detracciones, creado_en)
  values (v_cb, v_emp, v_arl, 'Soles Rental', 'BCP', 'corriente', 'PEN', '194-2871034-0-58', '00219400287103405817', 92000, date '2026-08-01', 'activo', false, now())
  on conflict (id) do nothing;

  -- 4. Una factura por liquidación, con CxC y cobro si ya venció
  set local session_replication_role = replica;
  delete from movimientos_tesoreria where empresa_id = v_emp and id like 'mt_demo_cobarl_%';
  delete from cobros_cxc where empresa_id = v_emp and id like 'cob_demo_arl_%';
  delete from cxc where empresa_id = v_emp and id like 'cxc_demo_arl_%';
  delete from facturas where empresa_id = v_emp and id like 'fac_demo_arl_%';

  for r in select l.*, c.numero contrato, c.cuenta_id, ct.razon_social cliente, ct.condicion_pago
           from flota_liquidaciones l join contratos_alquiler c on c.id = l.contrato_alquiler_id join cuentas ct on ct.id = c.cuenta_id
           where l.empresa_id = v_emp and l.estado = 'aprobada' order by l.numero loop
    v_n := v_n + 1;
    v_fac := 'fac_demo_arl_' || lpad(v_n::text, 3, '0');
    v_cxc := 'cxc_demo_arl_' || lpad(v_n::text, 3, '0');
    v_num := 'F001-' || lpad((410 + v_n)::text, 8, '0');
    v_fecha := (r.periodo + interval '1 month' - interval '1 day')::date;
    v_dias := coalesce(substring(r.condicion_pago from '(\d+)')::int, 30);
    v_venc := v_fecha + v_dias;
    v_mes := (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'])[extract(month from r.periodo)::int];
    v_items := '[]'::jsonb;
    for li in select a.codigo, a.nombre, ll.horas_facturables, ll.tarifa_hora, ll.importe_base
              from flota_liquidacion_lineas ll join activos a on a.id = ll.activo_id
              where ll.liquidacion_id = r.id order by a.codigo loop
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'descripcion', 'Alquiler ' || li.codigo || ' ' || li.nombre || ' con operador · ' || v_mes || ' 2026',
        'cantidad', li.horas_facturables, 'unidad', 'hora', 'precio_unitario', li.tarifa_hora, 'total', li.importe_base));
    end loop;
    if r.penalidad > 0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'descripcion', 'Descuento por disponibilidad mecánica (DMR ' || r.dmr || ' % vs meta ' || r.meta_dmr || ' %)',
        'cantidad', 1, 'precio_unitario', -r.penalidad, 'total', -r.penalidad));
    end if;
    v_sub := r.total;
    v_igv := round(v_sub * 0.18, 2);
    v_tot := v_sub + v_igv;
    v_pagado := v_venc <= date '2026-11-08';

    insert into facturas (id, empresa_id, cuenta_id, numero, fecha_emision, subtotal, igv, total, moneda, estado, tipo_documento, glosa,
      condicion_pago, fecha_vencimiento, items, monto_neto_cobrable, monto_retencion, aplica_retencion, aplica_detraccion,
      centro_beneficio_id, sociedad_id, created_at, updated_at)
    values (v_fac, v_emp, r.cuenta_id, v_num, v_fecha, v_sub, v_igv, v_tot, 'PEN', case when v_pagado then 'cobrada' else 'emitida' end, 'factura',
      'Alquiler de equipos ' || v_mes || ' 2026 – ' || r.contrato || ' – Liquidación ' || r.numero,
      r.condicion_pago, v_venc, v_items, v_tot, 0, false, false, v_cebe, v_arl, v_fecha + time '18:00', v_fecha + time '18:00');

    insert into cxc (id, empresa_id, cuenta_id, factura_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado,
      glosa, condicion_pago, sociedad_id, created_at, updated_at)
    values (v_cxc, v_emp, r.cuenta_id, v_fac, v_fecha, v_venc, v_tot, case when v_pagado then v_tot else 0 end, case when v_pagado then 0 else v_tot end,
      'PEN', case when v_pagado then 'cobrada' else 'por_cobrar' end,
      'Alquiler de equipos ' || v_mes || ' 2026 – ' || r.contrato, r.condicion_pago, v_arl, v_fecha + time '18:00', v_fecha + time '18:00');

    if v_pagado then
      insert into cobros_cxc (id, empresa_id, cxc_id, factura_id, cuenta_id, monto_capital, medio_pago, cuenta_bancaria, numero_operacion, fecha_cobro, registrado_por, creado_en)
      values ('cob_demo_arl_' || lpad(v_n::text, 3, '0'), v_emp, v_cxc, v_fac, r.cuenta_id, v_tot, 'Transferencia bancaria', v_cb,
        (771000 + v_n * 23)::text, v_venc - 2, null, (v_venc - 2) + time '11:00');
      insert into movimientos_tesoreria (id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria_id, referencia, vinculo_tipo, vinculo_id,
        estado, categoria, es_manual, created_at)
      values ('mt_demo_cobarl_' || lpad(v_n::text, 3, '0'), v_emp, 'ingreso', 'Cobro factura ' || v_num || ' · ' || r.cliente, v_tot, 'PEN', v_venc - 2,
        v_cb, (771000 + v_n * 23)::text, 'cobro_cxc', 'cob_demo_arl_' || lpad(v_n::text, 3, '0'), 'conciliado', 'Cobranza clientes', false, (v_venc - 2) + time '11:00');
    end if;
  end loop;

  update cuentas c set saldo_cxc = coalesce((select sum(saldo) from cxc where cuenta_id = c.id), 0),
    fecha_ultima_compra = (select max(fecha_emision) from facturas where cuenta_id = c.id)
  where empresa_id = v_emp and id like 'cta_demo_%';

  -- 5. Catálogo de CECO sin nombres de clientes reales
  -- 2000–2013: un CECO por cliente ficticio; 2014–2031 quedan inactivos con nombre genérico
  update centros_costo cc set nombre = upper(x.nombre), estado = 'activo', updated_at = now()
  from (select row_number() over (order by id) - 1 k, regexp_replace(razon_social, '\s+S\.A\.?A?\.?C?\.?$', '') nombre
        from cuentas where empresa_id = v_emp) x
  where cc.empresa_id = v_emp and cc.codigo ~ '^20[0-9]{2}$' and cc.codigo::int - 2000 = x.k;
  update centros_costo set nombre = 'CLIENTE POR ASIGNAR ' || codigo, estado = 'inactivo', updated_at = now()
  where empresa_id = v_emp and codigo ~ '^20[0-9]{2}$' and codigo::int >= 2014;
  -- 3001–3044: "<cliente ficticio> - <equipo>", el mismo cliente ficticio para el mismo cliente original
  with base as (
    select id, codigo,
      upper(trim(split_part(replace(nombre, 'GYM-OSSA', 'GYM OSSA'), '-', 1))) cli,
      trim(regexp_replace(regexp_replace(replace(nombre, 'GYM-OSSA', 'GYM OSSA'), '^[^-]*-\s*', ''), '^(ANDAYCHAGUA|AMERICANA)\s*-?\s*', '')) equipo
    from centros_costo where empresa_id = v_emp and codigo ~ '^30[0-9]{2}$'),
  clis as (select cli, row_number() over (order by min(codigo)) - 1 k from base group by cli),
  ficticios as (select row_number() over (order by id) - 1 k, upper(regexp_replace(razon_social, '\s+S\.A\.?A?\.?C?\.?$', '')) nombre,
                       count(*) over () total from cuentas where empresa_id = v_emp)
  update centros_costo cc set nombre = f.nombre || ' - ' || b.equipo, updated_at = now()
  from base b join clis c on c.cli = b.cli join ficticios f on f.k = c.k % f.total
  where cc.id = b.id;

  -- Comprobaciones
  if (select count(*) from flota_liquidaciones where empresa_id = v_emp and estado = 'aprobada') <> 10 then
    raise exception 'se esperaban 10 liquidaciones aprobadas';
  end if;
  if (select count(*) from facturas where empresa_id = v_emp and id like 'fac_demo_arl_%') <> 10 then
    raise exception 'se esperaban 10 facturas de alquiler';
  end if;
  if (select sum(subtotal) from facturas where empresa_id = v_emp and id like 'fac_demo_arl_%')
     <> (select sum(total) from flota_liquidaciones where empresa_id = v_emp and estado = 'aprobada') then
    raise exception 'las facturas no cuadran con las liquidaciones';
  end if;
  if exists (select 1 from centros_costo where empresa_id = v_emp
             and nombre ~* '\m(NEXA|ZICSA|STRACON|BUENAVENTURA|CONDESTABLE|CATALINA HUANCA|FERREYROS|ACEROS AREQUIPA|PAN AMERICAN|CARAVELI|HORIZONTE|CERRO DE PASCO|ATACOCHA|COLQUISIRI|GYM|PEGAMA|MASTERDRILL|SIMSA|CETEMIN|OPERMIN|RESEFER|CORIMAYO|DIFESMIN|SAN VALENTIN|ARES|CRISTOBAL|AUSTRIA DUVAZ|IESA|SMAD|CRM|ANK|CMH|CWE|MVC|JRC|GMI)\M') then
    raise exception 'quedan nombres de clientes reales en CECO';
  end if;
end $$;
