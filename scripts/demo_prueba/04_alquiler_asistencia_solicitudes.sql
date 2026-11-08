-- Demo PRUEBA · 04 Contratos de alquiler de flota, asistencia (últimas 4 semanas) y solicitudes de RRHH
do $$
declare
  emp text := 'emp_2000000000';
  soc uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  soc2 uuid := 'b03f3bda-d4be-4acb-891c-07f36b731fd5';
  r record; dd date; ent time; sal time; tard int; he int; n int := 0;
begin
  set local session_replication_role = replica;

  -- Contratos de alquiler (sociedad Andes Rental & Logistics)
  insert into contratos_alquiler(id,empresa_id,sociedad_id,numero,cuenta_id,unidad_minera,objeto,fecha_inicio,fecha_fin,minimo_facturable,unidad_minimo_facturable,periodicidad_minimo_facturable,meta_dmr,moneda,estado,representante_cliente,representante_empresa,created_at) values
   ('ca_demo_01',emp,soc2,'CA-2026-011','cta_demo_02','Unidad Huaytapallana','Alquiler de excavadoras y cargador con operador para desbroce',date '2026-07-15',date '2027-01-14',200,'hora','mes',90,'PEN','vigente','Ing. Mariela Quispe','Jefe de Operaciones','2026-07-10'),
   ('ca_demo_02',emp,soc2,'CA-2026-012','cta_demo_04','Tramo Huánuco – La Unión km 42','Alquiler de tractor y retroexcavadoras para obra vial',date '2026-08-01',date '2026-12-31',180,'hora','mes',88,'PEN','vigente','Ing. Patricia Rojas','Jefe de Operaciones','2026-07-28'),
   ('ca_demo_03',emp,soc2,'CA-2026-013','cta_demo_13','Cantera Carabayllo','Alquiler de cargador frontal para carguío de agregados',date '2026-09-01',date '2026-11-30',160,'hora','mes',85,'PEN','vigente','Sr. Óscar Gutiérrez','Jefe de Operaciones','2026-08-27'),
   ('ca_demo_04',emp,soc2,'CA-2026-009','cta_demo_01','Unidad Cordillera Azul – Tajo Norte','Alquiler de excavadora para limpieza de tajo',date '2026-05-01',date '2026-09-30',200,'hora','mes',90,'PEN','vencido','Ing. Ricardo Salazar','Jefe de Operaciones','2026-04-25');
  insert into contratos_alquiler_equipos(contrato_alquiler_id,equipo_id,tarifa_hora_override) values
   ('ca_demo_01','act_demo_ex_01',265),('ca_demo_01','act_demo_ex_02',265),('ca_demo_01','act_demo_cf_02',210),
   ('ca_demo_02','act_demo_tr_01',340),('ca_demo_02','act_demo_re_01',145),('ca_demo_02','act_demo_re_02',140),
   ('ca_demo_03','act_demo_cf_03',215),
   ('ca_demo_04','act_demo_ex_03',250);

  -- Asistencia del personal de taller y oficina (12/10 al 07/11), con tardanzas y horas extra en Mantenimiento
  for r in select id, 'operativo' tipo, area from personal_operativo where empresa_id=emp and regimen_jornada='general'
           union all select id, 'administrativo', area from personal_administrativo where empresa_id=emp loop
    for dd in select generate_series(date '2026-10-12', date '2026-11-07', interval '1 day')::date loop
      if extract(dow from dd) = 0 then continue; end if;
      n := n+1;
      if abs(hashtext(r.id||dd)) % 40 = 0 then
        insert into registros_asistencia(empresa_id,trabajador_tipo,trabajador_id,turno_id,fecha,estado,es_falta,justificada,motivo_falta,origen_registro,created_at,regimen_jornada,refrigerio_estado,descanso_sustitutorio_otorgado)
        values (emp,r.tipo,r.id,case when r.tipo='operativo' then 'tur_001' else 'tur_005' end,dd,case when abs(hashtext(r.id||dd))%3=0 then 'falta_justificada' else 'falta' end,true,abs(hashtext(r.id||dd))%3=0,'Inasistencia','backoffice',dd::timestamp,'general','no_aplica',false);
        continue;
      end if;
      tard := case when abs(hashtext(r.id||dd||'t')) % 9 = 0 then 5 + abs(hashtext(r.id||dd)) % 25 else 0 end;
      ent := time '07:30' + (tard||' minutes')::interval;
      he := case when r.area='Mantenimiento Industrial' and extract(dow from dd) between 1 and 5 then 60 + abs(hashtext(r.id||dd||'h')) % 150 else 0 end;
      sal := time '17:00' + (he||' minutes')::interval;
      if extract(dow from dd) = 6 then sal := time '12:30'; he := 0; end if;
      insert into registros_asistencia(empresa_id,trabajador_tipo,trabajador_id,turno_id,fecha,hora_entrada,hora_salida,tardanza_minutos,tardanza_min,horas_extra,horas_extra_min,horas_trabajadas_min,estado,es_falta,origen_registro,created_at,regimen_jornada,refrigerio_estado,minutos_refrigerio_real,minutos_refrigerio_aplicado,descanso_sustitutorio_otorgado,fecha_salida)
      values (emp,r.tipo,r.id,case when r.tipo='operativo' then 'tur_001' else 'tur_005' end,dd,ent,sal,tard,tard,round(he/60.0,2),he,
        extract(epoch from (sal-ent))::int/60 - case when extract(dow from dd)=6 then 0 else 60 end,
        case when tard>0 then 'tardanza' when he>0 then 'horas_extra' else 'completo' end,false,'mobile',dd::timestamp + ent,'general',
        case when extract(dow from dd)=6 then 'no_aplica' else 'completo' end,case when extract(dow from dd)=6 then 0 else 60 end,case when extract(dow from dd)=6 then 0 else 60 end,false,dd);
    end loop;
  end loop;

  -- Solicitudes de RRHH
  insert into solicitudes_rrhh(empresa_id,personal_id,personal_nombre,personal_tipo,aprobador_nombre,tipo,fecha_inicio,fecha_fin,dias_habiles,motivo,estado,impacto_nomina,dias_a_descontar,registrado_desde,clasificacion_pago,unidad,creado_en,fecha_aprobacion_jefe,fecha_confirmacion,sociedad_id,numero_correlativo)
  select emp,p.id,p.nombre,'operativo','Jefe de Operaciones',
    (array['vacaciones','permiso_con_goce','licencia_medica','vacaciones','compensacion_horas','vacaciones','permiso_sin_goce','vacaciones'])[1+g%8],
    date '2026-08-10' + g*9, date '2026-08-10' + g*9 + (array[6,0,2,9,0,4,1,6])[1+g%8],
    (array[5,1,3,7,1,4,1,5])[1+g%8],
    (array['Vacaciones programadas','Trámite personal','Descanso médico por gripe','Viaje familiar','Compensación de horas extra de octubre','Vacaciones programadas','Asunto personal','Vacaciones de fin de año'])[1+g%8],
    case when date '2026-08-10' + g*9 < date '2026-10-25' then 'confirmada_rrhh' when g%3=0 then 'aprobada_jefe' else 'enviada' end,
    case when (array['vacaciones','permiso_con_goce','licencia_medica','vacaciones','compensacion_horas','vacaciones','permiso_sin_goce','vacaciones'])[1+g%8]='permiso_sin_goce' then 'descuento_total' else 'sin_descuento' end,
    case when (array['vacaciones','permiso_con_goce','licencia_medica','vacaciones','compensacion_horas','vacaciones','permiso_sin_goce','vacaciones'])[1+g%8]='permiso_sin_goce' then 1 else 0 end,
    case when g%2=0 then 'mobile' else 'backoffice' end,
    case when (array['vacaciones','permiso_con_goce','licencia_medica','vacaciones','compensacion_horas','vacaciones','permiso_sin_goce','vacaciones'])[1+g%8]='permiso_sin_goce' then 'no_remunerado' else 'remunerado' end,
    'dias',(date '2026-08-10' + g*9 - 7)::timestamp,
    case when date '2026-08-10' + g*9 < date '2026-10-25' or g%3=0 then (date '2026-08-10' + g*9 - 5)::timestamp end,
    case when date '2026-08-10' + g*9 < date '2026-10-25' then (date '2026-08-10' + g*9 - 4)::timestamp end,
    soc,'SOL-2026-'||lpad((200+g)::text,4,'0')
  from generate_series(1,12) g join personal_operativo p on p.id='po_demo_'||lpad((1+g*3%36)::text,3,'0');

  if (select count(*) from registros_asistencia where empresa_id=emp) < 500 then raise exception 'asistencia insuficiente'; end if;
end $$;
