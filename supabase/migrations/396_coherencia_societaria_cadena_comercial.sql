-- Coherencia societaria de la cadena comercial.
-- La sociedad se deriva en base de datos y no es editable por el frontend.

ALTER TABLE public.os_clientes
  ADD COLUMN sociedad_id uuid DEFAULT NULL
  REFERENCES public.sociedades(id) ON DELETE SET NULL;

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN sociedad_id uuid DEFAULT NULL
  REFERENCES public.sociedades(id) ON DELETE SET NULL;

ALTER TABLE public.valorizaciones
  ADD COLUMN sociedad_id uuid DEFAULT NULL
  REFERENCES public.sociedades(id) ON DELETE SET NULL;

ALTER TABLE public.os_clientes
  ADD CONSTRAINT os_clientes_empresa_sociedad_fkey
  FOREIGN KEY (empresa_id, sociedad_id)
  REFERENCES public.sociedades(empresa_id, id);

ALTER TABLE public.ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_empresa_sociedad_fkey
  FOREIGN KEY (empresa_id, sociedad_id)
  REFERENCES public.sociedades(empresa_id, id);

ALTER TABLE public.valorizaciones
  ADD CONSTRAINT valorizaciones_empresa_sociedad_fkey
  FOREIGN KEY (empresa_id, sociedad_id)
  REFERENCES public.sociedades(empresa_id, id);

CREATE OR REPLACE FUNCTION public.derivar_sociedad_os_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sociedad_id uuid;
BEGIN
  v_sociedad_id := NULL;

  IF NEW.cotizacion_id IS NOT NULL THEN
    SELECT c.sociedad_id
    INTO v_sociedad_id
    FROM public.cotizaciones c
    WHERE c.id = NEW.cotizacion_id
      AND c.empresa_id = NEW.empresa_id;
  END IF;

  NEW.sociedad_id := v_sociedad_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.derivar_y_validar_sociedad_orden_trabajo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sociedad_ceco_id uuid;
  v_sociedad_cebe_id uuid;
  v_sociedad_os_id uuid;
  v_multisociedad_habilitado boolean;
  v_razon_social_ot text;
  v_razon_social_os text;
BEGIN
  v_sociedad_ceco_id := NULL;
  v_sociedad_cebe_id := NULL;
  v_sociedad_os_id := NULL;

  IF NEW.centro_costo_id IS NOT NULL THEN
    SELECT cc.sociedad_id
    INTO v_sociedad_ceco_id
    FROM public.centros_costo cc
    WHERE cc.id = NEW.centro_costo_id
      AND cc.empresa_id = NEW.empresa_id;
  END IF;

  IF NEW.centro_beneficio_id IS NOT NULL THEN
    SELECT cb.sociedad_id
    INTO v_sociedad_cebe_id
    FROM public.centros_beneficio cb
    WHERE cb.id = NEW.centro_beneficio_id
      AND cb.empresa_id = NEW.empresa_id;
  END IF;

  NEW.sociedad_id := coalesce(v_sociedad_ceco_id, v_sociedad_cebe_id);

  IF NEW.os_cliente_id IS NULL OR NEW.sociedad_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.multisociedad_habilitado
  INTO v_multisociedad_habilitado
  FROM public.empresas e
  WHERE e.id = NEW.empresa_id;

  IF NOT coalesce(v_multisociedad_habilitado, false) THEN
    RETURN NEW;
  END IF;

  SELECT os.sociedad_id
  INTO v_sociedad_os_id
  FROM public.os_clientes os
  WHERE os.id = NEW.os_cliente_id
    AND os.empresa_id = NEW.empresa_id;

  IF v_sociedad_os_id IS NULL OR NEW.sociedad_id = v_sociedad_os_id THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(btrim(s.razon_social), ''), s.nombre, 'Sociedad sin razon social')
  INTO v_razon_social_ot
  FROM public.sociedades s
  WHERE s.id = NEW.sociedad_id;

  SELECT coalesce(nullif(btrim(s.razon_social), ''), s.nombre, 'Sociedad sin razon social')
  INTO v_razon_social_os
  FROM public.sociedades s
  WHERE s.id = v_sociedad_os_id;

  RAISE EXCEPTION
    'La sociedad de la OT (%) difiere de la sociedad de la OS Cliente (%).',
    v_razon_social_ot,
    v_razon_social_os;
END;
$$;

CREATE OR REPLACE FUNCTION public.derivar_sociedad_valorizacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sociedad_id uuid;
BEGIN
  v_sociedad_id := NULL;

  IF NEW.os_cliente_id IS NOT NULL THEN
    SELECT os.sociedad_id
    INTO v_sociedad_id
    FROM public.os_clientes os
    WHERE os.id = NEW.os_cliente_id
      AND os.empresa_id = NEW.empresa_id;
  END IF;

  NEW.sociedad_id := v_sociedad_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_sociedad_factura_comercial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_multisociedad_habilitado boolean;
  v_sociedad_sustento_id uuid;
  v_razon_social_factura text;
  v_razon_social_sustento text;
BEGIN
  SELECT e.multisociedad_habilitado
  INTO v_multisociedad_habilitado
  FROM public.empresas e
  WHERE e.id = NEW.empresa_id;

  IF NOT coalesce(v_multisociedad_habilitado, false) OR NEW.sociedad_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(btrim(s.razon_social), ''), s.nombre, 'Sociedad sin razon social')
  INTO v_razon_social_factura
  FROM public.sociedades s
  WHERE s.id = NEW.sociedad_id;

  IF NEW.os_cliente_id IS NOT NULL THEN
    v_sociedad_sustento_id := NULL;

    SELECT os.sociedad_id
    INTO v_sociedad_sustento_id
    FROM public.os_clientes os
    WHERE os.id = NEW.os_cliente_id
      AND os.empresa_id = NEW.empresa_id;

    IF v_sociedad_sustento_id IS NOT NULL
       AND NEW.sociedad_id <> v_sociedad_sustento_id THEN
      SELECT coalesce(nullif(btrim(s.razon_social), ''), s.nombre, 'Sociedad sin razon social')
      INTO v_razon_social_sustento
      FROM public.sociedades s
      WHERE s.id = v_sociedad_sustento_id;

      RAISE EXCEPTION
        'La sociedad de la factura (%) difiere de la sociedad de su OS Cliente (%).',
        v_razon_social_factura,
        v_razon_social_sustento;
    END IF;
  END IF;

  IF NEW.valorizacion_id IS NOT NULL THEN
    v_sociedad_sustento_id := NULL;

    SELECT v.sociedad_id
    INTO v_sociedad_sustento_id
    FROM public.valorizaciones v
    WHERE v.id = NEW.valorizacion_id
      AND v.empresa_id = NEW.empresa_id;

    IF v_sociedad_sustento_id IS NOT NULL
       AND NEW.sociedad_id <> v_sociedad_sustento_id THEN
      SELECT coalesce(nullif(btrim(s.razon_social), ''), s.nombre, 'Sociedad sin razon social')
      INTO v_razon_social_sustento
      FROM public.sociedades s
      WHERE s.id = v_sociedad_sustento_id;

      RAISE EXCEPTION
        'La sociedad de la factura (%) difiere de la sociedad de su valorizacion (%).',
        v_razon_social_factura,
        v_razon_social_sustento;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_os_clientes_derivar_sociedad
BEFORE INSERT OR UPDATE ON public.os_clientes
FOR EACH ROW
EXECUTE FUNCTION public.derivar_sociedad_os_cliente();

CREATE TRIGGER trg_ordenes_trabajo_derivar_validar_sociedad
BEFORE INSERT OR UPDATE ON public.ordenes_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.derivar_y_validar_sociedad_orden_trabajo();

CREATE TRIGGER trg_valorizaciones_derivar_sociedad
BEFORE INSERT OR UPDATE ON public.valorizaciones
FOR EACH ROW
EXECUTE FUNCTION public.derivar_sociedad_valorizacion();

CREATE TRIGGER trg_facturas_validar_sociedad_comercial
BEFORE INSERT OR UPDATE ON public.facturas
FOR EACH ROW
EXECUTE FUNCTION public.validar_sociedad_factura_comercial();

-- Backfill: las mismas reglas de los triggers, aplicadas a todo el historial.
UPDATE public.os_clientes os
SET sociedad_id = (
  SELECT c.sociedad_id
  FROM public.cotizaciones c
  WHERE c.id = os.cotizacion_id
    AND c.empresa_id = os.empresa_id
);

UPDATE public.ordenes_trabajo ot
SET sociedad_id = coalesce(
  (
    SELECT cc.sociedad_id
    FROM public.centros_costo cc
    WHERE cc.id = ot.centro_costo_id
      AND cc.empresa_id = ot.empresa_id
  ),
  (
    SELECT cb.sociedad_id
    FROM public.centros_beneficio cb
    WHERE cb.id = ot.centro_beneficio_id
      AND cb.empresa_id = ot.empresa_id
  )
);

UPDATE public.valorizaciones v
SET sociedad_id = (
  SELECT os.sociedad_id
  FROM public.os_clientes os
  WHERE os.id = v.os_cliente_id
    AND os.empresa_id = v.empresa_id
);

DROP FUNCTION public.crear_ot_desde_os_cliente(
  text, text, text, text, text, text, text, date, text, text, numeric
);
