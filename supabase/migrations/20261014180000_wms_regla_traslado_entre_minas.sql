-- WMS: el stock de un almacén periférico no puede enviarse directo a otro periférico de OTRA mina;
-- el flujo entre minas pasa por el almacén central. Cubre transferencias y liberaciones
-- (ambas registran transferencia_salida + transferencia_entrada con la misma referencia).
-- Permitido: central -> cualquier periférico, periférico -> central, periférico -> periférico de la misma mina.

CREATE OR REPLACE FUNCTION public.kardex_validar_traslado_entre_minas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_origen text;
  v_cl_o text; v_mi_o text;
  v_cl_d text; v_mi_d text;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'transferencia_entrada'
     OR NEW.referencia_tipo IS DISTINCT FROM 'transferencia' THEN
    RETURN NEW;
  END IF;

  SELECT k.almacen_id INTO v_origen
    FROM public.kardex k
   WHERE k.empresa_id = NEW.empresa_id
     AND k.referencia_tipo = 'transferencia'
     AND k.referencia_id = NEW.referencia_id
     AND k.tipo = 'transferencia_salida'
   LIMIT 1;
  IF v_origen IS NULL OR v_origen = NEW.almacen_id THEN
    RETURN NEW;
  END IF;

  SELECT a.clase, a.mina_id INTO v_cl_o, v_mi_o
    FROM public.almacenes a WHERE a.id = v_origen AND a.empresa_id = NEW.empresa_id;
  SELECT a.clase, a.mina_id INTO v_cl_d, v_mi_d
    FROM public.almacenes a WHERE a.id = NEW.almacen_id AND a.empresa_id = NEW.empresa_id;

  IF v_cl_o = 'periferico' AND v_cl_d = 'periferico' AND v_mi_o IS DISTINCT FROM v_mi_d THEN
    RAISE EXCEPTION 'El stock de un almacén periférico no se puede enviar directo a otra mina; devuélvelo primero al almacén central.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER kardex_traslado_entre_minas_trg
  BEFORE INSERT ON public.kardex
  FOR EACH ROW
  WHEN (NEW.tipo = 'transferencia_entrada')
  EXECUTE FUNCTION public.kardex_validar_traslado_entre_minas();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kardex_traslado_entre_minas_trg' AND tgrelid = 'public.kardex'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'No se creó el disparador de traslado entre minas.';
  END IF;
END $$;
