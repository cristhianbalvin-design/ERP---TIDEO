-- Sobretasa discrecional de gratificacion real.
--
-- El override es una decision auditable previa a la confirmacion: nunca reduce
-- el minimo legal y no aplica a microempresa ni a personal no elegible.
-- Las firmas publicas de confirmar/previsualizar gratificacion no cambian.

create table if not exists public.gratificacion_overrides_discrecionales (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        text not null references public.empresas(id) on delete cascade,
  periodo_id        text not null references public.periodos_nomina(id) on delete cascade,
  sociedad_id       uuid references public.sociedades(id) on delete cascade,
  trabajador_id     text not null,
  trabajador_tipo   text not null check (trabajador_tipo in ('operativo', 'administrativo')),
  factor_legal      numeric(4,2) not null check (factor_legal in (0.50, 1.00)),
  factor_aplicado   numeric(4,2) not null check (factor_aplicado >= factor_legal and factor_aplicado <= 1.00),
  motivo            text not null check (btrim(motivo) <> ''),
  autorizado_por    text not null references public.usuarios(id) on delete restrict,
  autorizado_en     timestamptz not null default now(),
  estado            text not null default 'activo' check (estado in ('activo', 'anulado')),
  creado_en         timestamptz not null default now()
);

-- Solo puede haber una decision vigente por trabajador. Las anuladas quedan
-- como historial y no impiden crear el reemplazo al reprocesar.
create unique index if not exists gratificacion_overrides_discrecionales_activo_unico
  on public.gratificacion_overrides_discrecionales (
    empresa_id, periodo_id, coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid),
    trabajador_id, trabajador_tipo
  )
  where estado = 'activo';

create index if not exists gratificacion_overrides_discrecionales_periodo_idx
  on public.gratificacion_overrides_discrecionales (empresa_id, periodo_id, sociedad_id, estado);

alter table public.gratificacion_overrides_discrecionales enable row level security;

-- La escritura es exclusivamente por RPC security definer para derivar el
-- autorizador de auth.uid(); la lectura directa conserva aislamiento por tenant.
drop policy if exists gratificacion_overrides_discrecionales_select
  on public.gratificacion_overrides_discrecionales;
create policy gratificacion_overrides_discrecionales_select
  on public.gratificacion_overrides_discrecionales
  for select using (public.usuario_tiene_empresa(empresa_id));

-- Conserva la trazabilidad de un reproceso sin borrar el registro aprobado.
create or replace function public._anular_overrides_gratificacion_por_reproceso_451(
  p_empresa_id text,
  p_periodo_id text,
  p_sociedad_id uuid,
  p_motivo text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_override public.gratificacion_overrides_discrecionales%rowtype;
  v_count integer := 0;
begin
  for v_override in
    update public.gratificacion_overrides_discrecionales
       set estado = 'anulado'
     where empresa_id = p_empresa_id
       and periodo_id = p_periodo_id
       and sociedad_id is not distinct from p_sociedad_id
       and estado = 'activo'
    returning *
  loop
    v_count := v_count + 1;
    insert into public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
    values (
      p_empresa_id, auth.uid(), 'nomina', 'gratificacion_overrides_discrecionales', v_override.id::text,
      'override_gratificacion_anulado_por_reproceso',
      jsonb_build_object(
        'periodo_id', p_periodo_id,
        'sociedad_id', p_sociedad_id,
        'trabajador_id', v_override.trabajador_id,
        'trabajador_tipo', v_override.trabajador_tipo,
        'factor_aplicado', v_override.factor_aplicado,
        'motivo_anulacion', p_motivo
      )
    );
  end loop;
  return v_count;
end;
$$;

-- Reemplaza el helper compartido sin cambiar su firma. p_detalle contiene el
-- periodo y la sociedad del snapshot, por lo que ambos consumidores resuelven
-- exactamente el mismo override activo.
create or replace function public._calcular_gratificacion_real_trabajador_448(
  p_detalle public.nomina_detalle, p_fecha_ingreso date, p_fecha_cese date,
  p_estado_laboral text, p_fecha_pago date, p_inicio_semestre date,
  p_fin_semestre date, p_uit numeric, p_montos_confirmados boolean default false
)
returns table(elegible boolean, motivo_no_elegible text, meses_completos integer,
  gratificacion_pagada numeric, bonif_extraordinaria_pagada numeric,
  retencion_ir_nueva numeric, total_descuentos_nuevo numeric, neto_nuevo numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_primer_mes date;
  v_rem numeric;
  v_factor_legal numeric;
  v_factor numeric;
  v_factor_override numeric;
  v_base numeric;
  v_impuesto numeric;
  v_ingreso_anual numeric;
  v_delta numeric;
begin
  elegible := false;
  meses_completos := 0;
  gratificacion_pagada := 0;
  bonif_extraordinaria_pagada := 0;
  retencion_ir_nueva := coalesce(p_detalle.retencion_ir, 0);
  total_descuentos_nuevo := coalesce(p_detalle.total_descuentos, 0);
  neto_nuevo := coalesce(p_detalle.neto, 0);

  -- Un periodo confirmado es historico: no se reinterpreta por overrides posteriores.
  if p_montos_confirmados then
    gratificacion_pagada := coalesce(p_detalle.gratificacion_pagada, 0);
    bonif_extraordinaria_pagada := coalesce(p_detalle.bonif_extraordinaria_pagada, 0);
    elegible := gratificacion_pagada > 0 or bonif_extraordinaria_pagada > 0;
    if not elegible then
      motivo_no_elegible := 'No se confirmo pago de gratificacion para el trabajador.';
    end if;
    return next;
    return;
  end if;

  if p_estado_laboral is distinct from 'activo' then
    motivo_no_elegible := 'El trabajador no esta activo en la fecha de pago.';
  elsif p_fecha_ingreso is null then
    motivo_no_elegible := 'El trabajador no tiene fecha de ingreso.';
  elsif p_fecha_ingreso > p_fecha_pago then
    motivo_no_elegible := 'La fecha de ingreso es posterior a la fecha de pago.';
  elsif p_fecha_cese is not null and p_fecha_cese <= p_fecha_pago then
    motivo_no_elegible := 'El trabajador ceso antes de la fecha de pago.';
  elsif coalesce(p_detalle.regimen_empresa_snap, 'general') = 'microempresa' then
    motivo_no_elegible := 'El regimen microempresa no genera gratificacion.';
  else
    v_primer_mes := case
      when p_fecha_ingreso <= p_inicio_semestre then p_inicio_semestre
      when extract(day from p_fecha_ingreso) = 1 then date_trunc('month', p_fecha_ingreso)::date
      else (date_trunc('month', p_fecha_ingreso) + interval '1 month')::date
    end;
    v_primer_mes := greatest(v_primer_mes, p_inicio_semestre);

    if v_primer_mes > p_fin_semestre then
      motivo_no_elegible := 'No tiene meses completos trabajados en el semestre.';
    else
      meses_completos := least(6, greatest(0,
        ((extract(year from p_fin_semestre)::integer - extract(year from v_primer_mes)::integer) * 12)
        + extract(month from p_fin_semestre)::integer - extract(month from v_primer_mes)::integer + 1
      ));
      v_rem := coalesce(p_detalle.sueldo_proporcional, 0)
        + coalesce(p_detalle.asignacion_familiar, 0)
        + coalesce(p_detalle.bonif_altitud, 0);
      v_factor_legal := case when p_detalle.regimen_empresa_snap = 'pequena_empresa' then 0.5 else 1 end;

      select o.factor_aplicado into v_factor_override
      from public.gratificacion_overrides_discrecionales o
      where o.empresa_id = p_detalle.empresa_id
        and o.periodo_id = p_detalle.periodo_id
        and o.sociedad_id is not distinct from p_detalle.sociedad_id
        and o.trabajador_id = p_detalle.trabajador_id
        and o.trabajador_tipo = p_detalle.trabajador_tipo
        and o.estado = 'activo';

      v_factor := coalesce(v_factor_override, v_factor_legal);
      gratificacion_pagada := round(v_rem * meses_completos / 6 * v_factor, 2);
      bonif_extraordinaria_pagada := round(gratificacion_pagada * .09, 2);

      if gratificacion_pagada <= 0 and bonif_extraordinaria_pagada <= 0 then
        motivo_no_elegible := 'La remuneracion computable es cero.';
      else
        elegible := true;
        -- Semestre pagado real; semestre futuro estimado una sola vez por provision.
        v_ingreso_anual := gratificacion_pagada + bonif_extraordinaria_pagada
          + coalesce(p_detalle.gratificacion_mensualizada, 0)
          + coalesce(p_detalle.bonif_extraordinaria, 0);
        v_base := coalesce(p_detalle.remuneracion_bruta, 0) * 12 + v_ingreso_anual - (7 * p_uit);
        if v_base <= 0 then
          retencion_ir_nueva := 0;
        elsif v_base <= 5 * p_uit then
          v_impuesto := v_base * .08;
        elsif v_base <= 20 * p_uit then
          v_impuesto := 5 * p_uit * .08 + (v_base - 5 * p_uit) * .14;
        elsif v_base <= 35 * p_uit then
          v_impuesto := 5 * p_uit * .08 + 15 * p_uit * .14 + (v_base - 20 * p_uit) * .17;
        elsif v_base <= 45 * p_uit then
          v_impuesto := 5 * p_uit * .08 + 15 * p_uit * .14 + 15 * p_uit * .17 + (v_base - 35 * p_uit) * .20;
        else
          v_impuesto := 5 * p_uit * .08 + 15 * p_uit * .14 + 15 * p_uit * .17 + 10 * p_uit * .20 + (v_base - 45 * p_uit) * .30;
        end if;
        if v_base > 0 then
          retencion_ir_nueva := greatest(0, v_impuesto) / greatest(1, 12);
        end if;
        v_delta := retencion_ir_nueva - coalesce(p_detalle.retencion_ir, 0);
        total_descuentos_nuevo := coalesce(p_detalle.total_descuentos, 0) + v_delta;
        neto_nuevo := coalesce(p_detalle.neto, 0) + gratificacion_pagada + bonif_extraordinaria_pagada - v_delta;
      end if;
    end if;
  end if;
  return next;
end;
$$;

create or replace function public.crear_override_gratificacion_discrecional(
  p_empresa_id text,
  p_periodo_id text,
  p_trabajador_id text,
  p_trabajador_tipo text,
  p_factor_aplicado numeric,
  p_motivo text,
  p_sociedad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago date;
  v_estado_periodo text;
  v_confirmada boolean;
  v_quincena integer;
  v_uit numeric;
  v_inicio_semestre date;
  v_fin_semestre date;
  v_fecha_ingreso date;
  v_fecha_cese date;
  v_estado_laboral text;
  v_factor_legal numeric;
  v_usuario_id text;
  v_detalle public.nomina_detalle%rowtype;
  v_calculo record;
  v_anterior uuid;
  v_override public.gratificacion_overrides_discrecionales%rowtype;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'nomina', 'crear') then
    raise exception 'No tienes permiso para autorizar una sobretasa de gratificacion.';
  end if;
  if p_trabajador_tipo not in ('operativo', 'administrativo') then
    raise exception 'Tipo de trabajador no soportado.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'El motivo de la sobretasa discrecional es obligatorio.';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where id = auth.uid()::text
  limit 1;
  if v_usuario_id is null then
    raise exception 'No se pudo identificar al usuario que autoriza la sobretasa.';
  end if;

  select fecha_pago, estado, gratificacion_real_confirmada, quincena
    into v_pago, v_estado_periodo, v_confirmada, v_quincena
  from public.periodos_nomina
  where id = p_periodo_id
    and empresa_id = p_empresa_id
    and sociedad_id is not distinct from p_sociedad_id
  for update;
  if not found then
    raise exception 'El periodo % no existe para el tenant o sociedad indicados.', p_periodo_id;
  end if;
  if v_estado_periodo in ('cerrado', 'anulado') then
    raise exception 'No se puede crear una sobretasa en un periodo cerrado o anulado.';
  end if;
  if v_confirmada then
    raise exception 'La gratificacion real del periodo ya fue confirmada. Reprocesa el periodo antes de cambiar una sobretasa.';
  end if;
  if v_pago is null or extract(month from v_pago) not in (7, 12) then
    raise exception 'La sobretasa discrecional solo aplica a periodos pagados en julio o diciembre.';
  end if;
  if v_quincena is not null and v_quincena <> 1 then
    raise exception 'La sobretasa discrecional solo aplica a la primera quincena del mes de pago.';
  end if;

  select * into v_detalle
  from public.nomina_detalle
  where empresa_id = p_empresa_id
    and periodo_id = p_periodo_id
    and sociedad_id is not distinct from p_sociedad_id
    and trabajador_id = p_trabajador_id
    and trabajador_tipo = p_trabajador_tipo
  for update;
  if not found then
    raise exception 'El trabajador no pertenece al snapshot de nomina del periodo.';
  end if;

  if v_detalle.trabajador_tipo = 'operativo' then
    select fecha_ingreso, fecha_cese, estado_laboral
      into v_fecha_ingreso, v_fecha_cese, v_estado_laboral
    from public.personal_operativo
    where id = v_detalle.trabajador_id and empresa_id = p_empresa_id;
  else
    select fecha_ingreso, fecha_cese, estado_laboral
      into v_fecha_ingreso, v_fecha_cese, v_estado_laboral
    from public.personal_administrativo
    where id = v_detalle.trabajador_id and empresa_id = p_empresa_id;
  end if;
  if not found then
    raise exception 'No existe la ficha de personal usada por el snapshot de nomina.';
  end if;
  if coalesce(v_detalle.regimen_empresa_snap, 'general') = 'microempresa' then
    raise exception 'No se permite sobretasa discrecional para regimen microempresa.';
  end if;

  v_factor_legal := case when v_detalle.regimen_empresa_snap = 'pequena_empresa' then 0.5 else 1 end;
  if p_factor_aplicado is null or p_factor_aplicado < v_factor_legal or p_factor_aplicado > 1 then
    raise exception 'El factor aplicado debe estar entre el factor legal (%) y 1.00.', v_factor_legal;
  end if;
  if p_factor_aplicado <= v_factor_legal then
    raise exception 'La sobretasa discrecional debe ser mayor al factor legal de %.', v_factor_legal;
  end if;

  v_inicio_semestre := make_date(extract(year from v_pago)::integer, case when extract(month from v_pago) = 7 then 1 else 7 end, 1);
  v_fin_semestre := make_date(extract(year from v_pago)::integer, case when extract(month from v_pago) = 7 then 6 else 12 end, case when extract(month from v_pago) = 7 then 30 else 31 end);
  select coalesce(uit_vigente, 5500) into v_uit from public.empresa_config where empresa_id = p_empresa_id;
  if not found then v_uit := 5500; end if;

  select * into v_calculo from public._calcular_gratificacion_real_trabajador_448(
    v_detalle, v_fecha_ingreso, v_fecha_cese, v_estado_laboral,
    v_pago, v_inicio_semestre, v_fin_semestre, v_uit, false
  );
  if not v_calculo.elegible or v_calculo.meses_completos <= 0 then
    raise exception 'No se permite sobretasa para un trabajador no elegible: %.', coalesce(v_calculo.motivo_no_elegible, 'sin meses completos');
  end if;

  update public.gratificacion_overrides_discrecionales
     set estado = 'anulado'
   where empresa_id = p_empresa_id
     and periodo_id = p_periodo_id
     and sociedad_id is not distinct from p_sociedad_id
     and trabajador_id = p_trabajador_id
     and trabajador_tipo = p_trabajador_tipo
     and estado = 'activo'
  returning id into v_anterior;

  insert into public.gratificacion_overrides_discrecionales (
    empresa_id, periodo_id, sociedad_id, trabajador_id, trabajador_tipo,
    factor_legal, factor_aplicado, motivo, autorizado_por
  ) values (
    p_empresa_id, p_periodo_id, p_sociedad_id, p_trabajador_id, p_trabajador_tipo,
    v_factor_legal, p_factor_aplicado, btrim(p_motivo), v_usuario_id
  ) returning * into v_override;

  if v_anterior is not null then
    insert into public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
    values (p_empresa_id, auth.uid(), 'nomina', 'gratificacion_overrides_discrecionales', v_anterior::text,
      'override_gratificacion_reemplazado', jsonb_build_object('reemplazado_por', v_override.id, 'periodo_id', p_periodo_id));
  end if;
  insert into public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
  values (p_empresa_id, auth.uid(), 'nomina', 'gratificacion_overrides_discrecionales', v_override.id::text,
    'override_gratificacion_autorizado', jsonb_build_object(
      'periodo_id', p_periodo_id, 'sociedad_id', p_sociedad_id,
      'trabajador_id', p_trabajador_id, 'trabajador_tipo', p_trabajador_tipo,
      'factor_legal', v_factor_legal, 'factor_aplicado', p_factor_aplicado, 'motivo', btrim(p_motivo)
    ));

  return jsonb_build_object('id', v_override.id, 'factor_legal', v_override.factor_legal,
    'factor_aplicado', v_override.factor_aplicado, 'estado', v_override.estado);
end;
$$;

create or replace function public.listar_overrides_gratificacion_discrecional(
  p_empresa_id text,
  p_periodo_id text,
  p_sociedad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'nomina', 'crear') then
    raise exception 'No tienes permiso para consultar sobretasas de gratificacion.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'trabajador_id', o.trabajador_id, 'trabajador_tipo', o.trabajador_tipo,
      'factor_legal', o.factor_legal, 'factor_aplicado', o.factor_aplicado,
      'motivo', o.motivo, 'autorizado_por', o.autorizado_por,
      'autorizado_en', o.autorizado_en, 'estado', o.estado, 'creado_en', o.creado_en
    ) order by o.creado_en desc)
    from public.gratificacion_overrides_discrecionales o
    where o.empresa_id = p_empresa_id
      and o.periodo_id = p_periodo_id
      and o.sociedad_id is not distinct from p_sociedad_id
  ), '[]'::jsonb);
end;
$$;

-- Envolver las dos rutas de reproceso existentes permite anular el override
-- antes de que el snapshot se borre y se vuelva a calcular, sin cambiar firmas.
alter function public._guardar_nomina_detalle_periodo_impl_414(text, text, jsonb)
  rename to _guardar_nomina_detalle_periodo_impl_451_base;

create function public._guardar_nomina_detalle_periodo_impl_414(
  p_empresa_id text,
  p_periodo_id text,
  p_filas jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'nomina', 'crear') then
    raise exception 'No tienes permiso para procesar nomina en este tenant.';
  end if;
  perform 1 from public.periodos_nomina
   where id = p_periodo_id and empresa_id = p_empresa_id
   for update;
  if not found then
    raise exception 'El periodo % no existe para este tenant.', p_periodo_id;
  end if;
  if exists (select 1 from public.periodos_nomina where id = p_periodo_id and empresa_id = p_empresa_id and estado in ('cerrado', 'anulado')) then
    raise exception 'No se puede reprocesar el periodo % porque esta cerrado o anulado.', p_periodo_id;
  end if;
  perform public._anular_overrides_gratificacion_por_reproceso_451(p_empresa_id, p_periodo_id, null, 'Override anulado por reproceso de nomina.');
  return public._guardar_nomina_detalle_periodo_impl_451_base(p_empresa_id, p_periodo_id, p_filas);
end;
$$;

-- Se recrea el wrapper legacy con su misma firma para que su llamada interna
-- resuelva el wrapper anterior (y no el objeto base renombrado) en el reproceso.
create or replace function public.guardar_nomina_detalle_periodo(
  p_empresa_id text,
  p_periodo_id text,
  p_filas jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if exists (
    select 1 from public.empresas
    where id = p_empresa_id and multisociedad_habilitado = true
  ) then
    raise exception 'La RPC legacy de nomina no admite tenants multisociedad. Usa guardar_nomina_detalle_periodo_sociedad.';
  end if;
  return public._guardar_nomina_detalle_periodo_impl_414(p_empresa_id, p_periodo_id, p_filas);
end;
$$;

alter function public.guardar_nomina_detalle_periodo_sociedad(text, text, uuid, jsonb)
  rename to _guardar_nomina_detalle_periodo_sociedad_impl_451_base;

create function public.guardar_nomina_detalle_periodo_sociedad(
  p_empresa_id text,
  p_periodo_id text,
  p_sociedad_id uuid,
  p_filas jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'nomina', 'crear') then
    raise exception 'No tienes permiso para procesar nomina en este tenant.';
  end if;
  perform 1 from public.periodos_nomina
   where id = p_periodo_id and empresa_id = p_empresa_id and sociedad_id = p_sociedad_id
   for update;
  if not found then
    raise exception 'El periodo % no existe para la sociedad indicada.', p_periodo_id;
  end if;
  if exists (select 1 from public.periodos_nomina where id = p_periodo_id and empresa_id = p_empresa_id and sociedad_id = p_sociedad_id and estado in ('cerrado', 'anulado')) then
    raise exception 'No se puede reprocesar el periodo % porque esta cerrado o anulado.', p_periodo_id;
  end if;
  perform public._anular_overrides_gratificacion_por_reproceso_451(p_empresa_id, p_periodo_id, p_sociedad_id, 'Override anulado por reproceso de nomina.');
  return public._guardar_nomina_detalle_periodo_sociedad_impl_451_base(p_empresa_id, p_periodo_id, p_sociedad_id, p_filas);
end;
$$;

revoke all on function public._anular_overrides_gratificacion_por_reproceso_451(text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public._calcular_gratificacion_real_trabajador_448(public.nomina_detalle, date, date, text, date, date, date, numeric, boolean) from public, anon, authenticated;
revoke all on function public._guardar_nomina_detalle_periodo_impl_451_base(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._guardar_nomina_detalle_periodo_sociedad_impl_451_base(text, text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._guardar_nomina_detalle_periodo_impl_414(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.guardar_nomina_detalle_periodo(text, text, jsonb) from public, anon;
revoke all on function public.crear_override_gratificacion_discrecional(text, text, text, text, numeric, text, uuid) from public, anon;
revoke all on function public.listar_overrides_gratificacion_discrecional(text, text, uuid) from public, anon;
grant execute on function public.guardar_nomina_detalle_periodo(text, text, jsonb) to authenticated, service_role;
grant execute on function public.guardar_nomina_detalle_periodo_sociedad(text, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.crear_override_gratificacion_discrecional(text, text, text, text, numeric, text, uuid) to authenticated, service_role;
grant execute on function public.listar_overrides_gratificacion_discrecional(text, text, uuid) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
