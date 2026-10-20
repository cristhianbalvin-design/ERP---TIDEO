-- RRHH: respeta la convención de Personal Operativo por honorarios (sueldo_base = 0; el
-- honorario va en monto_mensual, como guarda el formulario de edición). La migración
-- 20261019200000 había copiado el honorario también en sueldo_base de 17 fichas operativas
-- por honorarios (16 que ya tenían 0 + Andre TEC-0021). monto_mensual y tarifa_hora no cambian.

update public.personal_operativo p
   set sueldo_base = 0, updated_at = now()
  from public.respaldo_ficha_contrato_20261019 r
 where r.personal_tipo = 'operativo' and p.id = r.personal_id
   and p.modalidad_contrato = 'honorarios'
   and coalesce(p.sueldo_base, 0) <> 0;

create or replace function public.sincronizar_ficha_desde_contrato()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tipo record;
  v_cl jsonb := coalesce(new.condiciones_laborales, '{}'::jsonb);
  v_cambios jsonb := coalesce(new.adenda_cambios, '{}'::jsonb);
  v_es_adenda boolean;
  v_usar_rem boolean;
  v_usar_sede boolean;
  v_usar_mod boolean;
  v_monto numeric;
  v_tipo_canon text;
  v_codigo text;
  v_sede text;
  v_sede_id text;
  v_area_id text;
  v_modalidad text;
begin
  if new.estado_validacion is distinct from 'aprobado' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.estado_validacion = 'aprobado' then
    return null;
  end if;
  if new.personal_id is null or new.personal_tipo not in ('operativo', 'administrativo') then
    return null;
  end if;
  if coalesce(new.periodo_estado, 'vigente') in ('archivado', 'anulado', 'rechazado') then
    return null;
  end if;

  select t.captura_snapshot_laboral, t.documento_padre_tipo_id, t.tipo_sucesor_id
    into v_tipo
    from public.tipos_documento_empresa t
   where t.id = new.tipo_documento_id;
  if not found or not coalesce(v_tipo.captura_snapshot_laboral, false) then
    return null;
  end if;

  v_es_adenda := v_tipo.documento_padre_tipo_id is not null or new.contrato_referencia_id is not null;
  -- Contrato Primigenio: histórico, captura la ficha al subirse y no la sobrescribe.
  if not v_es_adenda and v_tipo.tipo_sucesor_id is not null then
    return null;
  end if;
  -- Adenda con vigencia futura: se aplica manualmente en su fecha.
  if new.fecha_vigencia_cambio is not null and new.fecha_vigencia_cambio > current_date then
    return null;
  end if;

  v_usar_rem  := not v_es_adenda or lower(coalesce(v_cambios ->> 'remuneracion', '')) in ('true', 't', '1');
  v_usar_sede := not v_es_adenda or lower(coalesce(v_cambios ->> 'sede', '')) in ('true', 't', '1');
  v_usar_mod  := not v_es_adenda or lower(coalesce(v_cambios ->> 'modalidad', '')) in ('true', 't', '1');

  if v_usar_rem and coalesce(v_cl ->> 'remuneracion_base', '') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
    v_monto := (v_cl ->> 'remuneracion_base')::numeric;
    if v_monto <= 0 then
      v_monto := null;
    end if;
  end if;

  if not v_es_adenda then
    v_tipo_canon := public.rrhh_tipo_contrato_canonico(v_cl ->> 'tipo_contrato');
    if (v_cl ->> 'tipo_contrato') ~ '^[0-9]{4}$' then
      v_codigo := v_cl ->> 'tipo_contrato';
    end if;
    v_area_id := nullif(btrim(v_cl ->> 'area_id'), '');
  end if;

  if v_usar_sede then
    v_sede := nullif(btrim(coalesce(v_cl ->> 'sede_nombre', v_cl ->> 'sede')), '');
    v_sede_id := nullif(btrim(v_cl ->> 'sede_id'), '');
  end if;
  if v_usar_mod then
    v_modalidad := nullif(btrim(v_cl ->> 'modalidad'), '');
  end if;

  begin
  if new.personal_tipo = 'operativo' then
    update public.personal_operativo p set
      -- Operativo por honorarios: sueldo_base = 0 y el honorario va en monto_mensual (convención del formulario).
      sueldo_base   = case when v_monto is null then p.sueldo_base
                           when p.modalidad_contrato = 'honorarios' then 0 else v_monto end,
      monto_mensual = coalesce(v_monto, p.monto_mensual),
      tipo_contrato = coalesce(v_tipo_canon, p.tipo_contrato),
      tipo_contrato_catalogo_codigo = case
        when v_codigo is not null then v_codigo
        when v_tipo_canon is not null and v_tipo_canon is distinct from public.rrhh_tipo_contrato_canonico(p.tipo_contrato) then null
        else p.tipo_contrato_catalogo_codigo end,
      sede    = coalesce(v_sede, p.sede),
      sede_id = coalesce(v_sede_id, p.sede_id),
      area_id = coalesce(v_area_id, p.area_id),
      updated_at = now()
    where p.id = new.personal_id and p.empresa_id = new.empresa_id;
  else
    update public.personal_administrativo p set
      sueldo_base   = coalesce(v_monto, p.sueldo_base),
      remuneracion  = coalesce(v_monto, p.remuneracion),
      monto_mensual = coalesce(v_monto, p.monto_mensual),
      tipo_contrato = coalesce(v_tipo_canon, p.tipo_contrato),
      tipo_contrato_catalogo_codigo = case
        when v_codigo is not null then v_codigo
        when v_tipo_canon is not null and v_tipo_canon is distinct from public.rrhh_tipo_contrato_canonico(p.tipo_contrato) then null
        else p.tipo_contrato_catalogo_codigo end,
      sede      = coalesce(v_sede, p.sede),
      sede_id   = coalesce(v_sede_id, p.sede_id),
      area_id   = coalesce(v_area_id, p.area_id),
      modalidad = coalesce(v_modalidad, p.modalidad),
      updated_at = now()
    where p.id = new.personal_id and p.empresa_id = new.empresa_id;
  end if;
  exception when others then
    -- La sincronización nunca debe impedir aprobar el documento.
    raise warning 'sincronizar_ficha_desde_contrato(%): %', new.id, sqlerrm;
  end;

  return null;
end;
$$;


do $$
declare v_n int; v_andre record;
begin
  select count(*) into v_n
    from public.respaldo_ficha_contrato_20261019 r
    join public.personal_operativo p on p.id = r.personal_id
   where r.personal_tipo = 'operativo' and p.modalidad_contrato = 'honorarios' and coalesce(p.sueldo_base, 0) <> 0;
  if v_n > 0 then
    raise exception 'Quedan % operativos por honorarios con sueldo_base distinto de 0', v_n;
  end if;
  select sueldo_base, monto_mensual, tarifa_hora into v_andre from public.personal_operativo where id = 'pop_1787421543684';
  if v_andre.sueldo_base <> 0 or v_andre.monto_mensual <> 1500 then
    raise exception 'Andre no quedó con sueldo_base 0 y monto_mensual 1500: %', row_to_json(v_andre);
  end if;
  if position('modalidad_contrato = ''honorarios'' then 0' in pg_get_functiondef('public.sincronizar_ficha_desde_contrato()'::regprocedure)) = 0 then
    raise exception 'La función de sincronización no quedó con la regla de honorarios';
  end if;
end $$;
