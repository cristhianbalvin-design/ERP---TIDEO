-- Cierre técnico atómico: evita que un cierre persista si fallan el cierre de
-- tareas, el historial o el cambio de estado de la OT. sociedad_id no es un
-- parámetro: aa_derivar_sociedad_cierre_tecnico (452) lo deriva desde la OT.

create or replace function public.cerrar_ot_con_conformidad(
  p_id text,
  p_empresa_id text,
  p_orden_trabajo_id text,
  p_fecha_cierre date,
  p_resultado text,
  p_observaciones text,
  p_conformidad_cliente jsonb,
  p_evidencias jsonb,
  p_estado text,
  p_descripcion_trabajo text,
  p_fecha_inicio_real date,
  p_horas_total numeric,
  p_avance_final integer,
  p_costo_terceros numeric,
  p_costo_logistica numeric,
  p_tareas_incompletas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $funcion$
declare
  v_ot public.ordenes_trabajo%rowtype;
  v_aprobados integer := 0;
  v_pendientes integer := 0;
  v_tareas_solicitadas text[] := '{}'::text[];
  v_tareas_reales text[] := '{}'::text[];
  v_snapshot_real jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '28000',
      message = 'CIERRE_USUARIO_REQUERIDO: se requiere un usuario autenticado para cerrar la OT.';
  end if;

  if p_id is null or btrim(p_id) = ''
     or p_empresa_id is null or btrim(p_empresa_id) = ''
     or p_orden_trabajo_id is null or btrim(p_orden_trabajo_id) = ''
     or p_fecha_cierre is null then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_DATOS_REQUERIDOS: id, empresa, OT y fecha de cierre son obligatorios.';
  end if;

  if p_resultado is distinct from 'conforme'
     or p_estado is distinct from 'cerrado'
     or coalesce(p_conformidad_cliente ->> 'tipo', '') is distinct from 'pendiente' then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_MODALIDAD_INVALIDA: esta RPC solo registra resultado conforme, estado cerrado y conformidad pendiente.';
  end if;

  if p_evidencias is not null and jsonb_typeof(p_evidencias) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_EVIDENCIAS_INVALIDAS: evidencias debe ser un arreglo JSON.';
  end if;

  if p_tareas_incompletas is null then
    p_tareas_incompletas := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_tareas_incompletas) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_TAREAS_INVALIDAS: tareas_incompletas debe ser un arreglo JSON.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_tareas_incompletas) tarea
    where jsonb_typeof(tarea) <> 'object'
       or nullif(btrim(tarea ->> 'id'), '') is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_TAREAS_INVALIDAS: cada tarea incompleta debe incluir id.';
  end if;

  if coalesce(p_horas_total, 0) < 0
     or coalesce(p_avance_final, 0) not between 0 and 100
     or coalesce(p_costo_terceros, 0) < 0
     or coalesce(p_costo_logistica, 0) < 0 then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_VALORES_INVALIDOS: horas, avance y costos deben estar dentro de rangos válidos.';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception using
      errcode = '42501',
      message = 'CIERRE_SIN_EMPRESA: no tienes acceso a la empresa indicada.';
  end if;
  if not public.usuario_puede(p_empresa_id, 'cierre', 'crear') then
    raise exception using
      errcode = '42501',
      message = 'CIERRE_SIN_PERMISO: no tienes permiso para crear cierres técnicos.';
  end if;

  -- El lock de la OT serializa el cierre contra altas de partes por la FK.
  select *
    into v_ot
  from public.ordenes_trabajo ot
  where ot.id = p_orden_trabajo_id
    and ot.empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'CIERRE_OT_INEXISTENTE: la OT no existe o no pertenece a la empresa indicada.';
  end if;

  if v_ot.estado not in ('ejecucion', 'pendiente_cierre') then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_ESTADO_OT_INVALIDO: la OT debe estar en ejecucion o pendiente_cierre.';
  end if;

  if not exists (
    select 1
    from (select public.usuario_alcance_sociedades(p_empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or v_ot.sociedad_id = any(alcance_usuario.alcance)
  ) then
    raise exception using
      errcode = '42501',
      message = 'CIERRE_SIN_ALCANCE_SOCIEDAD: no tienes alcance sobre la sociedad de esta OT.';
  end if;

  -- Se bloquean los partes existentes mientras se evalúa la misma regla del frontend.
  perform 1
  from public.partes_diarios parte
  where parte.empresa_id = p_empresa_id
    and parte.orden_trabajo_id = p_orden_trabajo_id
  for share;

  select
    count(*) filter (where parte.estado = 'aprobado'),
    count(*) filter (
      where parte.estado is null
         or parte.estado not in ('aprobado', 'rechazado')
    )
    into v_aprobados, v_pendientes
  from public.partes_diarios parte
  where parte.empresa_id = p_empresa_id
    and parte.orden_trabajo_id = p_orden_trabajo_id;

  if v_aprobados = 0 then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_SIN_PARTES_APROBADOS: la OT requiere al menos un parte aprobado.';
  end if;
  if v_pendientes > 0 then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_PARTES_PENDIENTES: la OT tiene partes pendientes de aprobación.';
  end if;

  select coalesce(array_agg(distinct tarea ->> 'id' order by tarea ->> 'id'), '{}'::text[])
    into v_tareas_solicitadas
  from jsonb_array_elements(p_tareas_incompletas) tarea;

  if cardinality(v_tareas_solicitadas) <> jsonb_array_length(p_tareas_incompletas) then
    raise exception using
      errcode = '22023',
      message = 'CIERRE_TAREAS_INVALIDAS: tareas_incompletas contiene ids duplicados.';
  end if;

  -- El snapshot persistido se deriva de las filas bloqueadas; el cliente solo
  -- declara cuáles vio como incompletas y la RPC rechaza cualquier estado obsoleto.
  select
    coalesce(array_agg(tarea.id order by tarea.id), '{}'::text[]),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', tarea.id,
          'titulo', tarea.titulo,
          'estado', tarea.estado,
          'avance_pct', tarea.avance_pct,
          'horas_reales', tarea.horas_reales
        )
        order by tarea.id
      ),
      '[]'::jsonb
    )
    into v_tareas_reales, v_snapshot_real
  from (
    select id, titulo, estado, avance_pct, horas_reales
    from public.ot_tareas
    where empresa_id = p_empresa_id
      and ot_id = p_orden_trabajo_id
      and not coalesce(completada, false)
      and coalesce(estado, '') not in ('completada', 'cerrada_sin_completar')
    order by id
    for update
  ) tarea;

  if v_tareas_solicitadas is distinct from v_tareas_reales then
    raise exception using
      errcode = '40001',
      message = 'CIERRE_TAREAS_DESACTUALIZADAS: recarga la OT antes de volver a cerrar.';
  end if;

  insert into public.cierres_tecnicos (
    id,
    empresa_id,
    orden_trabajo_id,
    fecha_cierre,
    resultado,
    observaciones,
    conformidad_cliente,
    evidencias,
    cerrado_por,
    estado,
    descripcion_trabajo,
    fecha_inicio_real,
    horas_total,
    avance_final,
    costo_terceros,
    costo_logistica
  ) values (
    p_id,
    p_empresa_id,
    p_orden_trabajo_id,
    p_fecha_cierre,
    p_resultado,
    p_observaciones,
    p_conformidad_cliente,
    coalesce(p_evidencias, '[]'::jsonb),
    auth.uid(),
    p_estado,
    p_descripcion_trabajo,
    p_fecha_inicio_real,
    coalesce(p_horas_total, 0),
    coalesce(p_avance_final, 0),
    coalesce(p_costo_terceros, 0),
    coalesce(p_costo_logistica, 0)
  );

  if cardinality(v_tareas_reales) > 0 then
    update public.ot_tareas
       set estado = 'cerrada_sin_completar',
           actualizado_en = now()
     where empresa_id = p_empresa_id
       and ot_id = p_orden_trabajo_id
       and id = any(v_tareas_reales);

    insert into public.ot_avance_historial (
      empresa_id,
      ot_id,
      avance_anterior,
      avance_nuevo,
      nota,
      registrado_por,
      registrado_en
    ) values (
      p_empresa_id,
      p_orden_trabajo_id,
      null,
      null,
      'CIERRE CON TAREAS INCOMPLETAS: ' || v_snapshot_real::text,
      auth.uid()::text,
      now()
    );
  end if;

  update public.ordenes_trabajo
     set estado = 'cerrada'
   where id = p_orden_trabajo_id
     and empresa_id = p_empresa_id;

  return jsonb_build_object(
    'cierre_id', p_id,
    'orden_trabajo_id', p_orden_trabajo_id,
    'estado_ot', 'cerrada',
    'tareas_cerradas_sin_completar', cardinality(v_tareas_reales)
  );
end;
$funcion$;

revoke all on function public.cerrar_ot_con_conformidad(
  text, text, text, date, text, text, jsonb, jsonb, text, text, date,
  numeric, integer, numeric, numeric, jsonb
) from public, anon;
grant execute on function public.cerrar_ot_con_conformidad(
  text, text, text, date, text, text, jsonb, jsonb, text, text, date,
  numeric, integer, numeric, numeric, jsonb
) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

-- DRY RUN MANUAL (no ejecutar desde esta migración):
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claim.sub', '<auth_user_uuid_con_permiso_cierre>', true);
-- SELECT public.cerrar_ot_con_conformidad(
--   '<cier_id_unico>', '<empresa_id>', '<ot_id>', current_date, 'conforme',
--   null, '{"tipo":"pendiente"}'::jsonb, '[]'::jsonb, 'cerrado', null,
--   null, 0, 100, 0, 0, '[]'::jsonb
-- );
-- SELECT id, orden_trabajo_id, sociedad_id, cerrado_por
-- FROM public.cierres_tecnicos WHERE id = '<cier_id_unico>';
-- SELECT estado FROM public.ordenes_trabajo WHERE id = '<ot_id>';
-- ROLLBACK;
--
-- APLICACIÓN MANUAL (tras aprobar el dry run):
-- BEGIN;
-- <ejecutar el contenido de esta migración>;
-- COMMIT;
