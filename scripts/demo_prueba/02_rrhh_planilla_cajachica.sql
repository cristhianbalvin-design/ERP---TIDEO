-- Demo PRUEBA · 02 Personal, planilla (ago–oct 2026) y caja chica
do $$
declare
  emp text := 'emp_2000000000';
  soc uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  nom text[] := array['José','Luis','Carlos','Miguel','Juan','Jorge','Pedro','Raúl','Víctor','Hugo','César','Edwin','Wilmer','Fredy','Rubén','Alex','Henry','Elmer','Javier','Walter','Óscar','Marco','Iván','Félix','Nilton','Percy','Rolando','Teófilo','Abel','Saúl','Dante','Efraín','Gerson','Ronald','Yuri','Kevin','Mariela','Rocío','Karina','Paola','Vanessa','Lorena'];
  ape text[] := array['Quispe','Huamán','Mamani','Flores','Rojas','Chávez','Ramos','Torres','Vargas','Castillo','Mendoza','Paredes','Cárdenas','Gutiérrez','Salazar','Ccahuana','Condori','Apaza','Ticona','Villanueva','Espinoza','Huanca','Navarro','Poma','Yupanqui','Alvarado','Inga','Llanos','Montes','Palomino'];
  -- tipo, cantidad, cargo_id, cargo, area_id, area, sueldo, régimen
  grp text[][] := array[
    ['op','12','car_05f9cfc6ba704f8d8d','Técnico Mecánico','area_94df39146f85482b82','Mantenimiento Industrial','3600','general'],
    ['op','5','car_61e5648fb26f4311bd','Electricista Industrial','area_94df39146f85482b82','Mantenimiento Industrial','3800','general'],
    ['op','3','car_e6071eb816d546e79b','Técnico Electrónico','area_94df39146f85482b82','Mantenimiento Industrial','4000','general'],
    ['op','6','car_f19ed39f59054ea399','Ayudante Técnico','area_94df39146f85482b82','Mantenimiento Industrial','1850','general'],
    ['op','4','car_584cedd3b4b14ec8b7','Técnico de Campo','area_a07336cdc4e1479aa4','Operaciones','4600','minero_14x7'],
    ['op','2','car_ab2fe84831f0482c96','Supervisor de Operaciones','area_a07336cdc4e1479aa4','Operaciones','6800','minero_14x7'],
    ['op','2','car_59b3c0d8577d4f21aa','Operador de Montacargas','area_714f555411434bfe90','Logística y Almacén','2500','general'],
    ['op','2','car_c7074ed3b65246d382','Operario de Almacén','area_714f555411434bfe90','Logística y Almacén','1950','general'],
    ['ad','1','car_94d3781326044964b7','Jefe de Operaciones','area_a07336cdc4e1479aa4','Operaciones','11500','general'],
    ['ad','2','car_3a7fe2a8003d4d1c82','Ingeniero de Proyectos','area_7ce5e8a457644dea81','Ingeniería y Proyectos','7800','general'],
    ['ad','1','car_138690218fea440bbe','Jefe de Logística','area_714f555411434bfe90','Logística y Almacén','8200','general'],
    ['ad','1','car_a80ac2a50dc14874b6','Supervisor de SSOMA','area_ebfce65ee0d84653a3','SSOMA','6500','general'],
    ['ad','1','car_e18ee844bb174ffb95','Inspector de Calidad','area_12316b48aa8f4b8caf','Control de Calidad','5200','general'],
    ['ad','2','car_dfe1d0ea283949429a','Asesor Comercial','area_36b9fed46bba4a4eb9','Administración y Finanzas','4800','general'],
    ['ad','1','','Contador General','area_36b9fed46bba4a4eb9','Administración y Finanzas','7200','general'],
    ['ad','1','','Analista de Talento Humano','area_f23af43ebcde48a7ad','Gestión de Talento Humano','4300','general'],
    ['ad','1','','Planner de Mantenimiento','area_f63c6fca817e483290','Planeamiento y Control de Producción','5600','general']];
  g int; c int; n int := 0; v_id text; v_nom text; v_sue numeric; v_hijos bool; v_afp text; v_sis text; v_ing date;
  m int; v_per text; v_ini date; v_fin date; v_he1 int; v_he2 int; v_hv numeric; v_add numeric; v_asig numeric; v_bruta numeric;
  v_afp_ap numeric; v_com numeric; v_pri numeric; v_onp numeric; v_ir numeric; v_desc numeric; v_ess numeric; v_cts numeric; v_gra numeric; v_bon numeric; v_vac numeric;
  t_bruta numeric; t_neto numeric; t_cargas numeric; t_trab int;
  r record; f text; dd date; mto numeric; cat text; conc text; i int;
begin
  perform setseed(0.17);
  set local session_replication_role = replica;
  update sociedades set regimen_laboral='general' where empresa_id=emp;

  -- Personal
  for g in 1..array_length(grp,1) loop
    for c in 1..grp[g][2]::int loop
      n := n+1;
      v_nom := nom[1 + (n*7) % (case when grp[g][1]='ad' and n%3=0 then 42 else 36 end)] || ' ' || ape[1+(n*11)%30] || ' ' || ape[1+(n*17+5)%30];
      v_sue := grp[g][7]::numeric + ((n*53)%5)*100;
      v_hijos := n%3 <> 0;
      v_sis := case when n%6=0 then 'ONP' else 'AFP' end;
      v_afp := case when v_sis='ONP' then null else (array['Integra','Prima','Profuturo','Habitat'])[1+n%4] end;
      v_ing := date '2019-03-01' + ((n*97) % 2300);
      if grp[g][1]='op' then
        v_id := 'po_demo_'||lpad(n::text,3,'0');
        insert into personal_operativo(id,empresa_id,codigo,nombre,documento,cargo,especialidad,area,telefono,email,sueldo_base,moneda,sistema_pensionario,afp_nombre,costo_hora_real,costo_hora_extra,estado,sede,fecha_ingreso,acceso_campo,perfil_campo,tipo_contrato,tiene_hijos,regimen_laboral,regimen_jornada,horas_diarias_pactadas,estado_laboral,cargo_id,area_id,centro_costo_id,dias_vacaciones_disponibles,celular_personal,created_at)
        values (v_id,emp,'OP-'||lpad(n::text,3,'0'),v_nom,'4'||lpad((5100000+n*7351)::text,7,'0'),grp[g][4],grp[g][4],grp[g][6],'9'||(61000000+n*4421)::text,
          lower(split_part(v_nom,' ',1))||'.'||lower(split_part(v_nom,' ',2))||'@andesindustrial-demo.pe',v_sue,'PEN',v_sis,v_afp,
          round(v_sue*1.55/240,2),round(v_sue/240*1.25,2),'disponible',case when grp[g][8]='general' then 'Taller Ate' else 'Campamento Cerro de Pasco' end,
          v_ing,true,case when grp[g][4] like 'Supervisor%' then 'Supervisor' else 'tecnico' end,
          case when n%4=0 then 'plazo_fijo' else 'indefinido' end,v_hijos,'general',grp[g][8],case when grp[g][8]='general' then 8 else 12 end,
          'activo',nullif(grp[g][3],''),grp[g][5],null,(n*3)%30,'9'||(61000000+n*4421)::text,v_ing::timestamp);
      else
        v_id := 'pa_demo_'||lpad(n::text,3,'0');
        insert into personal_administrativo(id,empresa_id,codigo,nombre,documento,dni,cargo,area,telefono,email,sueldo_base,remuneracion,moneda,sistema_pensionario,afp_nombre,fecha_ingreso,estado,sede,tipo_contrato,tiene_hijos,regimen_laboral,regimen_jornada,estado_laboral,cargo_id,area_id,dias_vacaciones_disponibles,created_at)
        values (v_id,emp,'AD-'||lpad(n::text,3,'0'),v_nom,'4'||lpad((5100000+n*7351)::text,7,'0'),'4'||lpad((5100000+n*7351)::text,7,'0'),grp[g][4],grp[g][6],'9'||(61000000+n*4421)::text,
          lower(split_part(v_nom,' ',1))||'.'||lower(split_part(v_nom,' ',2))||'@andesindustrial-demo.pe',v_sue,v_sue,'PEN',v_sis,v_afp,v_ing,'activo','Oficina Ate',
          'indefinido',v_hijos,'general','general','activo',nullif(grp[g][3],''),grp[g][5],(n*5)%30,v_ing::timestamp);
      end if;
    end loop;
  end loop;

  -- Periodos de planilla (mensual) y detalle por trabajador
  for m in 8..11 loop
    v_ini := make_date(2026,m,1); v_fin := (v_ini + interval '1 month - 1 day')::date;
    v_per := 'pn_demo_2026_'||lpad(m::text,2,'0');
    insert into periodos_nomina(id,empresa_id,periodo,fecha_inicio,fecha_fin,moneda,estado,anio,mes,fecha_corte,fecha_pago,sociedad_id,cerrado_en,cerrado_at,creado_en,created_at)
    values (v_per,emp,(array['Agosto','Septiembre','Octubre','Noviembre'])[m-7]||' 2026',v_ini,v_fin,'PEN',
      case when m<11 then 'cerrado' else 'abierto' end,2026,m,v_fin,v_fin,soc,
      case when m<11 then v_fin::timestamp + interval '18 hours' end,case when m<11 then v_fin::timestamp + interval '18 hours' end,v_ini::timestamp,v_ini::timestamp);
    if m = 11 then continue; end if;
    t_bruta:=0; t_neto:=0; t_cargas:=0; t_trab:=0;
    for r in select id, 'operativo' tipo, sueldo_base, tiene_hijos, sistema_pensionario, area, regimen_jornada from personal_operativo where empresa_id=emp
             union all select id, 'administrativo', sueldo_base, tiene_hijos, sistema_pensionario, area, regimen_jornada from personal_administrativo where empresa_id=emp loop
      -- Horas extra: el taller de Mantenimiento acumula horas extra crecientes (ago < set < oct)
      if r.area='Mantenimiento Industrial' then
        v_he1 := (array[360,720,1320])[m-7] + (abs(hashtext(r.id||m))%240);
        v_he2 := (array[0,120,480])[m-7] + (abs(hashtext(r.id||'b'||m))%120);
      elsif r.tipo='operativo' then
        v_he1 := abs(hashtext(r.id||m))%300; v_he2 := 0;
      else v_he1 := 0; v_he2 := 0; end if;
      v_hv := r.sueldo_base/240;
      v_add := round(v_hv*1.25*v_he1/60 + v_hv*1.35*v_he2/60,2);
      v_asig := case when r.tiene_hijos then 113 else 0 end;
      v_bruta := r.sueldo_base + v_asig + v_add;
      if r.sistema_pensionario='AFP' then v_afp_ap := round(v_bruta*0.10,2); v_com := 0; v_pri := round(v_bruta*0.0137,2); v_onp := 0;
      else v_afp_ap := 0; v_com := 0; v_pri := 0; v_onp := round(v_bruta*0.13,2); end if;
      v_ir := round(greatest(0, v_bruta*14 - 7*5500)*0.12/12,2);
      v_desc := v_afp_ap+v_com+v_pri+v_onp+v_ir;
      v_ess := round(v_bruta*0.09,2);
      v_cts := round((r.sueldo_base+v_asig)*(7.0/6)/12,2);
      v_gra := round((r.sueldo_base+v_asig)/6,2);
      v_bon := round(v_gra*0.09,2);
      v_vac := round((r.sueldo_base+v_asig)/12,2);
      insert into nomina_detalle(empresa_id,periodo_id,trabajador_id,trabajador_tipo,regimen_jornada_snap,regimen_empresa_snap,dias_laborables,dias_laborados,dias_computables,horas_extra_tramo1_min,horas_extra_tramo2_min,sueldo_base,remuneracion_bruta,asignacion_familiar,add_horas_extra,aporte_afp,comision_afp_flujo,prima_seguro_afp,desc_onp,retencion_ir,total_descuentos,neto,essalud,cts_mensualizado,tiene_cts,gratificacion_mensualizada,bonif_extraordinaria,tiene_gratificacion,vacaciones_mensualizadas,total_cargas,costo_real_empresa,es_quincena,sistema_pensionario,sociedad_id,sueldo_proporcional,creado_en)
      values (emp,v_per,r.id,r.tipo,r.regimen_jornada,'general',30,30,30,v_he1,v_he2,r.sueldo_base,v_bruta,v_asig,v_add,v_afp_ap,v_com,v_pri,v_onp,v_ir,v_desc,v_bruta-v_desc,v_ess,v_cts,true,v_gra,v_bon,true,v_vac,
        v_ess+v_cts+v_gra+v_bon+v_vac, v_bruta+v_ess+v_cts+v_gra+v_bon+v_vac,false,r.sistema_pensionario,soc,r.sueldo_base,v_fin::timestamp);
      t_bruta:=t_bruta+v_bruta; t_neto:=t_neto+v_bruta-v_desc; t_cargas:=t_cargas+v_ess+v_cts+v_gra+v_bon+v_vac; t_trab:=t_trab+1;
    end loop;
    update periodos_nomina set total_trabajadores=t_trab, masa_salarial_bruta=t_bruta, total_neto=t_neto, total_cargas_empresa=t_cargas where id=v_per;
    -- Pago de planilla en tesorería
    insert into movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,referencia,vinculo_tipo,vinculo_id,estado,categoria,es_manual,created_at)
    values ('mt_demo_pla_'||m,emp,'egreso','Pago de planilla '||(array['agosto','septiembre','octubre'])[m-7]||' 2026',round(t_neto,2),'PEN',v_fin,'cb_demo_bcp_pen','PLA-2026-'||m,'planilla',v_per,'conciliado','Planilla',false,v_fin::timestamp);
  end loop;

  -- Caja chica: 3 fondos con egresos y reposiciones mensuales
  insert into caja_chica_fondos(id,empresa_id,nombre,responsable_id,monto_asignado,monto_minimo,cuenta_bancaria_id,moneda,estado,fecha_apertura,notas,creado_por,tipo_origen,sociedad_id,creado_en) values
   ('ccf_demo_taller',emp,'Caja Chica Taller Ate','b312121e-1fd1-4163-88ef-2e50ada7ca96',6000,1500,'cb_demo_bcp_pen','PEN','activo','2026-08-01','Gastos menores del taller','65121d88-63b8-4112-8365-9f7f4e1623a7','cuenta_bancaria',soc,'2026-08-01'),
   ('ccf_demo_campo',emp,'Caja Chica Campamento Cerro de Pasco','b2f63493-9ac0-4ec2-bd47-3fa006bd0346',9000,2000,'cb_demo_bcp_pen','PEN','activo','2026-08-01','Viáticos y compras urgentes en campo','65121d88-63b8-4112-8365-9f7f4e1623a7','cuenta_bancaria',soc,'2026-08-01'),
   ('ccf_demo_admin',emp,'Caja Chica Administración','65121d88-63b8-4112-8365-9f7f4e1623a7',2500,500,'cb_demo_bcp_pen','PEN','activo','2026-08-01','Gastos de oficina','65121d88-63b8-4112-8365-9f7f4e1623a7','cuenta_bancaria',soc,'2026-08-01');
  i := 0;
  for dd in select generate_series(date '2026-08-03', date '2026-11-07', interval '1 day')::date loop
    if extract(dow from dd) = 0 then continue; end if;
    foreach f in array array['ccf_demo_taller','ccf_demo_campo','ccf_demo_admin'] loop
      if (f='ccf_demo_admin' and abs(hashtext(f||dd))%4<>0) or (f='ccf_demo_taller' and abs(hashtext(f||dd))%2<>0) then continue; end if;
      i := i+1;
      if f='ccf_demo_campo' then
        conc := (array['Combustible camioneta Hilux ABK-742','Viáticos cuadrilla de mantenimiento','Alimentación personal de turno','Peaje y estacionamiento','Compra urgente de mangueras hidráulicas','Hospedaje técnicos en Cerro de Pasco','Combustible grupo electrógeno'])[1+abs(hashtext(dd::text))%7];
        -- el gasto de combustible y viáticos en campo sube cada mes
        mto := round((80 + abs(hashtext(f||dd||'m'))%420) * (1 + (extract(month from dd)-8)*0.18),2);
        cat := case when conc like 'Combustible%' or conc like 'Peaje%' then 'Logistica' when conc like 'Compra%' then 'Materiales' else 'Costos indirectos de taller' end;
      elsif f='ccf_demo_taller' then
        conc := (array['Discos de corte y lijas','Soldadura E7018','Pernos y arandelas de alta resistencia','Guantes y lentes de seguridad','Grasa y lubricantes','Movilidad para recojo de repuestos','Brocas y machos de roscar'])[1+abs(hashtext(dd::text||'t'))%7];
        mto := round(60 + abs(hashtext(f||dd||'m'))%340,2);
        cat := case when conc like 'Guantes%' then 'SSOMA operativo' when conc like 'Movilidad%' then 'Logistica' else 'Materiales' end;
      else
        conc := (array['Útiles de oficina','Courier de documentos','Refrigerio reunión con cliente','Notaría – legalización de documentos','Agua y café para oficina'])[1+abs(hashtext(dd::text||'a'))%5];
        mto := round(25 + abs(hashtext(f||dd||'m'))%180,2);
        cat := case when conc like 'Refrigerio%' then 'Comerciales' else 'Administrativos' end;
      end if;
      insert into caja_chica(id,empresa_id,fecha,concepto,monto,moneda,responsable_id,responsable_nombre,categoria,num_comprobante,estado,origen_registro,creado_por,creado_en,fondo_id,sociedad_id)
      values ('cch_demo_'||lpad(i::text,4,'0'),emp,dd,conc,mto,'PEN',
        (select responsable_id from caja_chica_fondos where id=f),
        case f when 'ccf_demo_taller' then 'Andrea Molina' when 'ccf_demo_campo' then 'Gian Cardenas' else 'Sandibel Jimenez' end,
        cat,(array['B001-','F001-','E001-'])[1+i%3]||lpad((1000+i*13)::text,6,'0'),'registrado','backoffice',
        (select responsable_id from caja_chica_fondos where id=f),dd::timestamp + interval '11 hours',f,soc);
    end loop;
  end loop;
  -- Reposiciones mensuales (ago, set, oct repuestas; nov pendiente)
  for f in select id from caja_chica_fondos where empresa_id=emp loop
    for m in 8..10 loop
      v_ini := make_date(2026,m,1); v_fin := (v_ini + interval '1 month - 1 day')::date;
      select coalesce(sum(monto),0) into mto from caja_chica where fondo_id=f and fecha between v_ini and v_fin;
      insert into caja_chica_rendiciones(id,empresa_id,fondo_id,periodo_inicio,periodo_fin,monto_solicitado,monto_aprobado,estado,aprobado_por,aprobado_en,cuenta_bancaria_id,transferencia_reposicion_ref,moneda,creado_por,creado_en)
      values ('ccr_demo_'||f||'_'||m,emp,f,v_ini,v_fin,mto,mto,'repuesta','65121d88-63b8-4112-8365-9f7f4e1623a7',(v_fin+2)::timestamp,'cb_demo_bcp_pen','REP-'||m||'-'||right(f,5),'PEN','65121d88-63b8-4112-8365-9f7f4e1623a7',(v_fin+1)::timestamp);
      insert into movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,referencia,vinculo_tipo,vinculo_id,estado,categoria,es_manual,created_at)
      values ('mt_demo_rep_'||right(f,5)||'_'||m,emp,'egreso','Reposición '||(select nombre from caja_chica_fondos where id=f),mto,'PEN',v_fin+2,'cb_demo_bcp_pen','REP-'||m||'-'||right(f,5),'caja_chica_rendicion','ccr_demo_'||f||'_'||m,'conciliado','Caja chica',false,(v_fin+2)::timestamp);
    end loop;
  end loop;

  -- Verificación
  if (select count(*) from personal_operativo where empresa_id=emp) <> 36 then raise exception 'operativos <> 36'; end if;
  if (select count(*) from nomina_detalle where empresa_id=emp) <> 3*(select count(*) from personal_operativo where empresa_id=emp)+3*(select count(*) from personal_administrativo where empresa_id=emp) then raise exception 'detalle de planilla incompleto'; end if;
  if exists (select 1 from caja_chica_fondos f where empresa_id=emp and public.calcular_saldo_fondo_caja_chica(f.id) < 0) then raise exception 'fondo con saldo negativo'; end if;
end $$;
