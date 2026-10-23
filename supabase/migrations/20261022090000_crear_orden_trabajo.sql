-- Creación estándar de Órdenes de Trabajo (decisión del usuario 2026-10-21).
-- Una sola función de servidor para crear OTs, usada por el asistente "Nueva OT" de la app operativa.
-- Reemplaza el insert directo con número aleatorio generado en el navegador.
--
-- Reglas:
--   * Clasificación DBS obligatoria: tipo_trabajo (Preventivo_PM, Correctivo, Acondicionamiento, Overhaul)
--     y cargo_financiero (Cliente_Contrato, Interno_Plataforma, Garantia_Fabrica, Reclamo_Rework).
--   * Raíz de costo obligatoria: os_cliente | contrato | equipo_interno.
--   * Técnico responsable, fecha programada y descripción obligatorios.
--   * CECO o CEBE obligatorio (se heredan de la OS o del contrato si no vienen).
--   * Motivo obligatorio para Reclamo_Rework. Horómetro obligatorio con contrato o equipo.
--   * Numeración en servidor: número de caso heredado de la OS (OT-{caso}-{n}) o serie de la empresa
--     (siguiente_numero_orden_trabajo).
--   * Moneda: OS -> contrato -> moneda base de la empresa -> PEN.
--   * Si la raíz es una OS: registra la OT en os_clientes.ots_asociadas y descuenta saldo_por_ejecutar,
--     igual que crear_ot_desde_os_cliente.
--   * La sociedad la deriva el trigger existente desde CECO/CEBE/OS; luego se valida el alcance del usuario.
--   * Tareas y repuestos estimados se insertan en la misma transacción.

create or replace function public.crear_orden_trabajo(
  p_empresa_id text,
  p_datos jsonb,
  p_tareas jsonb default '[]'::jsonb,
  p_repuestos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_raiz text := nullif(btrim(p_datos->>'objeto_costo_tipo'), '');
  v_tipo_trabajo text := nullif(btrim(p_datos->>'tipo_trabajo'), '');
  v_cargo text := nullif(btrim(p_datos->>'cargo_financiero'), '');
  v_tecnico text := nullif(btrim(p_datos->>'tecnico_responsable_id'), '');
  v_descripcion text := nullif(btrim(p_datos->>'descripcion'), '');
  v_fecha date := nullif(btrim(p_datos->>'fecha_programada'), '')::date;
  v_motivo text := nullif(btrim(p_datos->>'motivo_rework'), '');
  v_os_id text := nullif(btrim(p_datos->>'os_cliente_id'), '');
  v_contrato_id text := nullif(btrim(p_datos->>'contrato_alquiler_id'), '');
  v_equipo_id text := nullif(btrim(p_datos->>'equipo_id'), '');
  v_ceco text := nullif(btrim(p_datos->>'centro_costo_id'), '');
  v_cebe text := nullif(btrim(p_datos->>'centro_beneficio_id'), '');
  v_cuenta text := nullif(btrim(p_datos->>'cuenta_id'), '');
  v_horometro numeric := nullif(btrim(p_datos->>'horometro_actual'), '')::numeric;
  v_costo numeric := coalesce(nullif(btrim(p_datos->>'costo_estimado'), '')::numeric, 0);
  v_id text := coalesce(nullif(btrim(p_datos->>'id'), ''), 'ot_' || gen_random_uuid()::text);
  v_os public.os_clientes%rowtype;
  v_contrato public.contratos_alquiler%rowtype;
  v_moneda text;
  v_numero text;
  v_numero_caso integer;
  v_secuencia integer;
  v_ot public.ordenes_trabajo%rowtype;
  v_alcance uuid[];
  v_tareas integer := 0;
  v_repuestos integer := 0;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a esta empresa.' using errcode = '42501';
  end if;
  if not (public.usuario_puede(p_empresa_id, 'ot', 'crear') or public.usuario_puede(p_empresa_id, 'ots', 'crear')) then
    raise exception 'No tienes permiso para crear Órdenes de Trabajo.' using errcode = '42501';
  end if;

  if v_raiz is null or v_raiz not in ('os_cliente', 'contrato', 'equipo_interno') then
    raise exception 'Selecciona el objeto de costo raíz: OS Cliente, contrato de alquiler o equipo interno.' using errcode = '22023';
  end if;
  if v_tipo_trabajo is null or v_tipo_trabajo not in ('Preventivo_PM', 'Correctivo', 'Acondicionamiento', 'Overhaul') then
    raise exception 'El tipo de trabajo debe ser Preventivo, Correctivo, Acondicionamiento u Overhaul.' using errcode = '22023';
  end if;
  if v_cargo is null or v_cargo not in ('Cliente_Contrato', 'Interno_Plataforma', 'Garantia_Fabrica', 'Reclamo_Rework') then
    raise exception 'El cargo financiero no es válido.' using errcode = '22023';
  end if;
  if (v_tipo_trabajo = 'Preventivo_PM' and v_cargo in ('Garantia_Fabrica', 'Reclamo_Rework'))
     or (v_tipo_trabajo = 'Overhaul' and v_cargo = 'Reclamo_Rework') then
    raise exception 'Combinación DBS no permitida entre tipo de trabajo y cargo financiero.' using errcode = '22023';
  end if;
  if v_cargo = 'Reclamo_Rework' and v_motivo is null then
    raise exception 'El motivo del retrabajo es obligatorio.' using errcode = '22023';
  end if;
  if v_tecnico is null then
    raise exception 'Asigna un técnico responsable.' using errcode = '22023';
  end if;
  if v_fecha is null then
    raise exception 'Indica la fecha programada de inicio.' using errcode = '22023';
  end if;
  if v_descripcion is null then
    raise exception 'La descripción técnica es obligatoria.' using errcode = '22023';
  end if;
  if v_horometro is not null and v_horometro < 0 then
    raise exception 'El horómetro no puede ser negativo.' using errcode = '22023';
  end if;

  if v_raiz = 'os_cliente' then
    if v_os_id is null then
      raise exception 'Selecciona la OS Cliente.' using errcode = '22023';
    end if;
    select * into v_os from public.os_clientes
     where id = v_os_id and empresa_id = p_empresa_id
     for update;
    if not found then
      raise exception 'OS Cliente no encontrada.' using errcode = '22023';
    end if;
    v_contrato_id := null;
    v_cuenta := coalesce(v_os.cuenta_id, v_cuenta);
    v_cebe := coalesce(v_cebe, v_os.centro_beneficio_id);
    if v_cebe is null then
      raise exception 'La OS Cliente vinculada no tiene un CEBE asignado. Complétalo antes de crear la OT.' using errcode = '22023';
    end if;
    v_moneda := v_os.moneda;
    if v_equipo_id is not null and v_horometro is null then
      raise exception 'Registra el horómetro actual del equipo.' using errcode = '22023';
    end if;
  elsif v_raiz = 'contrato' then
    if v_contrato_id is null then
      raise exception 'Selecciona el contrato de alquiler.' using errcode = '22023';
    end if;
    select * into v_contrato from public.contratos_alquiler
     where id = v_contrato_id and empresa_id = p_empresa_id;
    if not found then
      raise exception 'Contrato de alquiler no encontrado.' using errcode = '22023';
    end if;
    v_os_id := null;
    v_cuenta := coalesce(v_contrato.cuenta_id, v_cuenta);
    v_ceco := coalesce(v_ceco, v_contrato.centro_costo_id);
    v_cebe := coalesce(v_cebe, v_contrato.centro_beneficio_id);
    v_moneda := v_contrato.moneda;
    if v_horometro is null then
      raise exception 'Registra el horómetro actual del equipo.' using errcode = '22023';
    end if;
  else
    v_os_id := null;
    v_contrato_id := null;
    if v_equipo_id is null then
      raise exception 'Selecciona el equipo interno.' using errcode = '22023';
    end if;
    if v_horometro is null then
      raise exception 'Registra el horómetro actual del equipo.' using errcode = '22023';
    end if;
  end if;

  if v_equipo_id is not null and not exists (
    select 1 from public.activos a where a.id = v_equipo_id and a.empresa_id = p_empresa_id
  ) then
    raise exception 'Equipo no encontrado.' using errcode = '22023';
  end if;

  if v_ceco is null and v_cebe is null then
    raise exception 'Asigna un centro de costo o un centro de beneficio.' using errcode = '22023';
  end if;

  if v_moneda is null then
    select e.moneda_base into v_moneda from public.empresas e where e.id = p_empresa_id;
  end if;
  v_moneda := coalesce(nullif(btrim(v_moneda), ''), 'PEN');

  if v_os_id is not null then
    v_numero_caso := public.abrir_o_heredar_numero_caso(p_empresa_id, v_os_id, 'os_clientes', v_cuenta);
    if v_numero_caso is not null then
      v_secuencia := public.secuencia_ot_en_caso(p_empresa_id, v_numero_caso);
      v_numero := 'OT-' || v_numero_caso::text || '-' || v_secuencia::text;
    end if;
  end if;
  if v_numero is null then
    v_numero := public.siguiente_numero_orden_trabajo(p_empresa_id);
  end if;

  insert into public.ordenes_trabajo (
    id, empresa_id, os_cliente_id, contrato_alquiler_id, equipo_id, cuenta_id, proyecto_id,
    numero, numero_caso, secuencia_caso, servicio, descripcion, direccion_ejecucion,
    fecha_programada, estado, avance_pct, costo_estimado, costo_estimado_ot, costo_real, moneda,
    centro_costo_id, centro_beneficio_id, tipo_trabajo, cargo_financiero, linea_negocio,
    tecnico_responsable_id, motivo_rework, horometro_actual
  ) values (
    v_id, p_empresa_id, v_os_id, v_contrato_id, v_equipo_id, v_cuenta, nullif(btrim(p_datos->>'proyecto_id'), ''),
    v_numero, v_numero_caso, v_secuencia,
    coalesce(nullif(btrim(p_datos->>'servicio'), ''), v_descripcion), v_descripcion,
    nullif(btrim(p_datos->>'direccion_ejecucion'), ''),
    v_fecha, 'programada', 0, v_costo, v_costo, 0, v_moneda,
    v_ceco, v_cebe, v_tipo_trabajo, v_cargo, nullif(btrim(p_datos->>'linea_negocio'), ''),
    v_tecnico, case when v_cargo = 'Reclamo_Rework' then v_motivo end, v_horometro
  )
  returning * into v_ot;

  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  if v_alcance is not null and (v_ot.sociedad_id is null or not (v_ot.sociedad_id = any (v_alcance))) then
    raise exception 'La sociedad de la OT queda fuera de tu alcance. Revisa el centro de costo o beneficio.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_tareas, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(p_tareas, '[]'::jsonb)) > 0 then
    insert into public.ot_tareas (
      empresa_id, ot_id, titulo, descripcion, tecnico_id, tecnico_nombre, tecnico_tipo,
      estado, horas_estimadas, horas_reales, avance_pct, completada, orden
    )
    select p_empresa_id, v_ot.id,
           coalesce(nullif(btrim(t->>'titulo'), ''), 'Tarea'),
           nullif(btrim(t->>'descripcion'), ''),
           nullif(btrim(t->>'tecnico_id'), ''),
           nullif(btrim(t->>'tecnico_nombre'), ''),
           nullif(btrim(t->>'tecnico_tipo'), ''),
           'pendiente',
           nullif(btrim(t->>'horas_estimadas'), '')::numeric,
           0, 0, false,
           (ord - 1)::integer
      from jsonb_array_elements(p_tareas) with ordinality as x(t, ord);
    get diagnostics v_tareas = row_count;
  end if;

  if jsonb_typeof(coalesce(p_repuestos, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(p_repuestos, '[]'::jsonb)) > 0 then
    insert into public.ot_segmento_repuestos (
      ot_id, segmento_id, material_id, cantidad_estimada, precio_unitario_estimado,
      empresa_id, sociedad_id
    )
    select v_ot.id,
           coalesce(nullif(btrim(r->>'segmento_id'), ''), 'SEG-1'),
           btrim(r->>'material_id'),
           (r->>'cantidad_estimada')::numeric,
           coalesce(nullif(btrim(r->>'precio_unitario_estimado'), '')::numeric, 0),
           p_empresa_id, v_ot.sociedad_id
      from jsonb_array_elements(p_repuestos) as y(r)
     where nullif(btrim(r->>'material_id'), '') is not null;
    get diagnostics v_repuestos = row_count;
  end if;

  if v_os_id is not null then
    update public.os_clientes
       set ots_asociadas = (
             select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
               from (
                 select value from jsonb_array_elements_text(coalesce(v_os.ots_asociadas, '[]'::jsonb)) value
                 union all
                 select v_ot.id
               ) items
           ),
           saldo_por_ejecutar = greatest(0, coalesce(saldo_por_ejecutar, 0) - coalesce(v_costo, 0)),
           updated_at = now()
     where id = v_os_id;
  end if;

  return jsonb_build_object(
    'id', v_ot.id,
    'numero', v_ot.numero,
    'moneda', v_ot.moneda,
    'sociedad_id', v_ot.sociedad_id,
    'tareas', v_tareas,
    'repuestos', v_repuestos
  );
end;
$function$;

revoke all on function public.crear_orden_trabajo(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.crear_orden_trabajo(text, jsonb, jsonb, jsonb) to authenticated;

-- Comprobación
do $$
declare
  v_def text;
  v_acl text;
begin
  select pg_get_functiondef(p.oid), p.proacl::text
    into v_def, v_acl
    from pg_proc p
   where p.oid = 'public.crear_orden_trabajo(text,jsonb,jsonb,jsonb)'::regprocedure;
  if v_def is null or position('security definer' in lower(v_def)) = 0 then
    raise exception 'crear_orden_trabajo no quedó creada como SECURITY DEFINER';
  end if;
  if position('authenticated=X' in v_acl) = 0 or position('anon=' in v_acl) > 0 then
    raise exception 'Permisos de crear_orden_trabajo incorrectos: %', v_acl;
  end if;
end $$;
