-- F3a · Ficha de la OF editable: tareas, materiales y aprobación.
-- Aditiva: solo funciones nuevas con prefijo of_. No cambia tablas ni RLS.
-- La tarifa del cargo y la del equipo se calculan igual que la Hoja de Costeo:
-- cargo = costo manual del cargo (> 0) o tarifa de planilla, en soles;
-- equipo = costo_hora_activo_usd; ambos convertidos a la moneda de la OF.

-- ===== Utilidades internas =====
create or replace function public.of_convertir_moneda(p_monto numeric, p_de text, p_a text)
returns numeric
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_de numeric;
  v_a  numeric;
begin
  if p_monto is null then return null; end if;
  if coalesce(p_de, 'PEN') = coalesce(p_a, 'PEN') then return p_monto; end if;
  -- obtener_tipo_cambio_vigente(fecha, moneda) = US$ por 1 unidad de la moneda.
  v_de := case when p_de = 'USD' then 1 else public.obtener_tipo_cambio_vigente(current_date, p_de) end;
  v_a  := case when p_a  = 'USD' then 1 else public.obtener_tipo_cambio_vigente(current_date, p_a) end;
  if coalesce(v_de, 0) <= 0 or coalesce(v_a, 0) <= 0 then
    raise exception 'No hay tipo de cambio vigente para convertir de % a %.', p_de, p_a;
  end if;
  return p_monto * v_de / v_a;
end;
$$;

-- Valida acceso de edición a la OF y la bloquea para la transacción.
create or replace function public.of_exigir_edicion(p_of_id uuid, p_estados text[], p_accion text default 'editar')
returns public.ordenes_fabricacion
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v   public.ordenes_fabricacion%rowtype;
  v_alc uuid[];
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id for update;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, 'of', p_accion) then
    raise exception 'No tienes permiso para modificar esta OF.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(v.empresa_id);
  if v_alc is not null and v.sociedad_id is not null and not (v.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la OF está fuera de tu alcance.' using errcode = '42501';
  end if;
  if p_estados is not null and not (v.estado = any (p_estados)) then
    raise exception 'La OF está en estado % y no admite este cambio.', v.estado;
  end if;
  return v;
end;
$$;

create or replace function public.of_costo_hora_cargo(p_empresa_id text, p_cargo_id text, p_moneda text)
returns numeric
language sql stable security definer
set search_path to 'public'
as $$
  select public.of_convertir_moneda(
           coalesce(
             (select c.costo_hora_manual from public.costo_hora_cargo_config c
               where c.empresa_id = p_empresa_id and c.cargo_id = p_cargo_id and c.costo_hora_manual > 0 limit 1),
             (select v.costo_hora_planilla from public.vw_costo_hora_planilla_por_cargo v
               where v.empresa_id = p_empresa_id and v.cargo_id = p_cargo_id and v.costo_hora_planilla > 0 limit 1)),
           'PEN', p_moneda);
$$;

create or replace function public.of_costo_hora_activo(p_empresa_id text, p_activo_id text, p_moneda text)
returns numeric
language sql stable security definer
set search_path to 'public'
as $$
  select public.of_convertir_moneda(
           (select v.costo_hora_activo_usd from public.vw_depreciacion_mensual_activo v
             where v.empresa_id = p_empresa_id and v.activo_id = p_activo_id and v.costo_hora_activo_usd > 0 limit 1),
           'USD', p_moneda);
$$;

create or replace function public.of_recalcular_costo_estimado(p_of_id uuid)
returns numeric
language sql security definer
set search_path to 'public'
as $$
  update public.ordenes_fabricacion o
     set costo_estimado = round(
           coalesce((select sum(op.costo_estimado) from public.of_operaciones op where op.of_id = o.id), 0)
         + coalesce((select sum(m.cantidad_plan * m.costo_unitario) from public.of_materiales m where m.of_id = o.id), 0), 2)
   where o.id = p_of_id
  returning costo_estimado;
$$;

-- Número de decimales permitido (máximo 2) para horas y cantidades.
create or replace function public.of_max_dos_decimales(p_valor numeric)
returns boolean
language sql immutable
as $$ select p_valor is not null and round(p_valor, 2) = p_valor; $$;

-- ===== Catálogo para los modales (solo lectura) =====
create or replace function public.of_catalogo_edicion(p_of_id uuid)
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
    'moneda', v.moneda,
    'puede_editar', public.usuario_puede(v.empresa_id, 'of', 'editar'),
    'puede_aprobar', public.usuario_puede(v.empresa_id, 'of', 'aprobar'),
    'trabajos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nombre', f.nombre) order by f.nombre)
                            from public.familia_trabajo f where f.empresa_id = v.empresa_id and f.activo), '[]'::jsonb),
    'actividades', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre, 'familia_trabajo_id', t.familia_trabajo_id) order by t.nombre)
                            from public.tipos_servicio_interno t where t.empresa_id = v.empresa_id and t.rol = 'actividad' and t.estado = 'activo'), '[]'::jsonb),
    'tareas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre) order by t.nombre)
                            from public.tipos_servicio_interno t where t.empresa_id = v.empresa_id and t.rol = 'tarea' and t.estado = 'activo'), '[]'::jsonb),
    'cargos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre,
                                 'costo_hora', round(public.of_costo_hora_cargo(v.empresa_id, c.id, v.moneda), 4)) order by c.nombre)
                            from public.cargos_empresa c where c.empresa_id = v.empresa_id and c.estado = 'activo'), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'codigo', a.codigo, 'nombre', a.nombre,
                                 'costo_hora', round(public.of_costo_hora_activo(v.empresa_id, a.id, v.moneda), 4),
                                 'bahia', (select b.nombre from public.planner_maquinas_taller m join public.planner_bahias b on b.id = m.bahia_id
                                            where m.empresa_id = v.empresa_id and m.activo_id = a.id and m.estado <> 'baja' limit 1)) order by a.nombre)
                            from public.activos a
                           where a.empresa_id = v.empresa_id and coalesce(a.estado, '') <> 'baja'
                             and (a.propietario_tipo is null or a.propietario_tipo = 'propio')), '[]'::jsonb)
  );
end;
$$;

-- Busca materiales del catálogo con su stock disponible y el costo en la moneda de la OF.
create or replace function public.of_buscar_materiales(p_of_id uuid, p_texto text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_q text := '%' || lower(btrim(coalesce(p_texto, ''))) || '%';
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver esta OF.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'descripcion')
      from (
        select jsonb_build_object(
                 'id', m.id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad,
                 'costo_unitario', case when coalesce(m.costo_promedio, 0) > 0
                                        then round(public.of_convertir_moneda(m.costo_promedio, coalesce(m.moneda, 'PEN'), v.moneda), 4) end,
                 'disponible', coalesce((select sum(s.disponible) from public.stock s
                                          where s.material_id = m.id and s.empresa_id = v.empresa_id
                                            and (v.sociedad_id is null or s.sociedad_id is null or s.sociedad_id = v.sociedad_id)), 0)) x
          from public.materiales m
         where m.empresa_id = v.empresa_id and lower(coalesce(m.estado, '')) = 'activo'
           and (lower(m.descripcion) like v_q or lower(coalesce(m.codigo, '')) like v_q)
         order by m.descripcion
         limit 20) q), '[]'::jsonb);
end;
$$;

-- ===== Tareas (operaciones) =====
create or replace function public.of_guardar_operacion(p_of_id uuid, p_operacion_id uuid, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v       public.ordenes_fabricacion%rowtype;
  v_op    public.of_operaciones%rowtype;
  v_trab  uuid;
  v_act   text := nullif(btrim(p_datos->>'actividad_id'), '');
  v_tar   text := nullif(btrim(p_datos->>'tarea_id'), '');
  v_car   text := nullif(btrim(p_datos->>'cargo_id'), '');
  v_eq    text := nullif(btrim(p_datos->>'activo_id'), '');
  v_hh    numeric;
  v_hm    numeric;
  v_pos   integer;
  v_n     integer;
  v_titulo text;
  v_tc    numeric;
  v_te    numeric;
  v_costo numeric;
  v_bahia uuid;
begin
  v := public.of_exigir_edicion(p_of_id, array['borrador', 'en_ingenieria']);

  begin
    v_trab := nullif(btrim(p_datos->>'familia_trabajo_id'), '')::uuid;
    v_hh   := nullif(btrim(p_datos->>'horas_estimadas'), '')::numeric;
    v_hm   := coalesce(nullif(btrim(p_datos->>'horas_maquina'), '')::numeric, 0);
    v_pos  := nullif(btrim(p_datos->>'posicion'), '')::integer;
  exception when others then
    raise exception 'Hay datos con formato no válido en la tarea.';
  end;

  if v_trab is null or not exists (select 1 from public.familia_trabajo f where f.id = v_trab and f.empresa_id = v.empresa_id) then
    raise exception 'Elige un trabajo válido.';
  end if;
  if v_act is null or not exists (select 1 from public.tipos_servicio_interno t where t.id = v_act and t.empresa_id = v.empresa_id and t.rol = 'actividad') then
    raise exception 'Elige una actividad válida.';
  end if;
  select t.nombre into v_titulo from public.tipos_servicio_interno t where t.id = v_tar and t.empresa_id = v.empresa_id and t.rol = 'tarea';
  if v_tar is null or v_titulo is null then raise exception 'Elige una tarea válida.'; end if;
  if v_car is null or not exists (select 1 from public.cargos_empresa c where c.id = v_car and c.empresa_id = v.empresa_id) then
    raise exception 'Elige un cargo válido.';
  end if;
  if v_eq is not null and not exists (select 1 from public.activos a where a.id = v_eq and a.empresa_id = v.empresa_id) then
    raise exception 'El equipo no pertenece a la empresa.';
  end if;
  if v_hh is null or v_hh <= 0 or not public.of_max_dos_decimales(v_hh) then
    raise exception 'Las horas-hombre deben ser mayores a 0, con máximo 2 decimales.';
  end if;
  if v_hm < 0 or not public.of_max_dos_decimales(v_hm) then
    raise exception 'Las horas-máquina no pueden ser negativas y admiten máximo 2 decimales.';
  end if;

  v_tc := public.of_costo_hora_cargo(v.empresa_id, v_car, v.moneda);
  v_te := case when v_eq is not null then public.of_costo_hora_activo(v.empresa_id, v_eq, v.moneda) end;
  v_costo := round(v_hh * coalesce(v_tc, 0) + v_hm * coalesce(v_te, 0), 2);
  v_bahia := case when v_eq is not null then
               (select m.bahia_id from public.planner_maquinas_taller m
                 where m.empresa_id = v.empresa_id and m.activo_id = v_eq and m.estado <> 'baja' limit 1) end;

  select count(*) into v_n from public.of_operaciones where of_id = v.id;

  if p_operacion_id is null then
    v_pos := least(greatest(coalesce(v_pos, v_n + 1), 1), v_n + 1);
    update public.of_operaciones set secuencia = secuencia + 1 where of_id = v.id and secuencia >= v_pos;
    insert into public.of_operaciones (of_id, empresa_id, secuencia, familia_trabajo_id, actividad_id, tarea_id, titulo,
                                       cargo_id, activo_id, bahia_id, horas_estimadas, horas_maquina, costo_estimado)
    values (v.id, v.empresa_id, v_pos, v_trab, v_act, v_tar, v_titulo, v_car, v_eq, v_bahia, v_hh, v_hm, v_costo)
    returning * into v_op;
  else
    select * into v_op from public.of_operaciones where id = p_operacion_id and of_id = v.id for update;
    if not found then raise exception 'La tarea no pertenece a esta OF.'; end if;
    v_pos := least(greatest(coalesce(v_pos, v_op.secuencia), 1), v_n);
    if v_pos < v_op.secuencia then
      update public.of_operaciones set secuencia = secuencia + 1
       where of_id = v.id and secuencia >= v_pos and secuencia < v_op.secuencia;
    elsif v_pos > v_op.secuencia then
      update public.of_operaciones set secuencia = secuencia - 1
       where of_id = v.id and secuencia > v_op.secuencia and secuencia <= v_pos;
    end if;
    update public.of_operaciones
       set secuencia = v_pos, familia_trabajo_id = v_trab, actividad_id = v_act, tarea_id = v_tar, titulo = v_titulo,
           cargo_id = v_car, activo_id = v_eq, bahia_id = v_bahia, horas_estimadas = v_hh, horas_maquina = v_hm,
           costo_estimado = v_costo
     where id = v_op.id
    returning * into v_op;
  end if;

  return jsonb_build_object('id', v_op.id, 'secuencia', v_op.secuencia, 'costo_estimado', v_op.costo_estimado,
                            'sin_tarifa', v_tc is null, 'of_costo_estimado', public.of_recalcular_costo_estimado(v.id));
end;
$$;

create or replace function public.of_quitar_operacion(p_operacion_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_of_id uuid;
  v public.ordenes_fabricacion%rowtype;
begin
  select of_id into v_of_id from public.of_operaciones where id = p_operacion_id;
  if v_of_id is null then raise exception 'La tarea no existe.'; end if;
  v := public.of_exigir_edicion(v_of_id, array['borrador', 'en_ingenieria']);
  if exists (select 1 from public.partes_diarios p where p.of_operacion_id = p_operacion_id) then
    raise exception 'La tarea tiene partes registrados y no se puede quitar.';
  end if;
  delete from public.of_operaciones where id = p_operacion_id;
  update public.of_operaciones o set secuencia = s.n
    from (select id, row_number() over (order by secuencia, created_at, id) n from public.of_operaciones where of_id = v.id) s
   where o.id = s.id and o.secuencia <> s.n;
  return jsonb_build_object('of_costo_estimado', public.of_recalcular_costo_estimado(v.id));
end;
$$;

-- ===== Materiales =====
create or replace function public.of_guardar_material(p_of_id uuid, p_material_linea_id uuid, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v       public.ordenes_fabricacion%rowtype;
  v_mat   public.materiales%rowtype;
  v_lin   public.of_materiales%rowtype;
  v_cant  numeric;
  v_origen text := coalesce(nullif(btrim(p_datos->>'origen'), ''), 'stock');
  v_op    uuid;
  v_motivo text := nullif(btrim(p_datos->>'motivo'), '');
  v_cu    numeric;
  v_no_plan boolean;
begin
  v := public.of_exigir_edicion(p_of_id, array['borrador', 'en_ingenieria', 'aprobada', 'en_produccion']);
  v_no_plan := v.estado in ('aprobada', 'en_produccion');
  if v_no_plan and p_material_linea_id is not null then
    raise exception 'La OF ya está aprobada: solo se pueden agregar materiales no planificados.';
  end if;

  begin
    v_cant := nullif(btrim(p_datos->>'cantidad'), '')::numeric;
    v_op   := nullif(btrim(p_datos->>'operacion_id'), '')::uuid;
  exception when others then
    raise exception 'Hay datos con formato no válido en el material.';
  end;

  select * into v_mat from public.materiales m
   where m.id = nullif(btrim(p_datos->>'material_id'), '') and m.empresa_id = v.empresa_id;
  if not found then raise exception 'Elige un material del catálogo.'; end if;
  if v_cant is null or v_cant <= 0 or not public.of_max_dos_decimales(v_cant) then
    raise exception 'La cantidad debe ser mayor a 0, con máximo 2 decimales.';
  end if;
  if v_origen not in ('stock', 'compra', 'cliente') then raise exception 'Elige un origen válido.'; end if;
  if v_op is not null and not exists (select 1 from public.of_operaciones o where o.id = v_op and o.of_id = v.id) then
    raise exception 'La operación no pertenece a esta OF.';
  end if;
  if v_no_plan and v_motivo is null then
    raise exception 'Indica el motivo del material no planificado.';
  end if;

  v_cu := case when v_origen = 'cliente' or coalesce(v_mat.costo_promedio, 0) <= 0 then 0
               else round(public.of_convertir_moneda(v_mat.costo_promedio, coalesce(v_mat.moneda, 'PEN'), v.moneda), 4) end;

  if p_material_linea_id is null then
    insert into public.of_materiales (of_id, empresa_id, operacion_id, material_id, descripcion, unidad, cantidad_plan,
                                      costo_unitario, origen, no_planificado, motivo_desviacion)
    values (v.id, v.empresa_id, v_op, v_mat.id, v_mat.descripcion, v_mat.unidad, v_cant, v_cu, v_origen, v_no_plan,
            case when v_no_plan then v_motivo end)
    returning * into v_lin;
  else
    update public.of_materiales
       set operacion_id = v_op, material_id = v_mat.id, descripcion = v_mat.descripcion, unidad = v_mat.unidad,
           cantidad_plan = v_cant, costo_unitario = v_cu, origen = v_origen
     where id = p_material_linea_id and of_id = v.id
    returning * into v_lin;
    if not found then raise exception 'El material no pertenece a esta OF.'; end if;
  end if;

  return jsonb_build_object('id', v_lin.id, 'costo_unitario', v_lin.costo_unitario,
                            'subtotal', round(v_lin.cantidad_plan * v_lin.costo_unitario, 2),
                            'sin_costo', v_origen <> 'cliente' and v_cu = 0,
                            'of_costo_estimado', public.of_recalcular_costo_estimado(v.id));
end;
$$;

create or replace function public.of_quitar_material(p_material_linea_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_of_id uuid;
  v public.ordenes_fabricacion%rowtype;
begin
  select of_id into v_of_id from public.of_materiales where id = p_material_linea_id;
  if v_of_id is null then raise exception 'El material no existe.'; end if;
  v := public.of_exigir_edicion(v_of_id, array['borrador', 'en_ingenieria']);
  delete from public.of_materiales where id = p_material_linea_id;
  return jsonb_build_object('of_costo_estimado', public.of_recalcular_costo_estimado(v.id));
end;
$$;

-- ===== Aprobación =====
-- F3a solo cambia el estado. La reserva de stock y la SOLPE por faltante se conectan en F3c.
create or replace function public.of_aprobar(p_of_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
begin
  v := public.of_exigir_edicion(p_of_id, array['borrador', 'en_ingenieria'], 'aprobar');
  if not exists (select 1 from public.of_operaciones where of_id = v.id) then
    raise exception 'Agrega al menos una tarea antes de aprobar la OF.';
  end if;
  if exists (select 1 from public.of_operaciones where of_id = v.id and coalesce(horas_estimadas, 0) <= 0) then
    raise exception 'Todas las tareas deben tener horas-hombre mayores a 0.';
  end if;
  update public.ordenes_fabricacion set estado = 'aprobada' where id = v.id;
  return jsonb_build_object('id', v.id, 'estado', 'aprobada', 'costo_estimado', public.of_recalcular_costo_estimado(v.id));
end;
$$;

-- ===== Permisos de ejecución =====
revoke all on function public.of_convertir_moneda(numeric, text, text) from public, anon, authenticated;
revoke all on function public.of_exigir_edicion(uuid, text[], text) from public, anon, authenticated;
revoke all on function public.of_costo_hora_cargo(text, text, text) from public, anon, authenticated;
revoke all on function public.of_costo_hora_activo(text, text, text) from public, anon, authenticated;
revoke all on function public.of_recalcular_costo_estimado(uuid) from public, anon, authenticated;
revoke all on function public.of_max_dos_decimales(numeric) from public, anon, authenticated;
revoke all on function public.of_catalogo_edicion(uuid) from public, anon;
revoke all on function public.of_buscar_materiales(uuid, text) from public, anon;
revoke all on function public.of_guardar_operacion(uuid, uuid, jsonb) from public, anon;
revoke all on function public.of_quitar_operacion(uuid) from public, anon;
revoke all on function public.of_guardar_material(uuid, uuid, jsonb) from public, anon;
revoke all on function public.of_quitar_material(uuid) from public, anon;
revoke all on function public.of_aprobar(uuid) from public, anon;
grant execute on function public.of_catalogo_edicion(uuid) to authenticated;
grant execute on function public.of_buscar_materiales(uuid, text) to authenticated;
grant execute on function public.of_guardar_operacion(uuid, uuid, jsonb) to authenticated;
grant execute on function public.of_quitar_operacion(uuid) to authenticated;
grant execute on function public.of_guardar_material(uuid, uuid, jsonb) to authenticated;
grant execute on function public.of_quitar_material(uuid) to authenticated;
grant execute on function public.of_aprobar(uuid) to authenticated;

-- ===== Comprobación =====
do $$
declare n int;
begin
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('of_convertir_moneda','of_exigir_edicion','of_costo_hora_cargo','of_costo_hora_activo','of_recalcular_costo_estimado',
     'of_max_dos_decimales','of_catalogo_edicion','of_buscar_materiales','of_guardar_operacion','of_quitar_operacion',
     'of_guardar_material','of_quitar_material','of_aprobar');
  if n <> 13 then raise exception 'F3a: se esperaban 13 funciones, hay %', n; end if;
  if has_function_privilege('anon', 'public.of_guardar_operacion(uuid, uuid, jsonb)', 'execute') then
    raise exception 'F3a: anon no debe ejecutar of_guardar_operacion';
  end if;
  if has_function_privilege('authenticated', 'public.of_exigir_edicion(uuid, text[], text)', 'execute') then
    raise exception 'F3a: of_exigir_edicion debe ser interna';
  end if;
end $$;
