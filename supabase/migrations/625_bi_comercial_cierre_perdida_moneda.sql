-- BI Comercial: fecha de cierre al perder una oportunidad y moneda "$" normalizada a USD.
CREATE OR REPLACE FUNCTION public.oportunidades_normalizar_cierre_moneda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.moneda IS NOT NULL AND btrim(NEW.moneda) = '$' THEN
    NEW.moneda := 'USD';
  END IF;
  IF NEW.estado = 'perdida' AND NEW.fecha_cierre_real IS NULL THEN
    NEW.fecha_cierre_real := (now() AT TIME ZONE 'America/Lima')::date;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS oportunidades_normalizar_cierre_moneda ON public.oportunidades;
CREATE TRIGGER oportunidades_normalizar_cierre_moneda
BEFORE INSERT OR UPDATE OF estado, fecha_cierre_real, moneda ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.oportunidades_normalizar_cierre_moneda();

-- Relleno acotado: 4 perdidas existentes sin fecha de cierre (usan su fecha de ultima actualizacion)
UPDATE public.oportunidades
SET fecha_cierre_real = (updated_at AT TIME ZONE 'America/Lima')::date
WHERE estado = 'perdida'
  AND fecha_cierre_real IS NULL
  AND id IN ('opp_332015','opp_455772','opp_858830','opp_598125');

-- Normalizacion acotada de moneda: 10 oportunidades de emp_20541435833
UPDATE public.oportunidades
SET moneda = 'USD'
WHERE moneda = '$'
  AND empresa_id = 'emp_20541435833'
  AND id IN ('opp_437996','opp_366829','opp_105194','opp_918359','opp_554354','opp_165410','opp_904670','opp_286504','opp_336713','opp_467718');

DO $chk$
DECLARE v_perd int; v_mon int; v_trg int;
BEGIN
  SELECT count(*) INTO v_perd FROM public.oportunidades WHERE estado='perdida' AND fecha_cierre_real IS NULL;
  SELECT count(*) INTO v_mon FROM public.oportunidades WHERE btrim(moneda)='$';
  SELECT count(*) INTO v_trg FROM pg_trigger WHERE tgrelid='public.oportunidades'::regclass AND tgname='oportunidades_normalizar_cierre_moneda';
  IF v_perd <> 0 THEN RAISE EXCEPTION 'Quedan % perdidas sin fecha de cierre', v_perd; END IF;
  IF v_mon <> 0 THEN RAISE EXCEPTION 'Quedan % oportunidades con moneda $', v_mon; END IF;
  IF v_trg <> 1 THEN RAISE EXCEPTION 'Trigger no creado'; END IF;
END
$chk$;
