-- Extiende la derivacion societaria de ordenes de trabajo.
-- La OS Cliente actua como ultimo recurso despues de CECO y CEBE.

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

  IF NEW.os_cliente_id IS NOT NULL THEN
    SELECT os.sociedad_id
    INTO v_sociedad_os_id
    FROM public.os_clientes os
    WHERE os.id = NEW.os_cliente_id
      AND os.empresa_id = NEW.empresa_id;
  END IF;

  NEW.sociedad_id := coalesce(
    v_sociedad_ceco_id,
    v_sociedad_cebe_id,
    v_sociedad_os_id
  );

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
