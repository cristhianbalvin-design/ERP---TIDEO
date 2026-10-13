-- WMS punto 4 (parte diario): pedido de repuestos desde el parte.
-- Al guardar el parte, cada pedido se agrega como linea de repuestos de la OT; el almacen valida,
-- reserva lo disponible y crea (o amplia) la SOLPE por lo que falte. Funciona con la OT en
-- programada o en ejecucion. Migracion aditiva; la funcion procesar_reserva_repuestos_ot se
-- parchea con anclas verificadas (parte de pg_get_functiondef de la version vigente).

-- 1) Trazabilidad del origen de cada linea de repuesto.
ALTER TABLE public.ot_segmento_repuestos
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'estimacion',
  ADD COLUMN IF NOT EXISTS parte_diario_id text;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ot_segmento_repuestos_origen_check') THEN
    ALTER TABLE public.ot_segmento_repuestos
      ADD CONSTRAINT ot_segmento_repuestos_origen_check CHECK (origen IN ('estimacion', 'parte_diario'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ot_segmento_repuestos_parte_diario_fkey') THEN
    ALTER TABLE public.ot_segmento_repuestos
      ADD CONSTRAINT ot_segmento_repuestos_parte_diario_fkey
      FOREIGN KEY (parte_diario_id) REFERENCES public.partes_diarios(id) ON DELETE SET NULL;
  END IF;
END
$c$;

CREATE INDEX IF NOT EXISTS idx_ot_segmento_repuestos_parte
  ON public.ot_segmento_repuestos (parte_diario_id) WHERE parte_diario_id IS NOT NULL;

-- 2) procesar_reserva_repuestos_ot: permitir OT en ejecucion solo cuando lo pide la RPC del parte
--    (bandera de transaccion wms.permitir_ejecucion) y no repetir el permiso de OT ya validado ahi.
DO $patch$
DECLARE
  v_def text;
  v_new text;
  a1 text := E'  if v_ot.estado is distinct from ''programada'' then\n    return;\n  end if;';
  b1 text := E'  if v_ot.estado is distinct from ''programada''\n     and not (v_ot.estado = ''ejecucion''\n              and coalesce(current_setting(''wms.permitir_ejecucion'', true), '''') = ''on'') then\n    return;\n  end if;';
  a2 text := E'  if auth.uid() is not null\n     and (';
  b2 text := E'  if auth.uid() is not null\n     and coalesce(current_setting(''wms.permitir_ejecucion'', true), '''') <> ''on''\n     and (';
BEGIN
  v_def := pg_get_functiondef('public.procesar_reserva_repuestos_ot(text)'::regprocedure);
  IF position('wms.permitir_ejecucion' IN v_def) > 0 THEN
    RAISE NOTICE 'procesar_reserva_repuestos_ot ya estaba parcheada';
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, a1, ''))) <> length(a1) THEN
    RAISE EXCEPTION 'Ancla 1 no unica o ausente en procesar_reserva_repuestos_ot';
  END IF;
  IF (length(v_def) - length(replace(v_def, a2, ''))) <> length(a2) THEN
    RAISE EXCEPTION 'Ancla 2 no unica o ausente en procesar_reserva_repuestos_ot';
  END IF;
  v_new := replace(replace(v_def, a1, b1), a2, b2);
  EXECUTE v_new;
END
$patch$;

-- 3) RPC del pedido desde el parte diario.
CREATE OR REPLACE FUNCTION public.wms_pedir_repuestos_parte(
  p_empresa_id text,
  p_ot_id text,
  p_parte_id text,
  p_lineas jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ot public.ordenes_trabajo%rowtype;
  v_item jsonb;
  v_material public.materiales%rowtype;
  v_cant numeric;
  v_segmento text;
  v_id text;
  v_ids text[] := '{}';
  v_nuevo boolean := true;
  v_res jsonb := '[]'::jsonb;
  v_linea public.ot_segmento_repuestos%rowtype;
  v_reservado numeric;
  v_faltante numeric;
  v_solpe public.solpe_interna%rowtype;
  v_ampliada boolean;
  v_aviso text;
  v_mat_codigo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere un usuario autenticado.';
  END IF;
  IF p_empresa_id IS NULL OR p_ot_id IS NULL THEN
    RAISE EXCEPTION 'Empresa y OT son obligatorias.';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Indica al menos un repuesto para pedir.';
  END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a la empresa indicada.';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id, 'partes', 'crear') THEN
    RAISE EXCEPTION 'No tienes permiso para pedir repuestos desde el parte diario.';
  END IF;

  SELECT * INTO v_ot FROM public.ordenes_trabajo
   WHERE id = p_ot_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La OT no existe o no pertenece a la empresa indicada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM (SELECT public.usuario_alcance_sociedades(p_empresa_id) AS alcance) a
     WHERE a.alcance IS NULL OR v_ot.sociedad_id = ANY (a.alcance)
  ) THEN
    RAISE EXCEPTION 'No tienes alcance sobre la sociedad de esta OT.';
  END IF;
  IF v_ot.estado NOT IN ('programada', 'ejecucion') THEN
    RAISE EXCEPTION 'Solo se pueden pedir repuestos para una OT programada o en ejecucion.';
  END IF;
  IF p_parte_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partes_diarios
     WHERE id = p_parte_id AND empresa_id = p_empresa_id AND orden_trabajo_id = p_ot_id
  ) THEN
    RAISE EXCEPTION 'El parte indicado no corresponde a esta OT.';
  END IF;

  -- Idempotencia: si el parte ya tiene pedidos procesados, se devuelve su estado sin duplicar.
  IF p_parte_id IS NOT NULL THEN
    SELECT coalesce(array_agg(id ORDER BY created_at, id), '{}'::text[]) INTO v_ids
      FROM public.ot_segmento_repuestos
     WHERE ot_id = p_ot_id AND parte_diario_id = p_parte_id AND origen = 'parte_diario';
    IF cardinality(v_ids) > 0 THEN
      v_nuevo := false;
    END IF;
  END IF;

  IF v_nuevo THEN
    SELECT segmento_id INTO v_segmento FROM public.ot_segmento_repuestos
     WHERE ot_id = p_ot_id ORDER BY created_at, id LIMIT 1;
    v_segmento := coalesce(v_segmento, '01');

    PERFORM set_config('wms.permitir_ejecucion', 'on', true);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
      IF jsonb_typeof(v_item) <> 'object' THEN
        RAISE EXCEPTION 'Cada repuesto del pedido debe indicar material y cantidad.';
      END IF;
      BEGIN
        v_cant := (v_item ->> 'cantidad')::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'La cantidad de un repuesto no es valida.';
      END;
      IF v_cant IS NULL OR v_cant <= 0 THEN
        RAISE EXCEPTION 'La cantidad de cada repuesto debe ser mayor a cero.';
      END IF;
      IF round(v_cant, 2) <> v_cant THEN
        RAISE EXCEPTION 'La cantidad admite hasta 2 decimales.';
      END IF;
      SELECT * INTO v_material FROM public.materiales
       WHERE id = (v_item ->> 'material_id') AND empresa_id = p_empresa_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Un material del pedido no existe en la empresa.';
      END IF;
      IF lower(coalesce(v_material.estado, 'activo')) = 'inactivo' THEN
        RAISE EXCEPTION 'El material % esta inactivo.', v_material.codigo;
      END IF;

      INSERT INTO public.ot_segmento_repuestos (
        empresa_id, sociedad_id, ot_id, segmento_id, material_id,
        cantidad_estimada, precio_unitario_estimado, origen, parte_diario_id
      ) VALUES (
        p_empresa_id, v_ot.sociedad_id, p_ot_id, v_segmento, v_material.id,
        v_cant, 0, 'parte_diario', p_parte_id
      ) RETURNING id INTO v_id;
      v_ids := v_ids || v_id;
    END LOOP;

    -- Con la OT programada el trigger ya reservo; con la OT en ejecucion se procesa aqui.
    -- Es idempotente: solo toma lineas en estado 'estimado'.
    PERFORM public.procesar_reserva_repuestos_ot(p_ot_id);
  END IF;

  FOR v_linea IN
    SELECT * FROM public.ot_segmento_repuestos WHERE id = ANY (v_ids) ORDER BY created_at, id
  LOOP
    SELECT coalesce(sum(cantidad_reservada), 0) INTO v_reservado
      FROM public.ot_segmento_repuestos_reservas WHERE ot_segmento_repuesto_id = v_linea.id;
    v_faltante := greatest(v_linea.cantidad_estimada - v_reservado, 0);
    v_ampliada := false;
    v_aviso := NULL;
    v_solpe := NULL;

    IF v_faltante > 0 AND v_linea.solpe_id IS NOT NULL THEN
      SELECT * INTO v_solpe FROM public.solpe_interna WHERE id = v_linea.solpe_id FOR UPDATE;
      -- Si la SOLPE ya existia para esta OT y material (de otra linea), se amplia mientras
      -- siga solicitada o en borrador; si ya fue aprobada o tiene OC, se avisa.
      IF v_nuevo AND v_solpe.origen_id IS DISTINCT FROM v_linea.id THEN
        IF v_solpe.estado IN ('borrador', 'solicitada') THEN
          UPDATE public.solpe_interna
             SET cantidad_solicitada = coalesce(cantidad_solicitada, 0) + v_faltante,
                 items = coalesce(items, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                   'material_id', v_linea.material_id,
                   'cantidad', v_faltante,
                   'ot_segmento_repuesto_id', v_linea.id,
                   'cantidad_estimada', v_linea.cantidad_estimada,
                   'cantidad_reservada', v_reservado,
                   'origen', 'parte_diario'))
           WHERE id = v_solpe.id;
          v_ampliada := true;
        ELSE
          v_aviso := 'Ya existe la SOLPE ' || v_solpe.codigo || ' (' || v_solpe.estado
            || ') para este material en la OT; la cantidad faltante no se amplio. Avisa a Compras.';
        END IF;
      END IF;
    END IF;

    SELECT codigo INTO v_mat_codigo FROM public.materiales WHERE id = v_linea.material_id;
    v_res := v_res || jsonb_build_array(jsonb_build_object(
      'linea_id', v_linea.id,
      'material_id', v_linea.material_id,
      'codigo', v_mat_codigo,
      'cantidad_pedida', v_linea.cantidad_estimada,
      'reservado', v_reservado,
      'faltante', v_faltante,
      'estado_linea', v_linea.estado,
      'solpe_id', v_linea.solpe_id,
      'solpe_codigo', v_solpe.codigo,
      'solpe_estado', v_solpe.estado,
      'solpe_ampliada', v_ampliada,
      'aviso', v_aviso
    ));
  END LOOP;

  PERFORM set_config('wms.permitir_ejecucion', '', true);
  RETURN jsonb_build_object('ot_id', p_ot_id, 'parte_id', p_parte_id, 'repetido', NOT v_nuevo, 'lineas', v_res);
END;
$fn$;

REVOKE ALL ON FUNCTION public.wms_pedir_repuestos_parte(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_pedir_repuestos_parte(text, text, text, jsonb) TO authenticated, service_role;

-- 4) Comprobacion final: si algo no quedo, se revierte toda la migracion.
DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'ot_segmento_repuestos' AND column_name = 'parte_diario_id') THEN
    RAISE EXCEPTION 'CHECK: falta ot_segmento_repuestos.parte_diario_id';
  END IF;
  IF position('wms.permitir_ejecucion' IN pg_get_functiondef('public.procesar_reserva_repuestos_ot(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CHECK: procesar_reserva_repuestos_ot no quedo parcheada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'wms_pedir_repuestos_parte') THEN
    RAISE EXCEPTION 'CHECK: falta wms_pedir_repuestos_parte';
  END IF;
END
$check$;
