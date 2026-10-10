-- Permite medidas sin cota dibujada y mantiene overrides con la misma seguridad de la migración 619.
-- Ensayo SQL Editor: ejecutar todo el bloque y sustituir COMMIT por ROLLBACK.
BEGIN;

ALTER TABLE public.catalogo_componente_medidas
  ALTER COLUMN cota DROP NOT NULL;
ALTER TABLE public.catalogo_componente_medidas_overrides
  ALTER COLUMN cota DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.catalogo_componentes_guardar_override(
  p_empresa_id text, p_sociedad_id uuid, p_componente_id text, p_zona_id text, p_medida_id text,
  p_nombre text, p_cota text, p_desde text, p_referencia text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.catalogo_componentes_validar_contexto(p_empresa_id, p_sociedad_id, true);
  IF NOT EXISTS (SELECT 1 FROM public.catalogo_componente_medidas WHERE componente_id=p_componente_id AND zona_id=p_zona_id AND id=p_medida_id) THEN
    RAISE EXCEPTION 'La medida base no existe.' USING ERRCODE='22023';
  END IF;
  IF nullif(btrim(p_nombre),'') IS NULL THEN
    RAISE EXCEPTION 'El nombre es obligatorio.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.catalogo_componente_medidas_overrides (empresa_id,sociedad_id,componente_id,zona_id,medida_id,nombre,cota,desde,referencia)
  VALUES (p_empresa_id,p_sociedad_id,p_componente_id,p_zona_id,p_medida_id,btrim(p_nombre),nullif(btrim(p_cota),''),nullif(btrim(p_desde),''),nullif(btrim(p_referencia),''))
  ON CONFLICT (empresa_id, (coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid)), componente_id, zona_id, medida_id)
  DO UPDATE SET nombre=EXCLUDED.nombre,cota=EXCLUDED.cota,desde=EXCLUDED.desde,referencia=EXCLUDED.referencia,updated_at=now();
END $$;

REVOKE ALL ON FUNCTION public.catalogo_componentes_guardar_override(text, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_componentes_guardar_override(text, uuid, text, text, text, text, text, text, text) TO authenticated;

DO $$ BEGIN
  ASSERT (SELECT is_nullable = 'YES' FROM information_schema.columns WHERE table_schema='public' AND table_name='catalogo_componente_medidas' AND column_name='cota'), 'catalogo_componente_medidas.cota debe aceptar NULL';
  ASSERT (SELECT is_nullable = 'YES' FROM information_schema.columns WHERE table_schema='public' AND table_name='catalogo_componente_medidas_overrides' AND column_name='cota'), 'catalogo_componente_medidas_overrides.cota debe aceptar NULL';
  ASSERT has_function_privilege('authenticated', 'public.catalogo_componentes_guardar_override(text,uuid,text,text,text,text,text,text,text)', 'EXECUTE'), 'Falta RPC de guardado para authenticated';
END $$;

COMMIT;
