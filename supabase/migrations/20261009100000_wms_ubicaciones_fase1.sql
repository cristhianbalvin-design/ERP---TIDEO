-- WMS Fase 1 — ubicaciones (modelo A): tabla ubicaciones, ubicacion_id obligatorio en
-- stock y kardex (con ubicación "general" por almacén), clave única de stock por ubicación
-- y registrar_movimiento_atomico con p_ubicacion_id (28 parámetros).
-- APLICADA EN PRODUCCIÓN el 2026-10-09 desde el SQL Editor (no vía db push):
-- registrar con `supabase migration repair --status applied <versión>`; NO reejecutar.
-- Orden de despliegue: antes que cualquier frontend que dependa de ubicaciones.

-- Soporte de la FK compuesta (empresa_id, almacen_id) -> almacenes
CREATE UNIQUE INDEX IF NOT EXISTS almacenes_empresa_id_id_uq
ON public.almacenes (empresa_id, id);

CREATE TABLE public.ubicaciones (
  id          text PRIMARY KEY DEFAULT ('ubi_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id  text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  almacen_id  text NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  codigo      text NOT NULL,
  nombre      text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('general', 'zona', 'rack', 'posicion')),
  padre_id    text NULL,
  es_general  boolean NOT NULL DEFAULT false,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NULL,

  CONSTRAINT ubicaciones_empresa_almacen_fk
    FOREIGN KEY (empresa_id, almacen_id)
    REFERENCES public.almacenes (empresa_id, id) ON DELETE RESTRICT,

  CONSTRAINT ubicaciones_padre_mismo_almacen_fk
    FOREIGN KEY (padre_id, almacen_id)
    REFERENCES public.ubicaciones (id, almacen_id) ON DELETE RESTRICT,

  CONSTRAINT ubicaciones_id_almacen_uq UNIQUE (id, almacen_id),
  CONSTRAINT ubicaciones_almacen_codigo_uq UNIQUE (almacen_id, codigo),
  CONSTRAINT ubicaciones_general_tipo_ck CHECK (NOT es_general OR tipo = 'general')
);

CREATE UNIQUE INDEX ubicaciones_una_general_por_almacen_uq
ON public.ubicaciones (almacen_id) WHERE es_general;
CREATE INDEX ubicaciones_empresa_idx ON public.ubicaciones (empresa_id);
CREATE INDEX ubicaciones_almacen_idx ON public.ubicaciones (almacen_id);
CREATE INDEX ubicaciones_padre_almacen_idx ON public.ubicaciones (padre_id, almacen_id);

-- Jerarquía zona > rack > posición
CREATE OR REPLACE FUNCTION public.validar_ubicacion_jerarquia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tipo_padre text;
BEGIN
  IF NEW.tipo = 'general' THEN
    IF NEW.padre_id IS NOT NULL OR NOT NEW.es_general THEN
      RAISE EXCEPTION 'La ubicación general debe ser raíz y tener es_general=true.';
    END IF;
  ELSIF NEW.es_general THEN
    RAISE EXCEPTION 'Solo una ubicación tipo general puede tener es_general=true.';
  END IF;

  IF NEW.tipo = 'zona' AND NEW.padre_id IS NOT NULL THEN
    RAISE EXCEPTION 'Una zona debe ser raíz.';
  ELSIF NEW.tipo = 'rack' AND NEW.padre_id IS NULL THEN
    RAISE EXCEPTION 'Un rack debe pertenecer a una zona.';
  ELSIF NEW.tipo = 'posicion' AND NEW.padre_id IS NULL THEN
    RAISE EXCEPTION 'Una posición debe pertenecer a un rack.';
  END IF;

  IF NEW.padre_id IS NOT NULL THEN
    SELECT u.tipo INTO v_tipo_padre FROM public.ubicaciones u
    WHERE u.id = NEW.padre_id AND u.almacen_id = NEW.almacen_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La ubicación padre no existe en el mismo almacén.';
    END IF;
    IF (NEW.tipo = 'rack' AND v_tipo_padre <> 'zona')
       OR (NEW.tipo = 'posicion' AND v_tipo_padre <> 'rack') THEN
      RAISE EXCEPTION 'La jerarquía debe ser zona > rack > posición.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ubicaciones_validar_jerarquia_trg
BEFORE INSERT OR UPDATE OF tipo, padre_id, es_general, almacen_id
ON public.ubicaciones FOR EACH ROW EXECUTE FUNCTION public.validar_ubicacion_jerarquia();

-- Protección de la general y de ubicaciones con stock
CREATE OR REPLACE FUNCTION public.proteger_ubicacion_general_y_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.es_general THEN RAISE EXCEPTION 'No se puede eliminar la ubicación general.'; END IF;
    IF EXISTS (SELECT 1 FROM public.stock s WHERE s.ubicacion_id = OLD.id) THEN
      RAISE EXCEPTION 'No se puede eliminar una ubicación que tiene stock.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.es_general AND NOT NEW.activo THEN
    RAISE EXCEPTION 'No se puede desactivar la ubicación general.';
  END IF;
  IF OLD.es_general AND NOT NEW.es_general THEN
    RAISE EXCEPTION 'No se puede quitar es_general de la ubicación general.';
  END IF;
  IF NOT NEW.activo AND EXISTS (SELECT 1 FROM public.stock s WHERE s.ubicacion_id = OLD.id) THEN
    RAISE EXCEPTION 'No se puede desactivar una ubicación que tiene stock.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ubicaciones_proteger_general_stock_trg
BEFORE UPDATE OR DELETE ON public.ubicaciones
FOR EACH ROW EXECUTE FUNCTION public.proteger_ubicacion_general_y_stock();

-- RLS: patrón de almacenes (permiso 'inventario'), una política por comando
ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY ubicaciones_select ON public.ubicaciones FOR SELECT
USING (public.usuario_tiene_empresa(empresa_id)
   AND public.usuario_puede(empresa_id, 'inventario', 'ver'));

CREATE POLICY ubicaciones_insert ON public.ubicaciones FOR INSERT
WITH CHECK (public.usuario_tiene_empresa(empresa_id)
        AND public.usuario_puede(empresa_id, 'inventario', 'crear'));

CREATE POLICY ubicaciones_update ON public.ubicaciones FOR UPDATE
USING (public.usuario_tiene_empresa(empresa_id)
   AND public.usuario_puede(empresa_id, 'inventario', 'editar'))
WITH CHECK (public.usuario_tiene_empresa(empresa_id)
        AND public.usuario_puede(empresa_id, 'inventario', 'editar'));

CREATE POLICY ubicaciones_delete ON public.ubicaciones FOR DELETE
USING (public.usuario_tiene_empresa(empresa_id)
   AND public.usuario_puede(empresa_id, 'inventario', 'editar'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ubicaciones TO authenticated, service_role;

-- Ubicación general automática en cada almacén nuevo
CREATE OR REPLACE FUNCTION public.crear_ubicacion_general_almacen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ubicaciones (empresa_id, almacen_id, codigo, nombre, tipo, es_general, activo)
  VALUES (NEW.empresa_id, NEW.id, 'GEN', 'Ubicación general', 'general', true, true);
  RETURN NEW;
END $$;

CREATE TRIGGER almacenes_crear_ubicacion_general_trg
AFTER INSERT ON public.almacenes
FOR EACH ROW EXECUTE FUNCTION public.crear_ubicacion_general_almacen();

-- Backfill: general para cada almacén existente
INSERT INTO public.ubicaciones (empresa_id, almacen_id, codigo, nombre, tipo, es_general, activo)
SELECT a.empresa_id, a.id, 'GEN', 'Ubicación general', 'general', true, true
FROM public.almacenes a
WHERE NOT EXISTS (SELECT 1 FROM public.ubicaciones u WHERE u.almacen_id = a.id AND u.es_general);

-- Columnas nuevas y backfill
ALTER TABLE public.stock  ADD COLUMN ubicacion_id text;
ALTER TABLE public.kardex ADD COLUMN ubicacion_id text;

UPDATE public.stock s SET ubicacion_id = u.id
FROM public.ubicaciones u
WHERE u.almacen_id = s.almacen_id AND u.es_general AND s.ubicacion_id IS NULL;

UPDATE public.kardex k SET ubicacion_id = u.id
FROM public.ubicaciones u
WHERE u.almacen_id = k.almacen_id AND u.es_general AND k.ubicacion_id IS NULL;

-- [Corrección b] Respaldo: si un escritor antiguo inserta sin ubicación, se asigna la general
CREATE OR REPLACE FUNCTION public.asignar_ubicacion_general_default()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ubicacion_id IS NULL AND NEW.almacen_id IS NOT NULL THEN
    SELECT u.id INTO NEW.ubicacion_id FROM public.ubicaciones u
    WHERE u.almacen_id = NEW.almacen_id AND u.es_general;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER stock_ubicacion_default_trg
BEFORE INSERT ON public.stock FOR EACH ROW EXECUTE FUNCTION public.asignar_ubicacion_general_default();
CREATE TRIGGER kardex_ubicacion_default_trg
BEFORE INSERT ON public.kardex FOR EACH ROW EXECUTE FUNCTION public.asignar_ubicacion_general_default();

-- NOT NULL / FKs / CHECK
ALTER TABLE public.stock ALTER COLUMN ubicacion_id SET NOT NULL;

ALTER TABLE public.stock ADD CONSTRAINT stock_ubicacion_almacen_fk
  FOREIGN KEY (ubicacion_id, almacen_id)
  REFERENCES public.ubicaciones (id, almacen_id) ON DELETE RESTRICT;

ALTER TABLE public.kardex ADD CONSTRAINT kardex_ubicacion_almacen_fk
  FOREIGN KEY (ubicacion_id, almacen_id)
  REFERENCES public.ubicaciones (id, almacen_id) ON DELETE RESTRICT;

ALTER TABLE public.kardex ADD CONSTRAINT kardex_almacen_requiere_ubicacion_ck
  CHECK (almacen_id IS NULL OR ubicacion_id IS NOT NULL) NOT VALID;
ALTER TABLE public.kardex VALIDATE CONSTRAINT kardex_almacen_requiere_ubicacion_ck;

CREATE INDEX stock_ubicacion_almacen_idx  ON public.stock  (ubicacion_id, almacen_id);
CREATE INDEX kardex_ubicacion_almacen_idx ON public.kardex (ubicacion_id, almacen_id);

-- Llave única de stock ampliada (semántica de 387:36-47 + ubicacion_id)
DROP INDEX public.stock_material_id_almacen_id_lote_serie_key;
CREATE UNIQUE INDEX stock_material_id_almacen_id_lote_serie_key
ON public.stock (
  material_id, almacen_id, ubicacion_id,
  coalesce(lote, ''), coalesce(serie, ''),
  coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- RPC: base 427 + p_ubicacion_id (parámetro 28, al final)
DROP FUNCTION public.registrar_movimiento_atomico(
  text, text, text, text, uuid, text, text, numeric, numeric, numeric, text,
  text, text, date, text, text, text, text, text, uuid, text, text, integer,
  numeric, numeric, text, boolean
);

CREATE FUNCTION public.registrar_movimiento_atomico(
  p_kardex_id text,
  p_empresa_id text,
  p_material_id text,
  p_almacen_id text,
  p_sociedad_id uuid DEFAULT NULL,
  p_tipo text DEFAULT 'entrada',
  p_motivo text DEFAULT NULL,
  p_cantidad numeric DEFAULT 0,
  p_costo_unitario numeric DEFAULT 0,
  p_costo_unitario_usd numeric DEFAULT 0,
  p_moneda text DEFAULT 'PEN',
  p_lote text DEFAULT NULL,
  p_serie text DEFAULT NULL,
  p_vencimiento date DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id text DEFAULT NULL,
  p_nro_documento text DEFAULT NULL,
  p_proveedor_id text DEFAULT NULL,
  p_observacion text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_valorizacion_estado text DEFAULT NULL,
  p_orden_compra_id text DEFAULT NULL,
  p_orden_compra_item_idx integer DEFAULT NULL,
  p_precio_unitario_provisional numeric DEFAULT NULL,
  p_precio_unitario_real numeric DEFAULT NULL,
  p_recepcion_id text DEFAULT NULL,
  p_skip_costo_promedio boolean DEFAULT false,
  p_ubicacion_id text DEFAULT NULL
)
RETURNS TABLE (kardex_id text, saldo numeric, disponible numeric, costo_promedio numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stock public.stock%rowtype;
  v_stock_fisico numeric := 0;
  v_stock_disponible numeric := 0;
  v_stock_reservado numeric := 0;
  v_costo_actual numeric := 0;
  v_costo_unitario numeric := coalesce(p_costo_unitario, 0);
  v_costo_unitario_usd numeric := coalesce(p_costo_unitario_usd, 0);
  v_nuevo_costo_promedio numeric := coalesce(p_costo_unitario, 0);
  v_nuevo_fisico numeric := 0;
  v_nuevo_disponible numeric := 0;
  v_moneda text := upper(coalesce(nullif(btrim(p_moneda), ''), 'PEN'));
  v_tc_usd numeric;
  v_tipo_cambio_aplicado numeric;
  v_fecha_tipo_cambio date;
  v_fuente_tipo_cambio text;
  v_ubicacion_id text;
  v_es_salida boolean := p_tipo in ('salida', 'transferencia_salida');
  v_es_entrada boolean := p_tipo in ('entrada', 'transferencia_entrada');
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a la empresa indicada.';
  END IF;
  IF p_kardex_id IS NULL OR btrim(p_kardex_id) = ''
     OR p_material_id IS NULL OR btrim(p_material_id) = ''
     OR p_almacen_id IS NULL OR btrim(p_almacen_id) = ''
     OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Faltan datos obligatorios: empresa, material, almacén y cantidad > 0';
  END IF;

  -- Resolución y validación de la ubicación
  IF p_ubicacion_id IS NULL THEN
    SELECT u.id INTO v_ubicacion_id FROM public.ubicaciones u
    WHERE u.empresa_id = p_empresa_id AND u.almacen_id = p_almacen_id
      AND u.es_general AND u.activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El almacén no tiene una ubicación general activa.';
    END IF;
  ELSE
    SELECT u.id INTO v_ubicacion_id FROM public.ubicaciones u
    WHERE u.id = p_ubicacion_id AND u.empresa_id = p_empresa_id
      AND u.almacen_id = p_almacen_id AND u.activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La ubicación no pertenece al almacén/empresa o está inactiva.';
    END IF;
  END IF;

  IF NOT p_skip_costo_promedio AND v_es_entrada AND v_moneda <> 'PEN' THEN
    IF v_moneda <> 'USD' THEN
      RAISE EXCEPTION 'Moneda % no soportada para valorización de inventario. Usa PEN o USD.', v_moneda;
    END IF;
    SELECT fecha, usd, fuente INTO v_fecha_tipo_cambio, v_tc_usd, v_fuente_tipo_cambio
      FROM public.tipo_cambio_historico
     WHERE moneda_base = 'PEN' AND fecha <= current_date
     ORDER BY fecha DESC LIMIT 1;
    IF NOT FOUND OR v_tc_usd IS NULL OR v_tc_usd <= 0 THEN
      RAISE EXCEPTION 'No existe tipo de cambio PEN/USD para la fecha del movimiento ni una tasa anterior. Registra el tipo de cambio antes de continuar.';
    END IF;
    v_tipo_cambio_aplicado := 1 / v_tc_usd;
    v_costo_unitario_usd := coalesce(nullif(p_costo_unitario_usd, 0), p_costo_unitario, 0);
    v_costo_unitario := v_costo_unitario_usd * v_tipo_cambio_aplicado;
  END IF;

  SELECT * INTO v_stock FROM public.stock
   WHERE empresa_id = p_empresa_id AND material_id = p_material_id
     AND almacen_id = p_almacen_id AND ubicacion_id = v_ubicacion_id
     AND lote IS NOT DISTINCT FROM p_lote
     AND serie IS NOT DISTINCT FROM p_serie
     AND sociedad_id IS NOT DISTINCT FROM p_sociedad_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.stock (empresa_id, material_id, almacen_id, ubicacion_id, sociedad_id,
                              fisico, disponible, reservado, lote, serie, vencimiento)
    VALUES (p_empresa_id, p_material_id, p_almacen_id, v_ubicacion_id, p_sociedad_id,
            0, 0, 0, p_lote, p_serie, p_vencimiento)
    ON CONFLICT DO NOTHING;

    SELECT * INTO v_stock FROM public.stock
     WHERE empresa_id = p_empresa_id AND material_id = p_material_id
       AND almacen_id = p_almacen_id AND ubicacion_id = v_ubicacion_id
       AND lote IS NOT DISTINCT FROM p_lote
       AND serie IS NOT DISTINCT FROM p_serie
       AND sociedad_id IS NOT DISTINCT FROM p_sociedad_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo bloquear el stock del material.';
    END IF;
  END IF;

  v_stock_fisico := coalesce(v_stock.fisico, v_stock.disponible, 0);
  v_stock_disponible := coalesce(v_stock.disponible, 0);
  v_stock_reservado := coalesce(v_stock.reservado, 0);

  IF v_es_salida AND p_cantidad > v_stock_disponible THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %, solicitado: %', v_stock_disponible, p_cantidad;
  END IF;

  SELECT coalesce(m.costo_promedio, 0) INTO v_costo_actual
    FROM public.materiales m
   WHERE m.id = p_material_id AND m.empresa_id = p_empresa_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material inexistente o fuera de la empresa.';
  END IF;

  IF NOT p_skip_costo_promedio THEN
    IF v_es_entrada THEN
      IF p_cantidad > 0 THEN
        v_nuevo_costo_promedio :=
          ((v_stock_fisico * v_costo_actual) + (p_cantidad * v_costo_unitario))
          / (v_stock_fisico + p_cantidad);
      ELSE
        v_nuevo_costo_promedio := 0;
      END IF;
    ELSE
      v_nuevo_costo_promedio := v_costo_actual;
      v_costo_unitario := v_costo_actual;
    END IF;
  END IF;

  IF v_es_entrada THEN
    v_nuevo_fisico := v_stock_fisico + p_cantidad;
    v_nuevo_disponible := v_stock_disponible + p_cantidad;
  ELSIF v_es_salida THEN
    v_nuevo_fisico := greatest(0, v_stock_fisico - p_cantidad);
    v_nuevo_disponible := greatest(0, v_stock_disponible - p_cantidad);
  ELSE
    v_nuevo_fisico := greatest(0, v_stock_fisico + p_cantidad);
    v_nuevo_disponible := greatest(0, v_stock_disponible + p_cantidad);
  END IF;

  INSERT INTO public.kardex (
    id, empresa_id, material_id, almacen_id, ubicacion_id, sociedad_id, tipo, motivo,
    cantidad, costo_unitario, costo_total, costo_unitario_usd, costo_total_usd,
    moneda, tipo_cambio_aplicado, fecha_tipo_cambio, fuente_tipo_cambio,
    lote, serie, vencimiento, saldo_cantidad, referencia_tipo,
    referencia_id, nro_documento, proveedor_id, observacion, created_by,
    anulado, valorizacion_estado, orden_compra_id, orden_compra_item_idx,
    precio_unitario_provisional, precio_unitario_real, recepcion_id
  ) VALUES (
    p_kardex_id, p_empresa_id, p_material_id, p_almacen_id, v_ubicacion_id, p_sociedad_id,
    p_tipo, coalesce(p_motivo, p_tipo), p_cantidad, v_costo_unitario,
    v_costo_unitario * p_cantidad, v_costo_unitario_usd,
    v_costo_unitario_usd * p_cantidad, v_moneda,
    v_tipo_cambio_aplicado, v_fecha_tipo_cambio, v_fuente_tipo_cambio,
    p_lote, p_serie, p_vencimiento, v_nuevo_fisico, p_referencia_tipo,
    p_referencia_id, p_nro_documento, p_proveedor_id, p_observacion,
    p_usuario_id, false, coalesce(nullif(p_valorizacion_estado, ''), 'definitivo'),
    p_orden_compra_id, p_orden_compra_item_idx, p_precio_unitario_provisional,
    p_precio_unitario_real, p_recepcion_id
  );

  UPDATE public.stock
     SET fisico = v_nuevo_fisico, disponible = v_nuevo_disponible,
         reservado = v_stock_reservado, updated_at = now()
   WHERE id = v_stock.id;

  IF NOT p_skip_costo_promedio AND v_es_entrada THEN
    UPDATE public.materiales
       SET costo_promedio = v_nuevo_costo_promedio, updated_at = now()
     WHERE id = p_material_id;
  END IF;

  RETURN QUERY SELECT p_kardex_id, v_nuevo_fisico, v_nuevo_disponible, v_nuevo_costo_promedio;
END $$;

REVOKE ALL ON FUNCTION public.registrar_movimiento_atomico(
  text, text, text, text, uuid, text, text, numeric, numeric, numeric, text,
  text, text, date, text, text, text, text, text, uuid, text, text, integer,
  numeric, numeric, text, boolean, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento_atomico(
  text, text, text, text, uuid, text, text, numeric, numeric, numeric, text,
  text, text, date, text, text, text, text, text, uuid, text, text, integer,
  numeric, numeric, text, boolean, text
) TO authenticated, service_role;
