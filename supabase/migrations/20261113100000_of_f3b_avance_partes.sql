-- F3b · Avance de la OF por partes diarios: registrar, revisar (aprobar u observar),
-- avance por operación, avance de la OF ponderado por horas estimadas y costo real.
-- Cambios de esquema (aditivos o que relajan una restricción):
--   * partes_diarios.orden_trabajo_id deja de ser NOT NULL (un parte puede ser de una OF);
--     nueva regla: exactamente una de orden_trabajo_id u orden_fabricacion_id.
--   * partes_diarios.costo_mano_obra: costo del parte fijado al aprobarlo.
--   * derivar_sociedad_parte_diario: deriva empresa/sociedad también desde la OF.

alter table public.partes_diarios alter column orden_trabajo_id drop not null;
alter table public.partes_diarios add column if not exists costo_mano_obra numeric(14,2);
alter table public.partes_diarios add constraint partes_diarios_ot_xor_of_chk
  check ((orden_trabajo_id is not null) <> (orden_fabricacion_id is not null));

-- Parte de la definición vigente; agrega la rama de la OF.
create or replace function public.derivar_sociedad_parte_diario()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_empresa_ot text;
  v_sociedad_ot uuid;
begin
  if new.orden_fabricacion_id is not null then
    select f.empresa_id, f.sociedad_id
      into v_empresa_ot, v_sociedad_ot
    from public.ordenes_fabricacion f
    where f.id = new.orden_fabricacion_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'PARTE_OF_INEXISTENTE: la OF del parte no existe.';
    end if;
  else
    select ot.empresa_id, ot.sociedad_id
      into v_empresa_ot, v_sociedad_ot
    from public.ordenes_trabajo ot
    where ot.id = new.orden_trabajo_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'PARTE_OT_INEXISTENTE: la OT del parte no existe.';
    end if;
  end if;

  if new.empresa_id is distinct from v_empresa_ot then
    raise exception using
      errcode = '23514',
      message = 'PARTE_EMPRESA_DIVERGENTE: la empresa del parte no coincide con la OT.';
  end if;

  if new.sociedad_id is not null
     and new.sociedad_id is distinct from v_sociedad_ot then
    raise exception using
      errcode = '23514',
      message = 'PARTE_SOCIEDAD_DIVERGENTE: la sociedad del parte no coincide con la OT.';
  end if;

  new.sociedad_id := v_sociedad_ot;
  return new;
end;
$function$;

-- Tarifa del técnico (ficha del personal); si no tiene, la del cargo de la operación.
create or replace function public.of_costo_hora_tecnico(p_empresa_id text, p_tecnico_id text, p_cargo_id text, p_moneda text)
returns numeric
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(
    public.of_convertir_moneda(
      (select nullif(coalesce(nullif(p.tarifa_hora, 0), p.costo_hora_real), 0)
         from public.personal_operativo p where p.id = p_tecnico_id and p.empresa_id = p_empresa_id),
      'PEN', p_moneda),
    public.of_costo_hora_cargo(p_empresa_id, p_cargo_id, p_moneda),
    0);
$$;

-- Recalcula horas, avance y estado de cada operación, el avance ponderado y el costo real de la OF.
create or replace function public.of_recalcular_avance(p_of_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_avance numeric;
  v_mo numeric;
  v_mat numeric;
begin
  update public.of_operaciones op
     set horas_reales = coalesce(s.horas, 0),
         avance_pct = coalesce(s.avance, 0),
         estado = case when op.estado = 'bloqueada' then op.estado
                       when coalesce(s.avance, 0) >= 100 then 'terminada'
                       when coalesce(s.horas, 0) > 0 or coalesce(s.avance, 0) > 0 then 'en_proceso'
                       else 'pendiente' end
    from (
      select o.id,
             (select sum(coalesce(p.horas_normales, 0) + coalesce(p.horas_extra, 0)) from public.partes_diarios p
               where p.of_operacion_id = o.id and p.estado = 'aprobado') horas,
             (select p.avance_tarea_validado from public.partes_diarios p
               where p.of_operacion_id = o.id and p.estado = 'aprobado'
               order by p.fecha desc, p.aprobado_at desc nulls last limit 1) avance
        from public.of_operaciones o where o.of_id = p_of_id) s
   where op.id = s.id;

  select case when sum(horas_estimadas) > 0
              then round(sum(horas_estimadas * avance_pct) / sum(horas_estimadas), 2)
              else round(coalesce(avg(avance_pct), 0), 2) end
    into v_avance
    from public.of_operaciones where of_id = p_of_id;
  select coalesce(sum(costo_mano_obra), 0) into v_mo
    from public.partes_diarios where orden_fabricacion_id = p_of_id and estado = 'aprobado';
  select coalesce(sum(coalesce(cantidad_real, 0) * costo_unitario), 0) into v_mat
    from public.of_materiales where of_id = p_of_id;

  update public.ordenes_fabricacion
     set avance_pct = least(greatest(coalesce(v_avance, 0), 0), 100),
         costo_real = round(v_mo + v_mat, 2)
   where id = p_of_id
  returning * into v;

  return jsonb_build_object('avance_pct', v.avance_pct, 'costo_real', v.costo_real, 'estado', v.estado);
end;
$$;

-- Técnicos que pueden registrar avance en la OF (personal operativo de la empresa).
create or replace function public.of_catalogo_avance(p_of_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_alc uuid[];
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver esta OF.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(v.empresa_id);
  if v_alc is not null and v.sociedad_id is not null and not (v.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la OF está fuera de tu alcance.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'puede_registrar', public.usuario_puede(v.empresa_id, 'of', 'editar'),
    'puede_revisar', public.usuario_puede(v.empresa_id, 'of', 'aprobar'),
    'tecnicos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre) order by p.nombre)
                            from public.personal_operativo p
                           where p.empresa_id = v.empresa_id and coalesce(p.estado, '') not in ('baja', 'inactivo', 'cesado')), '[]'::jsonb));
end;
$$;

-- Partes de la OF, del más reciente al más antiguo.
create or replace function public.of_partes(p_of_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_alc uuid[];
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver esta OF.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(v.empresa_id);
  if v_alc is not null and v.sociedad_id is not null and not (v.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la OF está fuera de tu alcance.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'numero', p.numero, 'fecha', p.fecha, 'estado', p.estado,
             'operacion_id', p.of_operacion_id, 'secuencia', o.secuencia, 'operacion', o.titulo,
             'tecnico_id', p.tecnico_id, 'tecnico', coalesce(p.tecnico_nombre, t.nombre),
             'horas', coalesce(p.horas_normales, 0) + coalesce(p.horas_extra, 0),
             'avance_reportado', p.avance_tarea_reportado, 'avance_validado', p.avance_tarea_validado,
             'detalle', p.actividad, 'costo', p.costo_mano_obra, 'aprobado_at', p.aprobado_at,
             'horas_operacion', o.horas_reales, 'horas_estimadas', o.horas_estimadas, 'avance_operacion', o.avance_pct)
           order by p.fecha desc, p.created_at desc)
      from public.partes_diarios p
      left join public.of_operaciones o on o.id = p.of_operacion_id
      left join public.personal_operativo t on t.id = p.tecnico_id
     where p.orden_fabricacion_id = p_of_id), '[]'::jsonb);
end;
$$;

-- Registra un parte en revisión sobre una operación de la OF.
create or replace function public.of_registrar_parte(p_of_id uuid, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v       public.ordenes_fabricacion%rowtype;
  v_op    public.of_operaciones%rowtype;
  v_tec   public.personal_operativo%rowtype;
  v_fecha date;
  v_horas numeric;
  v_avance numeric;
  v_id    text := 'pd_' || replace(gen_random_uuid()::text, '-', '');
  v_num   text;
begin
  v := public.of_exigir_edicion(p_of_id, array['aprobada', 'en_produccion']);
  begin
    v_fecha  := nullif(btrim(p_datos->>'fecha'), '')::date;
    v_horas  := nullif(btrim(p_datos->>'horas'), '')::numeric;
    v_avance := nullif(btrim(p_datos->>'avance'), '')::numeric;
  exception when others then
    raise exception 'Hay datos con formato no válido en el parte.';
  end;
  select * into v_op from public.of_operaciones
   where id = nullif(btrim(p_datos->>'operacion_id'), '')::uuid and of_id = v.id;
  if not found then raise exception 'Elige una operación de esta OF.'; end if;
  if v_op.estado = 'terminada' then raise exception 'La operación ya está terminada.'; end if;
  select * into v_tec from public.personal_operativo
   where id = nullif(btrim(p_datos->>'tecnico_id'), '') and empresa_id = v.empresa_id;
  if not found then raise exception 'Elige un técnico de la empresa.'; end if;
  if v_fecha is null or v_fecha > current_date then raise exception 'La fecha no puede ser futura.'; end if;
  if v_horas is null or v_horas <= 0 or v_horas > 24 or not public.of_max_dos_decimales(v_horas) then
    raise exception 'Las horas deben estar entre 0 y 24, con máximo 2 decimales.';
  end if;
  if v_avance is null or v_avance < 0 or v_avance > 100 or not public.of_max_dos_decimales(v_avance) then
    raise exception 'El avance debe estar entre 0 y 100.';
  end if;

  v_num := public.siguiente_numero_parte_diario(v.empresa_id);
  insert into public.partes_diarios (id, empresa_id, numero, orden_fabricacion_id, of_operacion_id, tecnico_id, tecnico_nombre,
                                     fecha, horas_normales, horas_extra, avance_tarea_reportado, avance_pct, actividad,
                                     estado, origen_registro)
  values (v_id, v.empresa_id, v_num, v.id, v_op.id, v_tec.id, v_tec.nombre, v_fecha, v_horas, 0, v_avance, v_avance,
          nullif(btrim(p_datos->>'detalle'), ''), 'en_revision', 'of');
  return jsonb_build_object('id', v_id, 'numero', v_num, 'estado', 'en_revision');
end;
$$;

-- Aprueba u observa un parte en revisión. Al aprobar fija su costo y recalcula la OF;
-- la OF pasa de Aprobada a En producción con su primer parte aprobado.
create or replace function public.of_revisar_parte(p_parte_id text, p_accion text, p_avance numeric default null, p_observacion text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_p   public.partes_diarios%rowtype;
  v     public.ordenes_fabricacion%rowtype;
  v_op  public.of_operaciones%rowtype;
  v_av  numeric;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_costo numeric;
  r jsonb;
begin
  select * into v_p from public.partes_diarios where id = p_parte_id and orden_fabricacion_id is not null for update;
  if not found then raise exception 'El parte no existe.'; end if;
  v := public.of_exigir_edicion(v_p.orden_fabricacion_id, array['aprobada', 'en_produccion'], 'aprobar');
  if v_p.estado <> 'en_revision' then raise exception 'El parte ya fue revisado (%).', v_p.estado; end if;
  select * into v_op from public.of_operaciones where id = v_p.of_operacion_id;

  if p_accion = 'observar' then
    if v_obs is null then raise exception 'Indica qué hay que corregir.'; end if;
    update public.partes_diarios
       set estado = 'observado', aprobado_por = auth.uid(), aprobado_at = now(),
           actividad = coalesce(actividad, '') || E'\n[Observado] ' || v_obs
     where id = v_p.id;
    return jsonb_build_object('id', v_p.id, 'estado', 'observado');
  elsif p_accion <> 'aprobar' then
    raise exception 'Acción no válida.';
  end if;

  v_av := coalesce(p_avance, v_p.avance_tarea_reportado);
  if v_av is null or v_av < 0 or v_av > 100 or not public.of_max_dos_decimales(v_av) then
    raise exception 'El avance validado debe estar entre 0 y 100.';
  end if;
  if v_av <> coalesce(v_p.avance_tarea_reportado, -1) and v_obs is null then
    raise exception 'Indica por qué cambias el avance reportado.';
  end if;
  v_costo := round((coalesce(v_p.horas_normales, 0) + coalesce(v_p.horas_extra, 0))
                   * public.of_costo_hora_tecnico(v.empresa_id, v_p.tecnico_id, v_op.cargo_id, v.moneda), 2);

  update public.partes_diarios
     set estado = 'aprobado', avance_tarea_validado = v_av, avance_pct = v_av,
         aprobado_por = auth.uid(), aprobado_at = now(), costo_mano_obra = v_costo,
         actividad = case when v_obs is null then actividad else coalesce(actividad, '') || E'\n[Revisión] ' || v_obs end
   where id = v_p.id;
  if v.estado = 'aprobada' then
    update public.ordenes_fabricacion set estado = 'en_produccion' where id = v.id;
  end if;
  r := public.of_recalcular_avance(v.id);
  return r || jsonb_build_object('id', v_p.id, 'parte_estado', 'aprobado', 'costo_parte', v_costo);
end;
$$;

revoke all on function public.of_costo_hora_tecnico(text, text, text, text) from public, anon, authenticated;
revoke all on function public.of_recalcular_avance(uuid) from public, anon, authenticated;
revoke all on function public.of_catalogo_avance(uuid) from public, anon;
revoke all on function public.of_partes(uuid) from public, anon;
revoke all on function public.of_registrar_parte(uuid, jsonb) from public, anon;
revoke all on function public.of_revisar_parte(text, text, numeric, text) from public, anon;
grant execute on function public.of_catalogo_avance(uuid) to authenticated;
grant execute on function public.of_partes(uuid) to authenticated;
grant execute on function public.of_registrar_parte(uuid, jsonb) to authenticated;
grant execute on function public.of_revisar_parte(text, text, numeric, text) to authenticated;

do $$
declare n int;
begin
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('of_costo_hora_tecnico','of_recalcular_avance','of_catalogo_avance','of_partes','of_registrar_parte','of_revisar_parte');
  if n <> 6 then raise exception 'F3b: se esperaban 6 funciones, hay %', n; end if;
  if (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'partes_diarios' and column_name = 'orden_trabajo_id') <> 'YES' then
    raise exception 'F3b: orden_trabajo_id sigue siendo NOT NULL';
  end if;
  if exists (select 1 from public.partes_diarios where (orden_trabajo_id is not null) = (orden_fabricacion_id is not null)) then
    raise exception 'F3b: hay partes sin OT ni OF o con ambas';
  end if;
  if position('PARTE_OF_INEXISTENTE' in pg_get_functiondef('public.derivar_sociedad_parte_diario'::regproc)) = 0 then
    raise exception 'F3b: el disparador de sociedad no se actualizó';
  end if;
  if has_function_privilege('authenticated', 'public.of_recalcular_avance(uuid)', 'execute') then
    raise exception 'F3b: of_recalcular_avance debe ser interna';
  end if;
end $$;
