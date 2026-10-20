-- RRHH: la ficha del colaborador se sincroniza en base de datos al aprobar un contrato o adenda.
-- Hasta ahora la aprobación solo actualizaba la ficha en la pantalla abierta (estado de React);
-- al recargar volvía el valor anterior y la ficha quedaba distinta del contrato que usa nómina.
-- Regla (la misma que ya aplicaba el frontend, context.jsx aplicarSnapshotDocumentoPersonal):
--   * Solo tipos con captura_snapshot_laboral.
--   * El Contrato Primigenio (tiene tipo sucesor) es histórico: no empuja valores a la ficha.
--   * Una adenda solo aplica los campos marcados en adenda_cambios y si su vigencia ya empezó.
--   * Contrato: sueldo, tipo de contrato (normalizado + código del catálogo), sede, área, modalidad.
-- Además completa la migración 20261019200000: personal_administrativo.remuneracion quedó
-- desalineada de sueldo_base en 7 fichas corregidas; se respalda y se iguala.

-- 1) remuneracion de administrativos corregidos
alter table public.respaldo_ficha_contrato_20261019 add column if not exists remuneracion numeric;

update public.respaldo_ficha_contrato_20261019 r
   set remuneracion = pa.remuneracion
  from public.personal_administrativo pa
 where r.personal_tipo = 'administrativo' and pa.id = r.personal_id and r.remuneracion is null;

update public.personal_administrativo pa
   set remuneracion = pa.sueldo_base, updated_at = now()
  from public.respaldo_ficha_contrato_20261019 r
 where r.personal_tipo = 'administrativo' and pa.id = r.personal_id
   and r.sueldo_base is distinct from pa.sueldo_base
   and pa.remuneracion is distinct from pa.sueldo_base;

-- 2) Tipo de contrato canónico de la ficha
create or replace function public.rrhh_tipo_contrato_canonico(p_valor text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_valor is null or btrim(p_valor) = '' then null
    when lower(btrim(p_valor)) in ('1000', '1005', 'indefinido') then 'indefinido'
    when lower(btrim(p_valor)) in ('1001', '1002', '1003', '1004', 'plazo_fijo') then 'plazo_fijo'
    when lower(btrim(p_valor)) in ('honorarios', 'por_encargo') then 'por_encargo'
    when lower(btrim(p_valor)) in ('obra_determinada', 'por_obra') then 'obra_determinada'
    else null
  end
$$;

-- 3) Sincronización ficha <- contrato aprobado
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
      sueldo_base   = coalesce(v_monto, p.sueldo_base),
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

revoke all on function public.sincronizar_ficha_desde_contrato() from public, anon, authenticated;

create or replace trigger trg_sincronizar_ficha_desde_contrato
  after insert or update of estado_validacion on public.personal_documentos
  for each row execute function public.sincronizar_ficha_desde_contrato();

-- 4) Comprobaciones
do $$
declare
  v_remun int;
begin
  if public.rrhh_tipo_contrato_canonico('1001') <> 'plazo_fijo'
     or public.rrhh_tipo_contrato_canonico('honorarios') <> 'por_encargo'
     or public.rrhh_tipo_contrato_canonico('1000') <> 'indefinido'
     or public.rrhh_tipo_contrato_canonico('xyz') is not null then
    raise exception 'rrhh_tipo_contrato_canonico no normaliza como se espera';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_sincronizar_ficha_desde_contrato'
       and tgrelid = 'public.personal_documentos'::regclass
  ) then
    raise exception 'No se creó el trigger de sincronización';
  end if;

  select count(*) into v_remun
    from public.respaldo_ficha_contrato_20261019 r
    join public.personal_administrativo pa on pa.id = r.personal_id
   where r.personal_tipo = 'administrativo'
     and r.sueldo_base is distinct from pa.sueldo_base
     and pa.remuneracion is distinct from pa.sueldo_base;
  if v_remun > 0 then
    raise exception 'Quedan % administrativos con remuneracion distinta de sueldo_base', v_remun;
  end if;
end $$;
