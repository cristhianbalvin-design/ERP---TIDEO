-- Previsualizacion de gratificacion real: no modifica datos.
begin;

create or replace function public._calcular_gratificacion_real_trabajador_448(
  p_detalle public.nomina_detalle, p_fecha_ingreso date, p_fecha_cese date,
  p_estado_laboral text, p_fecha_pago date, p_inicio_semestre date,
  p_fin_semestre date, p_uit numeric, p_montos_confirmados boolean default false
)
returns table(elegible boolean, motivo_no_elegible text, meses_completos integer,
  gratificacion_pagada numeric, bonif_extraordinaria_pagada numeric,
  retencion_ir_nueva numeric, total_descuentos_nuevo numeric, neto_nuevo numeric)
language plpgsql security definer set search_path = public as $$
declare v_primer_mes date; v_rem numeric; v_factor numeric; v_base numeric;
  v_impuesto numeric; v_ingreso_anual numeric; v_delta numeric;
begin
  elegible := false; meses_completos := 0; gratificacion_pagada := 0;
  bonif_extraordinaria_pagada := 0; retencion_ir_nueva := coalesce(p_detalle.retencion_ir,0);
  total_descuentos_nuevo := coalesce(p_detalle.total_descuentos,0); neto_nuevo := coalesce(p_detalle.neto,0);
  -- Un período confirmado es un resumen histórico: devuelve los importes
  -- persistidos, sin reinterpretarlos según cambios posteriores de personal.
  if p_montos_confirmados then
    gratificacion_pagada := coalesce(p_detalle.gratificacion_pagada,0);
    bonif_extraordinaria_pagada := coalesce(p_detalle.bonif_extraordinaria_pagada,0);
    elegible := gratificacion_pagada > 0 or bonif_extraordinaria_pagada > 0;
    if not elegible then motivo_no_elegible := 'No se confirmo pago de gratificacion para el trabajador.'; end if;
    return next;
    return;
  end if;
  if p_estado_laboral is distinct from 'activo' then motivo_no_elegible := 'El trabajador no esta activo en la fecha de pago.';
  elsif p_fecha_ingreso is null then motivo_no_elegible := 'El trabajador no tiene fecha de ingreso.';
  elsif p_fecha_ingreso > p_fecha_pago then motivo_no_elegible := 'La fecha de ingreso es posterior a la fecha de pago.';
  elsif p_fecha_cese is not null and p_fecha_cese <= p_fecha_pago then motivo_no_elegible := 'El trabajador ceso antes de la fecha de pago.';
  elsif coalesce(p_detalle.regimen_empresa_snap,'general') = 'microempresa' then motivo_no_elegible := 'El regimen microempresa no genera gratificacion.';
  else
    v_primer_mes := case when p_fecha_ingreso <= p_inicio_semestre then p_inicio_semestre
      when extract(day from p_fecha_ingreso) = 1 then date_trunc('month',p_fecha_ingreso)::date
      else (date_trunc('month',p_fecha_ingreso) + interval '1 month')::date end;
    v_primer_mes := greatest(v_primer_mes,p_inicio_semestre);
    if v_primer_mes > p_fin_semestre then motivo_no_elegible := 'No tiene meses completos trabajados en el semestre.';
    else
      meses_completos := least(6,greatest(0,((extract(year from p_fin_semestre)::integer-extract(year from v_primer_mes)::integer)*12)+extract(month from p_fin_semestre)::integer-extract(month from v_primer_mes)::integer+1));
      v_rem := coalesce(p_detalle.sueldo_proporcional,0)+coalesce(p_detalle.asignacion_familiar,0)+coalesce(p_detalle.bonif_altitud,0);
      v_factor := case when p_detalle.regimen_empresa_snap='pequena_empresa' then .5 else 1 end;
      gratificacion_pagada := round(v_rem*meses_completos/6*v_factor,2);
      bonif_extraordinaria_pagada := round(gratificacion_pagada*.09,2);
      if gratificacion_pagada <= 0 and bonif_extraordinaria_pagada <= 0 then motivo_no_elegible := 'La remuneracion computable es cero.';
      else
        elegible := true;
        -- Semestre pagado real; semestre futuro estimado una sola vez por provision.
        v_ingreso_anual := gratificacion_pagada+bonif_extraordinaria_pagada+coalesce(p_detalle.gratificacion_mensualizada,0)+coalesce(p_detalle.bonif_extraordinaria,0);
        v_base := coalesce(p_detalle.remuneracion_bruta,0)*12+v_ingreso_anual-(7*p_uit);
        if v_base <= 0 then retencion_ir_nueva := 0;
        elsif v_base <= 5*p_uit then v_impuesto := v_base*.08;
        elsif v_base <= 20*p_uit then v_impuesto := 5*p_uit*.08+(v_base-5*p_uit)*.14;
        elsif v_base <= 35*p_uit then v_impuesto := 5*p_uit*.08+15*p_uit*.14+(v_base-20*p_uit)*.17;
        elsif v_base <= 45*p_uit then v_impuesto := 5*p_uit*.08+15*p_uit*.14+15*p_uit*.17+(v_base-35*p_uit)*.20;
        else v_impuesto := 5*p_uit*.08+15*p_uit*.14+15*p_uit*.17+10*p_uit*.20+(v_base-45*p_uit)*.30;
        end if;
        if v_base > 0 then retencion_ir_nueva := greatest(0,v_impuesto-0)/greatest(1,12); end if;
        v_delta := retencion_ir_nueva-coalesce(p_detalle.retencion_ir,0);
        total_descuentos_nuevo := coalesce(p_detalle.total_descuentos,0)+v_delta;
        neto_nuevo := coalesce(p_detalle.neto,0)+gratificacion_pagada+bonif_extraordinaria_pagada-v_delta;
      end if;
    end if;
  end if;
  return next;
end; $$;

-- La confirmacion conserva sus firmas publicas; delega el calculo puro al helper.
create or replace function public._confirmar_gratificacion_real_periodo_impl_447(p_empresa_id text,p_periodo_id text,p_sociedad_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pago date; v_estado text; v_confirmada boolean; v_sociedad uuid; v_q integer; v_uit numeric;
  v_ini date; v_fin date; d public.nomina_detalle%rowtype; c record; v_ing date; v_cese date; v_laboral text;
  v_pagados integer:=0; v_tg numeric:=0; v_tb numeric:=0;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then raise exception 'No tienes acceso al tenant %.',p_empresa_id; end if;
  if not public.usuario_puede(p_empresa_id,'nomina','crear') then raise exception 'No tienes permiso para confirmar gratificacion real en este tenant.'; end if;
  select fecha_pago,estado,gratificacion_real_confirmada,sociedad_id,quincena into v_pago,v_estado,v_confirmada,v_sociedad,v_q from public.periodos_nomina where id=p_periodo_id and empresa_id=p_empresa_id and ((p_sociedad_id is null and sociedad_id is null) or sociedad_id=p_sociedad_id) for update;
  if not found then raise exception 'El periodo % no existe para el tenant o sociedad indicados.',p_periodo_id; end if;
  if v_estado in ('cerrado','anulado') then raise exception 'No se puede confirmar gratificacion real en un periodo cerrado o anulado.'; end if;
  if v_confirmada then raise exception 'La gratificacion real del periodo % ya fue confirmada. Reprocesa el periodo para reiniciar la confirmacion.',p_periodo_id; end if;
  if v_pago is null or extract(month from v_pago) not in (7,12) then raise exception 'El periodo % no tiene una fecha de pago en julio o diciembre.',p_periodo_id; end if;
  if v_q is not null and v_q<>1 then raise exception 'La confirmacion de gratificacion real solo aplica a la primera quincena del mes de pago.'; end if;
  if not exists(select 1 from public.nomina_detalle where empresa_id=p_empresa_id and periodo_id=p_periodo_id and (p_sociedad_id is null or sociedad_id=p_sociedad_id)) then raise exception 'El periodo % no tiene nomina procesada. Debes procesarlo antes de confirmar la gratificacion.',p_periodo_id; end if;
  v_ini:=make_date(extract(year from v_pago)::integer,case when extract(month from v_pago)=7 then 1 else 7 end,1); v_fin:=make_date(extract(year from v_pago)::integer,case when extract(month from v_pago)=7 then 6 else 12 end,case when extract(month from v_pago)=7 then 30 else 31 end);
  select coalesce(uit_vigente,5500) into v_uit from public.empresa_config where empresa_id=p_empresa_id; if not found then v_uit:=5500; end if;
  for d in select * from public.nomina_detalle where empresa_id=p_empresa_id and periodo_id=p_periodo_id and (p_sociedad_id is null or sociedad_id=p_sociedad_id) for update loop
    if d.trabajador_tipo='operativo' then select fecha_ingreso,fecha_cese,estado_laboral into v_ing,v_cese,v_laboral from public.personal_operativo where id=d.trabajador_id and empresa_id=p_empresa_id; elsif d.trabajador_tipo='administrativo' then select fecha_ingreso,fecha_cese,estado_laboral into v_ing,v_cese,v_laboral from public.personal_administrativo where id=d.trabajador_id and empresa_id=p_empresa_id; else raise exception 'El trabajador % tiene tipo de personal no soportado: %.',d.trabajador_id,d.trabajador_tipo; end if;
    if not found then raise exception 'No existe la ficha de personal % usada por el snapshot de nomina.',d.trabajador_id; end if;
    select * into c from public._calcular_gratificacion_real_trabajador_448(d,v_ing,v_cese,v_laboral,v_pago,v_ini,v_fin,v_uit,false);
    if c.elegible then update public.nomina_detalle set gratificacion_pagada=c.gratificacion_pagada,bonif_extraordinaria_pagada=c.bonif_extraordinaria_pagada,remuneracion_bruta=coalesce(remuneracion_bruta,0)+c.gratificacion_pagada+c.bonif_extraordinaria_pagada,retencion_ir=c.retencion_ir_nueva,total_descuentos=c.total_descuentos_nuevo,neto=c.neto_nuevo where id=d.id; v_pagados:=v_pagados+1; v_tg:=v_tg+c.gratificacion_pagada; v_tb:=v_tb+c.bonif_extraordinaria_pagada;
    else update public.nomina_detalle set gratificacion_pagada=0,bonif_extraordinaria_pagada=0 where id=d.id and (coalesce(gratificacion_pagada,0)<>0 or coalesce(bonif_extraordinaria_pagada,0)<>0); end if;
  end loop;
  update public.periodos_nomina set gratificacion_real_confirmada=true where id=p_periodo_id and empresa_id=p_empresa_id and sociedad_id is not distinct from v_sociedad;
  return jsonb_build_object('periodo_id',p_periodo_id,'trabajadores_con_pago',v_pagados,'gratificacion_total',v_tg,'bonif_extraordinaria_total',v_tb,'monto_total',v_tg+v_tb);
end; $$;

create or replace function public._previsualizar_gratificacion_real_periodo_impl_448(p_empresa_id text,p_periodo_id text,p_sociedad_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pago date; v_confirmada boolean; v_sociedad uuid; v_q integer; v_uit numeric; v_ini date; v_fin date;
 d public.nomina_detalle%rowtype; c record; v_ing date; v_cese date; v_laboral text; v_nombre text; a jsonb:='[]'::jsonb; v_tg numeric:=0; v_tb numeric:=0;
begin
 if not public.usuario_tiene_empresa(p_empresa_id) then raise exception 'No tienes acceso al tenant %.',p_empresa_id; end if;
 if not public.usuario_puede(p_empresa_id,'nomina','crear') then raise exception 'No tienes permiso para previsualizar gratificacion real en este tenant.'; end if;
 select fecha_pago,gratificacion_real_confirmada,sociedad_id,quincena into v_pago,v_confirmada,v_sociedad,v_q from public.periodos_nomina where id=p_periodo_id and empresa_id=p_empresa_id and ((p_sociedad_id is null and sociedad_id is null) or sociedad_id=p_sociedad_id);
 if not found then raise exception 'El periodo % no existe para el tenant o sociedad indicados.',p_periodo_id; end if;
 if v_pago is null or extract(month from v_pago) not in (7,12) then raise exception 'El periodo % no tiene una fecha de pago en julio o diciembre.',p_periodo_id; end if;
 if v_q is not null and v_q<>1 then raise exception 'La previsualizacion de gratificacion real solo aplica a la primera quincena del mes de pago.'; end if;
 v_ini:=make_date(extract(year from v_pago)::integer,case when extract(month from v_pago)=7 then 1 else 7 end,1); v_fin:=make_date(extract(year from v_pago)::integer,case when extract(month from v_pago)=7 then 6 else 12 end,case when extract(month from v_pago)=7 then 30 else 31 end);
 select coalesce(uit_vigente,5500) into v_uit from public.empresa_config where empresa_id=p_empresa_id; if not found then v_uit:=5500; end if;
 for d in select * from public.nomina_detalle where empresa_id=p_empresa_id and periodo_id=p_periodo_id and (p_sociedad_id is null or sociedad_id=p_sociedad_id) loop
  if d.trabajador_tipo='operativo' then select nombre,fecha_ingreso,fecha_cese,estado_laboral into v_nombre,v_ing,v_cese,v_laboral from public.personal_operativo where id=d.trabajador_id and empresa_id=p_empresa_id; elsif d.trabajador_tipo='administrativo' then select nombre,fecha_ingreso,fecha_cese,estado_laboral into v_nombre,v_ing,v_cese,v_laboral from public.personal_administrativo where id=d.trabajador_id and empresa_id=p_empresa_id; else raise exception 'El trabajador % tiene tipo de personal no soportado: %.',d.trabajador_id,d.trabajador_tipo; end if;
  if not found then raise exception 'No existe la ficha de personal % usada por el snapshot de nomina.',d.trabajador_id; end if;
  select * into c from public._calcular_gratificacion_real_trabajador_448(d,v_ing,v_cese,v_laboral,v_pago,v_ini,v_fin,v_uit,v_confirmada);
  a:=a||jsonb_build_array(jsonb_build_object('trabajador_id',d.trabajador_id,'trabajador_tipo',d.trabajador_tipo,'trabajador_nombre',v_nombre,'elegible',c.elegible,'motivo_no_elegible',c.motivo_no_elegible,'meses_completos',c.meses_completos,'gratificacion_pagada',c.gratificacion_pagada,'bonif_extraordinaria_pagada',c.bonif_extraordinaria_pagada,'retencion_ir_nueva',c.retencion_ir_nueva,'neto_nuevo',c.neto_nuevo)); v_tg:=v_tg+c.gratificacion_pagada; v_tb:=v_tb+c.bonif_extraordinaria_pagada;
 end loop;
 return jsonb_build_object('periodo_id',p_periodo_id,'gratificacion_real_confirmada',v_confirmada,'detalle',a,'totales',jsonb_build_object('gratificacion_pagada',v_tg,'bonif_extraordinaria_pagada',v_tb,'monto_total',v_tg+v_tb));
end; $$;

create or replace function public.previsualizar_gratificacion_real_periodo(p_empresa_id text,p_periodo_id text) returns jsonb language sql security definer set search_path=public as $$ select public._previsualizar_gratificacion_real_periodo_impl_448(p_empresa_id,p_periodo_id,null); $$;
create or replace function public.previsualizar_gratificacion_real_periodo_sociedad(p_empresa_id text,p_periodo_id text,p_sociedad_id uuid) returns jsonb language sql security definer set search_path=public as $$ select public._previsualizar_gratificacion_real_periodo_impl_448(p_empresa_id,p_periodo_id,p_sociedad_id); $$;
revoke all on function public._calcular_gratificacion_real_trabajador_448(public.nomina_detalle,date,date,text,date,date,date,numeric,boolean) from public,anon,authenticated;
revoke all on function public._previsualizar_gratificacion_real_periodo_impl_448(text,text,uuid) from public,anon,authenticated;
revoke all on function public.previsualizar_gratificacion_real_periodo(text,text) from public,anon;
revoke all on function public.previsualizar_gratificacion_real_periodo_sociedad(text,text,uuid) from public,anon;
grant execute on function public.previsualizar_gratificacion_real_periodo(text,text) to authenticated,service_role;
grant execute on function public.previsualizar_gratificacion_real_periodo_sociedad(text,text,uuid) to authenticated,service_role;
select pg_notify('pgrst','reload schema');
commit;
